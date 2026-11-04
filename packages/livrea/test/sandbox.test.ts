import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectWorker, ThemeClient, type ThemeError, type WorkerLike } from '../src/host.js';
import type { ThemeSource } from '../src/runtime.js';
import { block, importTheme, serveRuntime } from '../src/worker.js';
import { Component } from '../src/index.js';
import { HomePage } from './base.js';
import { EVENTS, POLICY, STATE } from './harness.js';

/**
 * A worker in this thread: serveRuntime on one side, the app's end on the
 * other, with every message copied and delivered later, as a real worker's.
 * A stuck one takes messages and never answers.
 */
function fakeWorker(theme: ServeTheme) {
  const control = { stuck: false, terminated: false };
  const worker: WorkerLike = {
    onmessage: null,
    onerror: null,
    postMessage(message) {
      if (control.stuck || control.terminated) return;
      const copy = structuredClone(message);
      queueMicrotask(() => scope.onmessage?.({ data: copy } as MessageEvent));
    },
    terminate() {
      control.terminated = true;
    }
  };
  const scope = {
    onmessage: null as ((event: MessageEvent) => void) | null,
    postMessage(message: unknown) {
      if (control.terminated) return;
      const copy = structuredClone(message);
      queueMicrotask(() => worker.onmessage?.({ data: copy } as MessageEvent));
    }
  };
  serveRuntime({ theme }, scope);
  return { worker, control };
}

type ServeTheme = Parameters<typeof serveRuntime>[0]['theme'];

const THEME: ThemeSource = { pages: { home: HomePage } };

function sandbox(theme: ServeTheme = THEME, options: Partial<ConstructorParameters<typeof ThemeClient>[0]> = {}) {
  const workers: ReturnType<typeof fakeWorker>[] = [];
  const actions: unknown[][] = [];
  const errors: ThemeError[] = [];
  const connect = connectWorker(() => {
    const made = fakeWorker(theme);
    workers.push(made);
    return made.worker;
  })({ theme: THEME, events: EVENTS! });
  const client = new ThemeClient({ connect, state: STATE, policy: POLICY, events: EVENTS!, onAction: (name, args) => actions.push([name, ...args]), ...options });
  client.onError((error) => errors.push(error));
  return { client, workers, actions, errors };
}

const flush = () => vi.advanceTimersByTimeAsync(0);

function texts(client: ThemeClient): string[] {
  const out: string[] = [];
  const walk = (nodes: readonly unknown[] | undefined) => {
    for (const node of nodes ?? []) {
      if (typeof node === 'string') out.push(node);
      else if ((node as { t: string }).t === 'u') walk(client.tree.unit((node as { id: string }).id));
      else {
        const n = node as { props: { label?: string }; c: unknown[] };
        if (n.props.label) out.push(n.props.label);
        walk(n.c);
      }
    }
  };
  if (client.tree.root) walk(client.tree.unit(client.tree.root));
  return out;
}

/** The ids of the units the tree reaches from its root. */
function reachable(client: ThemeClient): string[] {
  const ids: string[] = [];
  const walk = (id: string) => {
    ids.push(id);
    const visit = (nodes: readonly unknown[] | undefined) => {
      for (const node of nodes ?? []) {
        if (typeof node === 'string') continue;
        const n = node as { t: string; id: string; c: unknown[] };
        if (n.t === 'u') walk(n.id);
        else visit(n.c);
      }
    };
    visit(client.tree.unit(id));
  };
  if (client.tree.root) walk(client.tree.root);
  return ids;
}

function press(client: ThemeClient, label: string, run?: number): void {
  const find = (nodes: readonly unknown[] | undefined): { $fn: number } | undefined => {
    for (const node of nodes ?? []) {
      if (typeof node === 'string') continue;
      const n = node as { t: string; id: string; props: { label?: string; onPress?: { $fn: number } }; c: unknown[] };
      const found = n.t === 'u' ? find(client.tree.unit(n.id)) : n.props.label === label ? n.props.onPress : find(n.c);
      if (found) return found;
    }
    return undefined;
  };
  client.invoke(find(client.tree.unit(client.tree.root!))!.$fn, [], run);
}

afterEach(() => {
  vi.useRealTimers();
});

