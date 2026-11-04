/**
 * The app's end of the worker sandbox (the theme's is `serveRuntime`, in
 * livrea/worker). The first worker starts as soon as this is called, while
 * the app is still rendering: by the time the app has its state, the theme
 * has loaded. A watchdog checks the worker still answers; one that doesn't,
 * or crashes before it starts, is reported lost, and the client starts a new
 * one with the state and page as they are then.
 */
import type { Connect, RuntimeSetup } from './host.js';
import type { ToWorker } from './protocol.js';
import { isRecord } from './store.js';

/** The part of a Worker this uses; tests pass their own. */
export interface WorkerLike {
  postMessage(message: ToWorker): void;
  terminate(): void;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
}

export interface WorkerOptions {
  /** How often the watchdog asks, and how long the theme may take to answer before it's restarted; 1 s and 3 s by default. `false`: no watchdog. */
  readonly watchdog?: { readonly everyMs: number; readonly timeoutMs: number } | false;
  /** Starts the first worker at once instead of when the app first connects; on by default. */
  readonly early?: boolean;
}

/** `connect` for createThemeApp: the theme runs in a dedicated worker. `create` makes one: `() => new Worker(new URL('./theme.worker.ts', import.meta.url), { type: 'module' })`. */
export function connectWorker(create: () => WorkerLike, options: WorkerOptions = {}): (setup: RuntimeSetup) => Connect {
  let spare: WorkerLike | null = options.early === false || typeof Worker === 'undefined' ? null : create();
  const watchdog = options.watchdog ?? { everyMs: 1000, timeoutMs: 3000 };

  return ({ events }) =>
    (deliver, { state, page, lost }) => {
      const worker = spare ?? create();
      spare = null;
      let started = false;
      let closed = false;
      let asked = 0;
      let answered = 0;
      let askedAt = 0;

      const stop = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        worker.terminate();
      };
      const fail = (reason: string) => {
        if (closed) return;
        stop();
        lost(reason);
      };

      worker.onmessage = (event) => {
        const message: unknown = event.data;
        if (isRecord(message) && message.kind === 'pong') {
          if (typeof message.n === 'number') answered = message.n;
          return;
        }
        if (isRecord(message) && message.kind === 'tree') started = true;
        deliver(message);
        // The theme couldn't load: another try may do (a file still being written), the client counts them.
        if (isRecord(message) && message.kind === 'error' && message.where === 'load') fail(`it didn't load (${String(message.message)})`);
      };
      worker.onerror = (event) => {
        event.preventDefault?.();
        deliver({ kind: 'error', where: 'worker', message: event.message });
        // An error once running is the theme's own (a timer of its own that throws), reported and survived.
        if (!started) fail(`it crashed while starting (${event.message})`);
      };

      const timer = watchdog
        ? setInterval(() => {
            if (answered < asked) {
              if (Date.now() - askedAt >= watchdog.timeoutMs) fail(`it didn't answer for ${watchdog.timeoutMs} ms`);
              return;
            }
            asked++;
            askedAt = Date.now();
            worker.postMessage({ kind: 'ping', n: asked });
          }, watchdog.everyMs)
        : undefined;

      worker.postMessage({ kind: 'start', events, state, page });
      return { send: (message) => !closed && worker.postMessage(message), close: stop };
    };
}
