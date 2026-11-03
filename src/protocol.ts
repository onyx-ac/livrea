/**
 * The messages between the theme runtime (in its sandbox) and the app. One
 * ordered stream each way; everything in it can be structured-cloned.
 */
import type { EventInfo } from './events.js';
import type { PageShown } from './runtime.js';
import type { Patch } from './store.js';

/** A node of the rendered tree. A unit is a slot or component instance, rendered and updated on its own. */
export type Out = string | OutElement | OutHost | OutUnit;

export interface OutElement {
  readonly t: 'e';
  readonly tag: string;
  readonly props: OutProps;
  readonly c: readonly Out[];
  /** The JSX key: a new key renders a new element (and replays its entry animation). */
  readonly k?: string | number;
}

export interface OutHost {
  readonly t: 'h';
  readonly name: string;
  readonly props: OutProps;
  readonly c: readonly Out[];
  readonly k?: string | number;
}

export interface OutUnit {
  readonly t: 'u';
  readonly id: string;
}

/** Plain data; a function becomes `{ $fn: id }`, which the app calls back with an `invoke` message. */
export type OutProps = Readonly<Record<string, unknown>>;

export interface FunctionRef {
  readonly $fn: number;
}

export type TreeOp =
  | { readonly op: 'root'; readonly id: string }
  /** The unit where pages show: the layout's <Outlet />, or the root without a layout. */
  | { readonly op: 'outlet'; readonly id: string }
  | { readonly op: 'set'; readonly id: string; readonly tree: readonly Out[] }
  | { readonly op: 'drop'; readonly id: string }
  | { readonly op: 'styles'; readonly id: string; readonly css: string };

/** From the theme runtime to the app. */
export type ThemeMessage =
  | { readonly kind: 'tree'; readonly ops: readonly TreeOp[] }
  | { readonly kind: 'answer'; readonly id: number; readonly prevented: boolean }
  | { readonly kind: 'action'; readonly name: string; readonly args: readonly unknown[] }
  | { readonly kind: 'track'; readonly name: string }
  | { readonly kind: 'error'; readonly where: string; readonly message: string };

/** From the app to the theme runtime. */
export type AppMessage =
  | { readonly kind: 'state'; readonly value: object }
  | { readonly kind: 'state'; readonly patches: readonly Patch[] }
  /** Shows a page of the theme; `null` shows none, for an app whose other screens aren't themed. */
  | { readonly kind: 'page'; readonly name: string | null; readonly params?: Readonly<Record<string, unknown>> }
  | { readonly kind: 'event'; readonly id?: number; readonly name: string; readonly payload?: unknown }
  | { readonly kind: 'invoke'; readonly fn: number; readonly args: readonly unknown[] };

/** Between `connectWorker` (livrea/host) and `serveRuntime` (livrea/worker): the app's messages, and these. */
export type ToWorker =
  | AppMessage
  /** Starts the runtime: the app's event catalog, its state, and the page on screen (after a restart). */
  | { readonly kind: 'start'; readonly events: Readonly<Record<string, EventInfo>>; readonly state: object; readonly page: PageShown | null }
  /** The watchdog's: the worker answers `pong` with the same number, if it isn't stuck. */
  | { readonly kind: 'ping'; readonly n: number };

export type FromWorker = ThemeMessage | { readonly kind: 'pong'; readonly n: number };
