/**
 * The app's state as theme code sees it: read-only, and every read tracked.
 *
 * The app replaces the state immutably (a new object along each changed path),
 * so a path's value keeps its identity until something under it changes. Each
 * path that theme code has read gets a cell; an update compares each cell's
 * value by identity and notifies only the cells that changed. Objects are read
 * through live cursors without being tracked themselves, so reading
 * `s.site.name` depends on the name only, not on all of `site`. Arrays are
 * returned as they are (frozen), tracked as a whole.
 */
import { batch, Signal } from './reactive.js';

export type PathKey = string | number;

export interface Patch {
  readonly path: readonly PathKey[];
  readonly value: unknown;
}

const SEP = '\u0000';
const READ_ONLY = 'Themes read the store; only the app changes it.';

export class Store<T extends object> {
  #root: T;
  readonly #cells = new Map<string, Signal<unknown>>();
  readonly #cursors = new Map<string, object>();
  #helpers: Readonly<Record<string, unknown>> = {};
  /** What theme code reads: `this.store`, and `s` in selectors. */
  readonly view: T;

  /** `helpers` adds functions next to the state at its root, such as `s.items(type)`. They read the view, so their reads are tracked too. */
  constructor(initial: T, helpers?: (view: T) => Record<string, unknown>) {
    this.#root = deepFreeze(initial);
    this.view = this.#cursor('') as T;
    if (helpers) this.#helpers = helpers(this.view);
  }

  /** The current state, untracked. */
  get snapshot(): T {
    return this.#root;
  }

  set(next: T): void {
    batch(() => {
      this.#root = deepFreeze(next);
      for (const [path, cell] of this.#cells) {
        // Cells nothing depends on any more are dropped; a new read creates them again.
        if (!cell.observed) {
          this.#cells.delete(path);
          continue;
        }
        cell.set(valueAt(this.#root, path));
      }
    });
  }

  /** Replaces the values at these paths, copying only the objects along them. */
  patch(patches: readonly Patch[]): void {
    let root: unknown = this.#root;
    for (const { path, value } of patches) root = setIn(root, path, value);
    this.set(root as T);
  }

  #cell(path: string): Signal<unknown> {
    let cell = this.#cells.get(path);
    if (!cell) {
      cell = new Signal<unknown>(valueAt(this.#root, path));
      this.#cells.set(path, cell);
    }
    return cell;
  }

  #read(path: string, key: string): unknown {
    if (path === '' && Object.hasOwn(this.#helpers, key)) return this.#helpers[key];
    const child = join(path, key);
    if (isRecord(valueAt(this.#root, child))) return this.#cursor(child);
    return this.#cell(child).get();
  }

  #cursor(path: string): object {
    const cached = this.#cursors.get(path);
    if (cached) return cached;
    const own = () => valueAt(this.#root, path);
    const cursor = new Proxy(
      {},
      {
        get: (_, key) => (typeof key === 'string' ? this.#read(path, key) : undefined),
        has: (_, key) => {
          const value = this.#cell(path).get();
          return isRecord(value) && key in value;
        },
        ownKeys: () => {
          const value = this.#cell(path).get();
          return isRecord(value) ? Reflect.ownKeys(value) : [];
        },
        getOwnPropertyDescriptor: (_, key) => {
          const value = own();
          if (typeof key !== 'string' || !isRecord(value) || !Object.hasOwn(value, key)) return undefined;
          return { value: this.#read(path, key), writable: false, enumerable: true, configurable: true };
        },
        getPrototypeOf: () => Object.prototype,
        set: () => {
          throw new TypeError(READ_ONLY);
        },
        defineProperty: () => {
          throw new TypeError(READ_ONLY);
        },
        deleteProperty: () => {
          throw new TypeError(READ_ONLY);
        }
      }
    );
    this.#cursors.set(path, cursor);
    return cursor;
  }
}

function join(path: string, key: string): string {
  return path === '' ? key : `${path}${SEP}${key}`;
}

function valueAt(root: unknown, path: string): unknown {
  if (path === '') return root;
  let value = root;
  for (const key of path.split(SEP)) {
    if (value === null || typeof value !== 'object') return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

function setIn(target: unknown, path: readonly PathKey[], value: unknown): unknown {
  if (path.length === 0) return value;
  const [key, ...rest] = path as [PathKey, ...PathKey[]];
  const base = target ?? (typeof key === 'number' ? [] : {});
  const copy = (Array.isArray(base) ? [...base] : { ...(base as object) }) as Record<PathKey, unknown>;
  copy[key] = setIn((base as Record<PathKey, unknown>)[key], rest, value);
  return copy;
}

/** A plain object: not null, not an array. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
