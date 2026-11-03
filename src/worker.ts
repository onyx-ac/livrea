/**
 * The theme's side of the sandbox: a dedicated worker runs the theme, with no
 * DOM, no app state but what the app sends, and nothing of the app's to call.
 * The app reaches it with `connectWorker()` from livrea/host.
 *
 *   // theme.worker.ts
 *   import { serveRuntime } from 'livrea/worker';
 *   serveRuntime({ theme: async () => (await import('./my-theme')).THEME, block: { storage: true } });
 */
import type { AppMessage, FromWorker, ToWorker } from './protocol.js';
import { createRuntime, type Runtime, type RuntimeOptions, type ThemeSource } from './runtime.js';

/** Which of the worker's globals themes don't get. Nothing is blocked by default: it's the app's policy. */
export interface Blocked {
  /** fetch, XMLHttpRequest, WebSocket, EventSource, WebTransport, importScripts. `import()` can't be taken away: the app's CSP decides where code loads from. */
  readonly network?: boolean;
  /** indexedDB and caches: what a theme keeps would outlast the guest who caused it. */
  readonly storage?: boolean;
  /** Worker, SharedWorker and BroadcastChannel: other threads, and talking to them. */
  readonly workers?: boolean;
}

export interface ServeOptions {
  /**
   * The theme. Given as a function, it's loaded once the globals are blocked,
   * so even its top-level code never sees them; it starts loading at once,
   * while the app is still rendering.
   */
  readonly theme: ThemeSource | (() => ThemeSource | Promise<ThemeSource>);
  readonly block?: Blocked;
  /** Functions next to the state, such as `s.items(type)`. */
  readonly helpers?: RuntimeOptions['helpers'];
}

const GLOBALS: Readonly<Record<keyof Blocked, readonly string[]>> = {
  network: ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'WebTransport', 'importScripts'],
  storage: ['indexedDB', 'caches'],
  workers: ['Worker', 'SharedWorker', 'BroadcastChannel']
};

/**
 * Takes these globals away for good: from the global object and from every
 * prototype it inherits them from (`fetch` lives on WorkerGlobalScope's), so
 * no `delete` or `Object.getPrototypeOf(self).fetch` brings them back.
 */
export function block(blocked: Blocked, scope: object = globalThis): void {
  for (const [group, names] of Object.entries(GLOBALS) as [keyof Blocked, readonly string[]][]) {
    if (!blocked[group]) continue;
    for (const name of names) {
      const gone = () => {
        throw new Error(`${name} isn't available to themes.`);
      };
      const value = group === 'storage' ? undefined : gone;
      for (let target: object | null = scope; target; target = Object.getPrototypeOf(target)) {
        if (Object.hasOwn(target, name)) Object.defineProperty(target, name, { value, writable: false, configurable: false });
      }
      if (!Object.hasOwn(scope, name)) Object.defineProperty(scope, name, { value, writable: false, configurable: false });
    }
  }
}

interface WorkerScope {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage(message: FromWorker): void;
}

/** Runs in the worker: blocks what the app said, loads the theme, and serves the app's connection. */
export function serveRuntime(options: ServeOptions, scope: WorkerScope = globalThis as unknown as WorkerScope): void {
  block(options.block ?? {});
  const theme = options.theme;
  const loading = Promise.resolve().then(() => (typeof theme === 'function' ? theme() : theme));
  // Loaded or not, it isn't a crash of the worker: the app hears of it on start.
  loading.catch(() => {});
  let runtime: Runtime | null = null;
  // What arrives while the theme loads, in order.
  const waiting: AppMessage[] = [];

  scope.onmessage = (event) => {
    const message = event.data as ToWorker;
    switch (message.kind) {
      case 'ping':
        // Answered even while the theme loads: only a worker that's stuck doesn't.
        scope.postMessage({ kind: 'pong', n: message.n });
        return;
      case 'start':
        loading.then(
          (source) => {
            runtime = createRuntime({
              pages: source.pages,
              layout: source.layout,
              events: message.events,
              state: message.state,
              page: message.page,
              helpers: options.helpers,
              post: (out) => scope.postMessage(out)
            });
            for (const next of waiting.splice(0)) runtime.receive(next);
          },
          (error: unknown) => scope.postMessage({ kind: 'error', where: 'load', message: String(error) })
        );
        return;
      default:
        if (runtime) runtime.receive(message);
        else waiting.push(message);
    }
  };
}