describe('the worker sandbox', () => {
  it('runs the theme in the worker, for the app on the other side', async () => {
    vi.useFakeTimers();
    const { client, actions } = sandbox();
    client.showPage('home');
    await flush();
    expect(texts(client)).toEqual(['Grand', 'Spa', 'Events']);
    press(client, 'Spa');
    await flush();
    expect(actions).toEqual([['navigate', { category: 'spa' }]]);
    client.close();
  });

  it('loads a theme given as a function, and holds what arrives meanwhile', async () => {
    vi.useFakeTimers();
    const { client } = sandbox(() => new Promise((resolve) => setTimeout(() => resolve(THEME), 100)));
    client.showPage('home');
    client.patchState([{ path: ['site', 'name'], value: 'Grand View' }]);
    await vi.advanceTimersByTimeAsync(100);
    expect(texts(client)).toEqual(['Grand View', 'Spa', 'Events']);
    client.close();
  });

  it('restarts a theme that stops answering, with the state and page as they are now', async () => {
    vi.useFakeTimers();
    const { client, workers, actions, errors } = sandbox();
    client.showPage('home');
    await flush();
    const run = client.run;
    workers[0]!.control.stuck = true;
    client.patchState([{ path: ['site', 'name'], value: 'Grand View' }]);
    // The watchdog asks after a second, and gives up after three more.
    await vi.advanceTimersByTimeAsync(1000);
    expect(workers).toHaveLength(1);
    // Until then the screen keeps what the theme last sent.
    expect(texts(client)).toEqual(['Grand', 'Spa', 'Events']);
    await vi.advanceTimersByTimeAsync(3000);
    expect(workers).toHaveLength(2);
    expect(workers[0]!.control.terminated).toBe(true);
    expect(errors.map((e) => e.where)).toEqual(['restart']);
    // A tap that the old tree's callback would have sent goes nowhere: in the new run its id is someone else's.
    press(client, 'Spa', run);
    await flush();
    expect(texts(client)).toEqual(['Grand View', 'Spa', 'Events']);
    expect(actions).toEqual([]);
    press(client, 'Spa');
    await flush();
    expect(actions).toEqual([['navigate', { category: 'spa' }]]);
    client.close();
  });

  it('drops what only the old run had sent', async () => {
    vi.useFakeTimers();
    const { client, workers } = sandbox();
    // Pages that came and went: the old run's ids have moved on, the new run's start again.
    client.showPage('home');
    client.showPage(null);
    client.showPage('home');
    await flush();
    const before = reachable(client);
    workers[0]!.control.stuck = true;
    await vi.advanceTimersByTimeAsync(4000);
    await flush();
    const after = reachable(client);
    expect(texts(client)).toEqual(['Grand', 'Spa', 'Events']);
    expect(after).not.toEqual(before);
    for (const id of before.filter((id) => !after.includes(id))) expect(client.tree.unit(id), id).toBeUndefined();
    client.close();
  });

  it('stops a theme that keeps getting stuck, and says it has failed', async () => {
    vi.useFakeTimers();
    const { client, workers, errors } = sandbox(THEME, { restarts: { max: 1, withinMs: 60_000 } });
    client.showPage('home');
    await flush();
    workers[0]!.control.stuck = true;
    await vi.advanceTimersByTimeAsync(4000);
    workers[1]!.control.stuck = true;
    await vi.advanceTimersByTimeAsync(4000);
    expect(workers).toHaveLength(2);
    expect(errors.map((e) => e.where)).toEqual(['restart', 'runtime']);
    expect(client.hasFailed('runtime')).toBe(true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(workers).toHaveLength(2);
  });

  it('tries a theme that doesn’t load again, then gives up', async () => {
    vi.useFakeTimers();
    const { client, workers, errors } = sandbox(() => Promise.reject(new Error('no such file')), { restarts: { max: 2, withinMs: 60_000 } });
    await flush();
    expect(workers).toHaveLength(3);
    expect(errors.filter((e) => e.where !== 'load').map((e) => e.where)).toEqual(['restart', 'restart', 'runtime']);
    expect(errors[0]!.message).toContain('no such file');
    expect(client.hasFailed('runtime')).toBe(true);
  });

  it('says a theme that sends nothing in time has failed to start', async () => {
    vi.useFakeTimers();
    const client = new ThemeClient({ connect: () => ({ send: () => {} }), startTimeoutMs: 50, policy: POLICY, events: EVENTS!, onAction: () => {} });
    await vi.advanceTimersByTimeAsync(50);
    expect(client.hasFailed('start')).toBe(true);
  });
});

describe('blocking globals', () => {
  it('takes them away from the global object and the prototypes it inherits them from, for good', () => {
    const inherited = {
      fetch: () => 'reached',
      get indexedDB() {
        return 'a database';
      }
    };
    const scope = Object.create(inherited) as Record<string, any>;
    scope.WebSocket = class {};
    scope.Worker = class {};
    block({ network: true, storage: true }, scope);
    expect(() => scope.fetch('/api')).toThrow('fetch isn’t available to themes.'.replace('’', "'"));
    expect(() => inherited.fetch()).toThrow();
    expect(() => new scope.WebSocket()).toThrow();
    expect(scope.indexedDB).toBeUndefined();
    expect(Object.getOwnPropertyDescriptor(inherited, 'indexedDB')!.get).toBeUndefined();
    expect(() => delete scope.fetch).toThrow();
    expect(() => Object.defineProperty(scope, 'fetch', { value: () => 'back' })).toThrow();
    // Not asked for: left alone.
    expect(typeof new scope.Worker()).toBe('object');
  });
});

describe('themes packed with livrea pack', () => {
  /** A module as the CLI builds it: Livrea and the app's modules are looked up, not bundled. */
  const packed = (body: string) =>
    `data:text/javascript,${encodeURIComponent(`const shared = globalThis.__livreaModules__;\n${body}`)}`;

  it('run on this worker’s Livrea, with the modules the app provides', async () => {
    const theme = await importTheme(
      packed(`
        const { Component } = shared['livrea'];
        const { HomePage } = shared['@app/pages'];
        class Home extends HomePage {}
        class About extends Component {}
        export default { pages: { home: Home, about: About } };
      `),
      { '@app/pages': { HomePage: class extends Component {} } }
    );
    expect(Object.keys(theme.pages)).toEqual(['home', 'about']);
    // The very same Component class: one reactive core, the runtime's.
    expect(theme.pages.about!.prototype).toBeInstanceOf(Component);
  });

  it('refuse a module that isn’t a theme', async () => {
    await expect(importTheme(packed('export const nothing = 1;'))).rejects.toThrow('livrea pack');
  });
});

