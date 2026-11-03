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
import { structuralEqual } from './equality.js';
import { SAFE_TAGS, ThemeClient, type Connect, type EventInfo, type Out, type OutProps, type ThemeError } from './host.js';
import { createRuntime, type ComponentClass } from './runtime.js';
import type { EventCatalog, EventName, ThemeStore } from './types.js';

// --- Connecting a theme to the app ---

/** A theme's classes: its pages, and the layout around them. */
export interface ThemeSource {
  readonly pages: Readonly<Record<string, ComponentClass>>;
  readonly layout?: ComponentClass;
}

/** What a theme runtime starts from, for a connection of the app's own (the worker sandbox). */
export interface RuntimeSetup {
  readonly theme: ThemeSource;
  readonly events: Readonly<Record<string, EventInfo>>;
  readonly state: object;
}

/** The theme runs in the app's own thread. */
export function connectInThread({ theme, events, state }: RuntimeSetup): Connect {
  return (deliver) => {
    const runtime = createRuntime({ pages: theme.pages, layout: theme.layout, events, state, post: deliver });
    return { send: (message) => runtime.receive(message), close: () => runtime.dispose() };
  };
}

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
  /** How to reach the theme runtime; in this thread by default. */
  connect?(setup: RuntimeSetup): Connect;
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
      connect: (config.connect ?? connectInThread)({ theme, events: config.events, state }),
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

    // Before paint, so the theme's part of the screen changes with the rest; only when the data really changed.
    const sent = useRef(state);
    useLayoutEffect(() => {
      if (structuralEqual(sent.current, state)) return;
      sent.current = state;
      handle.client.setState(state);
    });

    useEffect(() => () => handle.client.close(), [handle]);

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
      createElement(ThemeClientProvider, { client: handle.client, components: config.components }, children)
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
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** The names to allow in the client's policy: exactly the components there are. */
export function hostNames(components: HostComponents): ReadonlySet<string> {
  return new Set(Object.keys(components));
}

/** The low-level provider, for an app that makes its own ThemeClient; createThemeApp() uses it. */
export function ThemeClientProvider({ client, components, children }: { client: ThemeClient; components: HostComponents; children?: ReactNode }) {
  const value = useMemo(() => ({ client, components }), [client, components]);
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
 * Shows a page of the theme while it's mounted, in place of the view a route
 * used to render. If the page fails, `fallback` shows instead, so the screen
 * is never empty; a failing slot falls back to its base version on its own.
 */
export function ThemePage({ page, params, fallback = null }: { page: string; params?: Readonly<Record<string, unknown>>; fallback?: ReactNode }) {
  const { client } = useThemeContext();
  const [failed, setFailed] = useState(false);
  const readRoot = useCallback(() => client.tree.root, [client]);
  const root = useSyncExternalStore(client.subscribe, readRoot, readRoot);
  const key = JSON.stringify(params ?? {});
  const latestParams = useRef(params);
  latestParams.current = params;

  const shownKey = useRef(key);

  useLayoutEffect(() => {
    setFailed(false);
    shownKey.current = key;
    const stop = client.onError((error) => {
      if (error.where === 'page') setFailed(true);
    });
    client.showPage(page, latestParams.current);
    return () => {
      stop();
      client.showPage(null);
    };
  }, [client, page]);

  // The same page with new parameters: it updates in place, without leaving.
  useLayoutEffect(() => {
    if (shownKey.current === key) return;
    shownKey.current = key;
    setFailed(false);
    client.showPage(page, latestParams.current);
  }, [client, page, key]);

  if (failed) return createElement(Fragment, null, fallback);
  return createElement(Fragment, null, createElement(ThemeStyles), root ? createElement(ThemeUnit, { id: root }) : null);
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
  const read = useCallback(() => context.client.tree.unit(id), [context, id]);
  const nodes = useSyncExternalStore(context.client.subscribe, read, read);
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
      // Events, elements and anything else that isn't data stay on the app's side.
      out[key] = (...args: unknown[]) => client.invoke(fn, args.map((arg) => (isPlainData(arg) ? arg : undefined)));
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
