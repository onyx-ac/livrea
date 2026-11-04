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
    this.set(applyPatches(this.#root, patches));
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

/**
 * The state with these patches applied, sharing everything they don't touch.
 * Each object along their paths is copied once, however many patches go
 * through it (a language change patches every text of one object).
 */
export function applyPatches<T>(root: T, patches: readonly Patch[]): T {
  const copies = new WeakSet<object>();
  const copyOf = (value: unknown, key: PathKey): Record<PathKey, unknown> => {
    if (value !== null && typeof value === 'object' && copies.has(value)) return value as Record<PathKey, unknown>;
    const base = value ?? (typeof key === 'number' ? [] : {});
    const copy = (Array.isArray(base) ? [...base] : { ...(base as object) }) as Record<PathKey, unknown>;
    copies.add(copy);
    return copy;
  };
  let result: unknown = root;
  for (const { path, value } of patches) {
    if (path.length === 0) {
      result = value;
      continue;
    }
    result = copyOf(result, path[0]!);
    let parent = result as Record<PathKey, unknown>;
    for (let i = 0; i < path.length - 1; i++) {
      parent = parent[path[i]!] = copyOf(parent[path[i]!], path[i + 1]!);
    }
    parent[path[path.length - 1]!] = value;
  }
  return result as T;
}

/**
 * What changed from one state to the next, as patches: the paths whose values
 * differ, as deep as both sides keep their shape. An object that lost keys, or
 * an array whose length changed, is replaced whole. Equal states give none.
 */
export function diffState(before: unknown, after: unknown): Patch[] {
  const patches: Patch[] = [];
  const path: PathKey[] = [];
  const visit = (a: unknown, b: unknown): void => {
    if (Object.is(a, b)) return;
    if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
      for (let i = 0; i < b.length; i++) {
        path.push(i);
        visit(a[i], b[i]);
        path.pop();
      }
      return;
    }
    if (isRecord(a) && isRecord(b) && Object.keys(a).every((key) => Object.hasOwn(b, key))) {
      for (const key of Object.keys(b)) {
        path.push(key);
        visit(a[key], b[key]);
        path.pop();
      }
      return;
    }
    patches.push({ path: [...path], value: b });
  };
  visit(before, after);
  return patches;
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
