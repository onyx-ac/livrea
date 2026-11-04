/**
 * Themes in a React app. `createThemeApp(config)` connects a theme to the app
 * and returns its provider and hook: the app describes what the theme reads,
 * which of its changes are events and what themes may ask, and the engine
 * does the rest. `ThemePage` shows a page; the rest of this module renders
 * what the theme sent, unit by unit, with the app's components behind
 * `hostComponent()`s.
 */
import {
  createContext,
  createElement,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type ReactNode
} from 'react';
import { SAFE_TAGS, ThemeClient, type Connect, type EventInfo, type Out, type OutProps, type RuntimeSetup, type ThemeError } from './host.js';
import { createRuntime, diffState, type ThemeSource } from './runtime.js';
import type { EventCatalog, EventName, ThemeStore } from './types.js';
export type { RuntimeSetup } from './host.js';
export type { ThemeSource } from './runtime.js';

// --- Connecting a theme to the app ---

/** The theme runs in the app's own thread. */
export function connectInThread({ theme, events }: RuntimeSetup): Connect {
  return (deliver, { state, page }) => {
    const runtime = createRuntime({ pages: theme.pages, layout: theme.layout, settings: theme.settings, events, state, page, post: deliver });
    return { send: (message) => runtime.receive(message), close: () => runtime.dispose() };
  };
}

/** Errors after which the theme shows nothing at all: its frame failed, it didn't start, or it was stopped after too many restarts. */
const THEME_FAILURES = new Set(['layout', 'start', 'runtime']);

/** The running theme, as the app's code reaches it with useTheme(). */
export interface ThemeHandle {
  /** Sends an event of the catalog; resolves with whether a listener prevented it. */
  emit<K extends EventName>(name: K, payload: EventCatalog[K]): Promise<boolean>;
  readonly client: ThemeClient;
}

/** Carries out an action a theme asked for. `args` come from the theme: check them first. */
export type ActionHandler<App> = (app: App, args: readonly unknown[], theme: ThemeHandle) => void | Promise<void>;

/** For each event the app's changes raise: given the app now and before, its payload, or undefined for no event. */
export type ChangeEvents<App> = { readonly [K in EventName]?: (app: App, before: App) => EventCatalog[K] | undefined };

export interface ThemeAppConfig<App> {
  /** The theme's pages (and layout). */
  theme: ThemeSource;
  /** The app's event catalog: how each event behaves. */
  events: Readonly<Record<string, EventInfo>>;
  /** The app's components, by the names themes place them by. */
  components: HostComponents;
  /** Which addresses themes may load, in an image's src or in CSS; none by default. */
  allowUrl?: (address: string, where: 'src' | 'css') => boolean;
  /** Reads what the theme needs from the app, with the app's hooks: the one hook to write. */
  useApp(): App;
  /** The store themes read, from what useApp returned. Plain data: the engine works out what changed. */
  store(app: App): ThemeStore;
  /** Which of the app's changes are events. */
  changes?: ChangeEvents<App>;
  /** What themes may ask the app to do. */
  actions?: Readonly<Record<string, ActionHandler<App>>>;
  /** Where problems go; the console by default. */
  onError?(error: ThemeError): void;
  onTrack?(name: string): void;
  /** How to reach the theme runtime; in this thread by default, or `connectWorker(…)` from livrea/host for the sandbox. */
  connect?(setup: RuntimeSetup): Connect;
  /** How often a theme that crashed or stopped answering is started again; see ThemeClientOptions. */
  restarts?: { readonly max: number; readonly withinMs: number };
  /** How long the theme may take to start before the fallbacks show; 5 s by default. */
  startTimeoutMs?: number;
}

export interface ThemeApp {
  /**
   * Runs the theme for everything inside it; ThemePage shows its pages.
   * `theme` replaces the configured one, as a preview or a preset's theme
   * does; it's read when the provider starts.
   */
  ThemeProvider(props: { theme?: ThemeSource; children?: ReactNode }): ReactNode;
  /** The running theme, for the app's own code: `useTheme().emit('session:end', …)`. */
  useTheme(): ThemeHandle;
}

/**
 * Connects a theme to the app. The app describes the theme's side of it; the
 * returned provider runs the theme, keeps its store in step with the app,
 * sends the app's changes as events and carries out the actions it allows.
 */
