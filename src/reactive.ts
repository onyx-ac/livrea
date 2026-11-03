/**
 * Fine-grained reactivity: signals, computed values that run lazily and report
 * a change only when their result differs, and effects that re-run when what
 * they read has changed.
 *
 * A change marks its dependents stale (push); a stale value checks whether its
 * sources really changed before computing again (pull). So a computed value
 * whose result comes out equal stops the change there, and a diamond of
 * dependencies runs once. Render effects run before user effects, so listeners
 * see the screen already updated.
 */
import type { Cleanup } from './types.js';

export type Equals<T> = (a: T, b: T) => boolean;
export type Priority = 'render' | 'user';

interface Source {
  version: number;
  readonly observers: Set<Observer>;
  /** Brings a computed value up to date; signals are always up to date. */
  refresh?(): void;
}

interface Observer {
  sources: Map<Source, number>;
  stale(): void;
}

let current: Observer | null = null;
let batchDepth = 0;
let flushing = false;
const queues: Record<Priority, Set<EffectNode>> = { render: new Set(), user: new Set() };

function track(source: Source): void {
  if (current && !current.sources.has(source)) {
    current.sources.set(source, source.version);
    source.observers.add(current);
  }
}

function notify(source: Source): void {
  for (const observer of [...source.observers]) observer.stale();
}

/** Whether any of the observer's sources changed since it last ran. */
function sourcesChanged(observer: Observer): boolean {
  for (const [source, seen] of observer.sources) {
    source.refresh?.();
    if (source.version !== seen) return true;
  }
  return false;
}

/** Stops observing the sources the last run read and this one didn't. */
function release(observer: Observer, previous: Map<Source, number>): void {
  for (const source of previous.keys()) if (!observer.sources.has(source)) source.observers.delete(observer);
}

export class Signal<T> implements Source {
  version = 0;
  readonly observers = new Set<Observer>();
  #value: T;
  readonly #equals: Equals<T>;

  constructor(value: T, equals: Equals<T> = Object.is) {
    this.#value = value;
    this.#equals = equals;
  }

  get(): T {
    track(this);
    return this.#value;
  }

  peek(): T {
    return this.#value;
  }