export function createThemeApp<App>(config: ThemeAppConfig<App>): ThemeApp {
  const HandleContext = createContext<ThemeHandle | null>(null);
  const policy = { tags: SAFE_TAGS, hosts: hostNames(config.components), url: config.allowUrl ?? (() => false) };
  const reportError = config.onError ?? ((error: ThemeError) => console.error(`[theme] ${error.where}: ${error.message}`));

  function start(theme: ThemeSource, state: ThemeStore, latestApp: { readonly current: App }): ThemeHandle {
    const handle = {} as { client: ThemeClient; emit: ThemeHandle['emit'] };
    handle.client = new ThemeClient({
      connect: (config.connect ?? connectInThread)({ theme, events: config.events }),
      state,
      restarts: config.restarts,
      startTimeoutMs: config.startTimeoutMs,
      // Opened when the provider mounts, not while it renders: a render React throws away opens nothing.
      lazy: true,
      policy,
      events: config.events,
      onAction(name, args) {
        const action = config.actions?.[name];
        if (!action) throw new Error(`The app has no action "${name}".`);
        return action(latestApp.current, args, handle);
      },
      onTrack: config.onTrack
    });
    handle.client.onError(reportError);
    handle.emit = (name, payload) => handle.client.emit(name, payload);
    return handle;
  }

  function ThemeProvider({ theme = config.theme, children }: { theme?: ThemeSource; children?: ReactNode }): ReactNode {
    const app = config.useApp();
    const state = config.store(app);
    const latestApp = useRef(app);
    latestApp.current = app;
    const [handle] = useState(() => start(theme, state, latestApp));

    // Before paint, so the theme's part of the screen changes with the rest. Only what changed is sent: the
    // theme keeps everything else as it was, so nothing that reads it renders again.
    const sent = useRef(state);
    useLayoutEffect(() => {
      const patches = diffState(sent.current, state);
      if (!patches.length) return;
      sent.current = state;
      handle.client.patchState(patches);
    });

    // Opened as the provider mounts, before paint. A theme in this thread has sent its tree by then: `opened`
    // renders what shows it again at once, so it's on the first frame.
    // Closed once the provider is really gone. StrictMode unmounts and mounts again at once in development:
    // the close waits a tick, and a mount in between cancels it, so the same client keeps running.
    const [opened, setOpened] = useState(false);
    const closing = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    useLayoutEffect(() => {
      clearTimeout(closing.current);
      handle.client.open();
      setOpened(true);
      return () => {
        closing.current = setTimeout(() => handle.client.close(), 0);
      };
    }, [handle]);

    const before = useRef(app);
    useEffect(() => {
      const previous = before.current;
      before.current = app;
      if (previous === app || !config.changes) return;
      for (const [name, change] of Object.entries(config.changes)) {
        const payload = (change as ((now: App, then: App) => unknown) | undefined)?.(app, previous);
        if (payload !== undefined) void handle.client.emit(name as EventName, payload as never);
      }
    });

    return createElement(
      HandleContext.Provider,
      { value: handle },
      createElement(ThemeClientProvider, { client: handle.client, components: config.components, opened }, children)
    );
  }

  function useTheme(): ThemeHandle {
    const handle = useContext(HandleContext);
    if (!handle) throw new Error('useTheme() must be inside its ThemeProvider.');
    return handle;
  }

  return { ThemeProvider, useTheme };
}

// --- Rendering ---

/** What an app component receives: the theme's props, checked as plain data, with function references turned into callbacks. */
export type HostComponentProps = Readonly<Record<string, unknown>> & { children?: ReactNode };

/** The app's components, by the names themes place them by. */
export type HostComponents = Readonly<Record<string, ComponentType<HostComponentProps>>>;

interface ThemeContextValue {
  readonly client: ThemeClient;
  readonly components: HostComponents;
  readonly frame: Frame;
}

/**
 * What a ThemeRoot shares with the ThemePages under it: whether it renders the
 * tree (so pages only say which page shows), whether the layout failed, and
 * the current page's fallback, shown in the layout's outlet if the page fails.
 */
class Frame {
  rooted = false;
  failed = false;
  page: { readonly owner: object; readonly fallback: ReactNode; failed: boolean } | null = null;
  version = 0;
  readonly #listeners = new Set<() => void>();

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  readonly read = (): number => this.version;

  changed(): void {
    this.version++;
    for (const listener of [...this.#listeners]) listener();
  }
}

function useFrame(frame: Frame): Frame {
  useSyncExternalStore(frame.subscribe, frame.read, frame.read);
  return frame;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** The names to allow in the client's policy: exactly the components there are. */
export function hostNames(components: HostComponents): ReadonlySet<string> {
  return new Set(Object.keys(components));
}

/** The low-level provider, for an app that makes its own ThemeClient; createThemeApp() uses it. */
export function ThemeClientProvider({
  client,
  components,
  opened,
  children
}: {
  client: ThemeClient;
  components: HostComponents;
  /** For a `lazy` client: set when it has opened, so what shows the theme renders again with what it sent. */
  opened?: boolean;
  children?: ReactNode;
}) {
  const [frame] = useState(() => new Frame());
  // `opened` isn't read: it changes the value on purpose, so everything that reads the context renders again.
  const value = useMemo(() => ({ client, components, frame }), [client, components, frame, opened]);
  return createElement(ThemeContext.Provider, { value }, children);
}

export function useThemeClient(): ThemeClient {
  return useThemeContext().client;
}

function useThemeContext(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('Theme pages must be inside the ThemeProvider from createThemeApp().');
  return value;
}

/**
 * Renders the theme's whole tree, layout included, for as long as it's
 * mounted: the frame around pages (and anything in it, such as an avatar)
 * stays put while ThemePages come and go. `children` is what chooses the page,
 * the app's routes with their ThemePages: under the root they render nothing.
 * If the layout fails, `fallback` shows instead; given as a function, it gets
 * the children to place, and the ThemePages then show their own fallbacks.
 * So does a theme that doesn't start in time, or keeps crashing. While the
 * theme starts (in a worker, a fraction of a second), `pending` shows.
 */
export function ThemeRoot({
  fallback = null,
  pending = null,
  children
}: {
  fallback?: ReactNode | ((children: ReactNode) => ReactNode);
  pending?: ReactNode;
  children?: ReactNode;
}) {
  const { client, frame } = useThemeContext();
  useFrame(frame);
  const readRoot = useCallback(() => client.tree.root, [client]);
  const root = useSyncExternalStore(client.subscribe, readRoot, readRoot);

  useLayoutEffect(() => {
    frame.rooted = true;
    // A layout fails as the theme starts, before anything listens.
    frame.failed = [...THEME_FAILURES].some((where) => client.hasFailed(where));
    frame.changed();
    const stop = client.onError((error) => {
      if (!THEME_FAILURES.has(error.where)) return;
      frame.failed = true;
      frame.changed();
    });
    return () => {
      stop();
      frame.rooted = false;
      frame.changed();
    };
  }, [client, frame]);

  if (frame.failed) return createElement(Fragment, null, typeof fallback === 'function' ? fallback(children) : fallback, typeof fallback === 'function' ? null : children);
  // Until the theme's first tree: `pending`, such as the app's own splash. The pages are mounted all along, so the theme knows which to show.
  return createElement(Fragment, null, createElement(ThemeStyles), root ? createElement(ThemeUnit, { id: root }) : pending, children);
}

/**
 * Shows a page of the theme while it's mounted, in place of the view a route
 * used to render. If the page fails, `fallback` shows instead, so the screen
 * is never empty; a failing slot falls back to its base version on its own.
 * Under a ThemeRoot it renders nothing itself: the page shows in the layout's
 * outlet, and so does its fallback.
 */
export function ThemePage({ page, params, fallback = null }: { page: string; params?: Readonly<Record<string, unknown>>; fallback?: ReactNode }) {
  const { client, frame } = useThemeContext();
  useFrame(frame);
  const [failed, setFailed] = useState(false);
  const [owner] = useState(() => ({}));
  // On its own, the page shows without the layout: the frame is ThemeRoot's.
  const readOutlet = useCallback(() => client.tree.outlet, [client]);
  const outlet = useSyncExternalStore(client.subscribe, readOutlet, readOutlet);
  const key = JSON.stringify(params ?? {});
  const latestParams = useRef(params);
  latestParams.current = params;

  const shownKey = useRef(key);

  // Under a ThemeRoot, the fallback shows in the outlet: it's registered with the frame.
  const latestFallback = useRef(fallback);
  latestFallback.current = fallback;
  const fail = useCallback(
    (value: boolean) => {
      setFailed(value);
      if (frame.page?.owner !== owner || frame.page.failed === value) return;
      frame.page.failed = value;
      frame.changed();
    },
    [frame, owner]
  );

  useLayoutEffect(() => {
    frame.page = { owner, fallback: latestFallback.current, failed: false };
    frame.changed();
    return () => {
      if (frame.page?.owner !== owner) return;
      frame.page = null;
      frame.changed();
    };
  }, [frame, owner]);

  useLayoutEffect(() => {
    fail(false);
    shownKey.current = key;
    if ([...THEME_FAILURES].some((where) => client.hasFailed(where))) fail(true);
    const stop = client.onError((error) => {
      if (error.where === 'page' || THEME_FAILURES.has(error.where)) fail(true);
    });
    client.showPage(page, latestParams.current);
    return () => {
      stop();
      client.showPage(null);
    };
  }, [client, page, fail]);

  // The same page with new parameters: it updates in place, without leaving.
  useLayoutEffect(() => {
    if (shownKey.current === key) return;
    shownKey.current = key;
    fail(false);
    client.showPage(page, latestParams.current);
  }, [client, page, key, fail]);

  if (frame.rooted && !frame.failed) return null;
  if (failed || frame.failed) return createElement(Fragment, null, fallback);
  return createElement(Fragment, null, createElement(ThemeStyles), outlet ? createElement(ThemeUnit, { id: outlet }) : null);
}

/** The theme's styles, checked; nothing when it has none. */
export function ThemeStyles() {
  const { client } = useThemeContext();
  const readStyles = useCallback(() => client.tree.styles, [client]);
  const styles = useSyncExternalStore(client.subscribe, readStyles, readStyles);
  return createElement(
    Fragment,
    null,
    [...styles].map(([id, css]) => createElement('style', { key: id, 'data-theme-styles': id }, css))
  );
}

/** One unit of the tree; it re-renders only when the theme sends that unit again. */
export function ThemeUnit({ id }: { id: string }) {
  const context = useThemeContext();
  const frame = useFrame(context.frame);
  const read = useCallback(() => context.client.tree.unit(id), [context, id]);
  const nodes = useSyncExternalStore(context.client.subscribe, read, read);
  // The current page failed: its fallback shows where pages show.
  if (frame.rooted && frame.page?.failed && id === context.client.tree.outlet) return createElement(Fragment, null, frame.page.fallback);
  if (!nodes) return null;
  return createElement(Fragment, null, ...nodes.map((node, index) => renderNode(node, index, context)));
}

function renderNode(node: Out, index: number, context: ThemeContextValue): ReactNode {
  if (typeof node === 'string') return node;
  switch (node.t) {
    case 'u':
      return createElement(ThemeUnit, { key: `u:${node.id}`, id: node.id });
    case 'e': {
      const children = node.c.map((child, i) => renderNode(child, i, context));
      // Void elements (img, br, hr) take no children at all.
      return createElement(node.tag, { key: reactKey(node.k, index), ...node.props }, ...(children.length ? [children] : []));
    }
    case 'h': {
      const Host = context.components[node.name];
      if (!Host) return null;
      const children = node.c.map((child, i) => renderNode(child, i, context));
      return createElement(Host, { key: reactKey(node.k, index), ...withCallbacks(node.props, context.client) }, ...(children.length ? [children] : []));
    }
  }
}

/** The theme's key, or the position for unkeyed siblings; prefixed so the two never clash. */
function reactKey(key: string | number | undefined, index: number): string {
  return key === undefined ? `i${index}` : `k${key}`;
}

/** Turns `{ $fn: id }` references into callbacks into the theme, passing plain data only. */
function withCallbacks(props: OutProps, client: ThemeClient): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (value !== null && typeof value === 'object' && '$fn' in value) {
      const fn = (value as { $fn: number }).$fn;
      // The run it came from: after a restart the same id is another function, so an old callback must do nothing.
      const run = client.run;
      // Events, elements and anything else that isn't data stay on the app's side.
      out[key] = (...args: unknown[]) => client.invoke(fn, args.map((arg) => (isPlainData(arg) ? arg : undefined)), run);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function isPlainData(value: unknown): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isPlainData);
  if (typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return false;
  return Object.values(value).every(isPlainData);
}

/**
 * Reading an app component's props, which come from theme code: each value is
 * checked, and anything unexpected becomes the fallback.
 */
export const read = {
  text: (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback),
  optionalText: (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined),
  flag: (value: unknown, fallback = false): boolean => (typeof value === 'boolean' ? value : fallback),
  number: (value: unknown, fallback = 0): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback),
  oneOf: <const T extends string>(value: unknown, allowed: readonly T[], fallback: NoInfer<T>): T =>
    allowed.includes(value as T) ? (value as T) : fallback,
  callback:
    (value: unknown): ((...args: unknown[]) => void) =>
    (...args) => {
      if (typeof value === 'function') value(...args);
    }
};