  set(value: T): void {
    if (untrack(() => this.#equals(this.#value, value))) return;
    this.#value = value;
    this.version++;
    batch(() => notify(this));
  }

  /** Whether anything depends on it. */
  get observed(): boolean {
    return this.observers.size > 0;
  }
}

export class Computed<T> implements Source, Observer {
  version = 0;
  readonly observers = new Set<Observer>();
  sources = new Map<Source, number>();
  #state: 'new' | 'stale' | 'fresh' = 'new';
  #value: T | undefined;
  #error: unknown;
  #failed = false;
  #running = false;
  readonly #fn: () => T;
  readonly #equals: Equals<T>;

  constructor(fn: () => T, equals: Equals<T> = Object.is) {
    this.#fn = fn;
    this.#equals = equals;
  }

  stale(): void {
    if (this.#state !== 'fresh') return;
    this.#state = 'stale';
    notify(this);
  }

  refresh(): void {
    if (this.#state === 'fresh') return;
    if (this.#running) throw new Error('A computed value depends on itself.');
    if (this.#state === 'stale' && !sourcesChanged(this)) {
      this.#state = 'fresh';
      return;
    }
    this.#compute();
  }

  get(): T {
    this.refresh();
    track(this);
    if (this.#failed) throw this.#error;
    return this.#value as T;
  }

  peek(): T {
    return untrack(() => this.get());
  }

  /** Stops observing its sources; it computes afresh if read again. */
  dispose(): void {
    for (const source of this.sources.keys()) source.observers.delete(this);
    this.sources.clear();
    this.#state = 'new';
  }

  #compute(): void {
    const previous = this.sources;
    this.sources = new Map();
    const outer = current;
    current = this;
    this.#running = true;
    let value: T | undefined;
    let error: unknown;
    let failed = false;
    try {
      value = this.#fn();
    } catch (thrown) {
      error = thrown;
      failed = true;
    } finally {
      current = outer;
      this.#running = false;
      release(this, previous);
    }
    let changed: boolean;
    if (failed) {
      changed = true;
      this.#failed = true;
      this.#error = error;
    } else {
      changed = this.#state === 'new' || this.#failed || !untrack(() => this.#equals(this.#value as T, value as T));
      this.#failed = false;
      // An equal result keeps the previous value, so its identity holds too.
      if (changed) this.#value = value;
    }
    if (changed) this.version++;
    this.#state = 'fresh';
  }
}

class EffectNode implements Observer {
  sources = new Map<Source, number>();
  #state: 'new' | 'stale' | 'fresh' = 'new';
  #cleanup: Cleanup | undefined;
  #disposed = false;
  readonly #fn: () => void | Cleanup;
  readonly #onError: (error: unknown) => void;
  readonly priority: Priority;

  constructor(fn: () => void | Cleanup, priority: Priority, onError: (error: unknown) => void) {
    this.#fn = fn;
    this.priority = priority;
    this.#onError = onError;
  }

  stale(): void {
    if (this.#state !== 'fresh' || this.#disposed) return;
    this.#state = 'stale';
    queues[this.priority].add(this);
  }

  run(): void {
    if (this.#disposed) return;
    if (this.#state === 'stale' && !sourcesChanged(this)) {
      this.#state = 'fresh';
      return;
    }
    this.#runCleanup();
    const previous = this.sources;
    this.sources = new Map();
    const outer = current;
    current = this;
    try {
      const result = this.#fn();
      if (typeof result === 'function') this.#cleanup = result;
    } catch (error) {
      this.#onError(error);
    } finally {
      current = outer;
      release(this, previous);
      this.#state = 'fresh';
    }
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    queues.render.delete(this);
    queues.user.delete(this);
    this.#runCleanup();
    for (const source of this.sources.keys()) source.observers.delete(this);
    this.sources.clear();
  }

  #runCleanup(): void {
    const cleanup = this.#cleanup;
    this.#cleanup = undefined;
    if (!cleanup) return;
    try {
      untrack(cleanup);
    } catch (error) {
      this.#onError(error);
    }
  }
}

function rethrow(error: unknown): never {
  throw error;
}

export function signal<T>(value: T, equals?: Equals<T>): Signal<T> {
  return new Signal(value, equals);
}

export function computed<T>(fn: () => T, equals?: Equals<T>): Computed<T> {
  return new Computed(fn, equals);
}

export interface EffectOptions {
  /** Render effects run first, at once when created; user effects run after them. */
  priority?: Priority;
  onError?: (error: unknown) => void;
}

/** Runs `fn` now (render) or at the next flush (user), and again whenever what it read changes. Returns a function that stops it. */
export function effect(fn: () => void | Cleanup, options: EffectOptions = {}): () => void {
  const node = new EffectNode(fn, options.priority ?? 'user', options.onError ?? rethrow);
  if (node.priority === 'render') {
    node.run();
  } else {
    queues.user.add(node);
    if (batchDepth === 0) flush();
  }
  return () => node.dispose();
}

export interface WatchOptions<T> {
  /** Also call the handler with the first value. */
  immediate?: boolean;
  equals?: Equals<T>;
  onError?: (error: unknown) => void;
}

/**
 * Calls `handler` when the value `read` returns changes, as useEffect does with
 * its dependencies. A cleanup it returns runs before the next call and when stopped.
 */
export function watch<T>(
  read: () => T,
  handler: (value: T, previous: T | undefined) => void | Cleanup,
  options: WatchOptions<T> = {}
): () => void {
  const value = new Computed(read, options.equals ?? Object.is);
  let first = true;
  let previous: T | undefined;
  const stop = effect(
    () => {
      const next = value.get();
      const before = previous;
      previous = next;
      const isFirst = first;
      first = false;
      if (isFirst && !options.immediate) return;
      return untrack(() => handler(next, isFirst ? undefined : before));
    },
    { priority: 'user', onError: options.onError }
  );
  return () => {
    stop();
    value.dispose();
  };
}

/** Runs `fn`, holding effects back until it (and any outer batch) ends. */
export function batch<T>(fn: () => T): T {
  batchDepth++;
  try {
    return fn();
  } finally {
    batchDepth--;
    if (batchDepth === 0) flush();
  }
}

/** Runs `fn` without recording what it reads. */
export function untrack<T>(fn: () => T): T {
  const outer = current;
  current = null;
  try {
    return fn();
  } finally {
    current = outer;
  }
}

/** Runs the pending effects: render effects first, until none are left. */
export function flush(): void {
  if (flushing) return;
  flushing = true;
  try {
    for (let runs = 0; ; runs++) {
      if (runs > 100_000) throw new Error('Effects keep triggering each other.');
      const next = take(queues.render) ?? take(queues.user);
      if (!next) break;
      next.run();
    }
  } finally {
    flushing = false;
  }
}

function take(queue: Set<EffectNode>): EffectNode | undefined {
  for (const node of queue) {
    queue.delete(node);
    return node;
  }
  return undefined;
}
