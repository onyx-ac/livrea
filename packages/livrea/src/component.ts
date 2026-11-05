/**
 * What theme code is written with: the Component class, and the descriptions
 * its members are made of (`slot`, `select`, `on`, app components).
 *
 * Members are descriptions, not live values: the runtime reads them once the
 * instance exists and turns them into tracked computations and subscriptions.
 * That is also why the constructor returns a proxy: subclass field
 * initializers run through it, so a slot that overrides another keeps it as its
 * base, and `state`, `data` and `listeners` merge along the class chain.
 */
import type { ThemeEvent } from './events.js';
import { Fragment, jsx, type Child, type Key, type Node } from './jsx-runtime.js';
import type { Equals } from './reactive.js';
import {
  defineSettings,
  type BlockNode,
  type BlockSchema,
  type LocalizedText,
  type ScalarField,
  type SettingsValues
} from './settings.js';
import { isRecord } from './store.js';
import type { Cleanup, EventCatalog, EventName, ThemeSettings, ThemeStore } from './types.js';

const SLOT = Symbol('livrea.slot');
const BLOCK = Symbol('livrea.block');
const SELECT = Symbol('livrea.select');
const LISTENER = Symbol('livrea.listener');
const HOST = Symbol('livrea.host');
const PROXY = Symbol('livrea.proxy');
export const RAW: unique symbol = Symbol('livrea.raw');
export const CONTEXT: unique symbol = Symbol('livrea.context');

// --- Slots ---

export interface SlotDefinition {
  readonly id: number;
  readonly render: (props: any) => Child;
  readonly deps: (() => readonly unknown[]) | undefined;
  /** The member it was assigned to: Header, RailButton… */
  name: string;
  /** The definition it overrides, from a base class. */
  parent: SlotDefinition | undefined;
  /** The component it belongs to (theme code's `this`). */
  owner: Component | undefined;
}

/** A named region: render it with `<this.Header />`; an override can render the one it replaced with `<this.Header.Base />`. */
export type Slot<P extends object = {}> = ((props: P) => Node) & { readonly Base: Slot<P> };

let nextSlotId = 1;

export function slot<P extends object = {}>(render: (props: P) => Child, options: { deps?: () => readonly unknown[] } = {}): Slot<P> {
  const definition: SlotDefinition = {
    id: nextSlotId++,
    render: render as (props: any) => Child,
    deps: options.deps,
    name: 'slot',
    parent: undefined,
    owner: undefined
  };
  return slotFunction(definition) as Slot<P>;
}

function slotFunction(definition: SlotDefinition): Function {
  const placeholder = function slotPlaceholder(): never {
    throw new Error(`The slot ${definition.name} is rendered by the theme runtime: use <this.${definition.name} />.`);
  };
  Object.defineProperty(placeholder, SLOT, { value: definition });
  Object.defineProperty(placeholder, 'Base', {
    get: () => (definition.parent ? slotFunction(definition.parent) : EMPTY_SLOT)
  });
  return placeholder;
}

const EMPTY_SLOT = slotFunction({ id: 0, render: () => null, deps: undefined, name: 'Base', parent: undefined, owner: undefined });

export function slotDefinition(value: unknown): SlotDefinition | undefined {
  return typeof value === 'function' ? (value as unknown as { [SLOT]?: SlotDefinition })[SLOT] : undefined;
}

// --- Blocks ---

export type BlockFields = Readonly<Record<string, ScalarField>>;

export type BlockSlots<S extends readonly string[]> = {
  readonly [K in S[number]]: Slot<{}>;
};

export type BlockProps<F extends BlockFields, S extends readonly string[]> = Partial<SettingsValues<F>> & {
  readonly [K in S[number]]?: Child | (() => Child);
} & {
  readonly key?: Key;
};

export interface BlockSpec<F extends BlockFields = {}, S extends readonly string[] = readonly []> {
  readonly id: string;
  readonly label: LocalizedText;
  readonly fields?: F;
  readonly slots?: S;
  readonly styles?: string;
  render(this: ComponentContext, props: SettingsValues<F>, slots: BlockSlots<S>): Child;
}

export interface InternalBlockDefinition {
  readonly id: string;
  readonly label: LocalizedText;
  readonly fields: BlockFields;
  readonly slots: readonly string[];
  readonly styles: string;
  readonly schema: BlockSchema;
  readonly render: (this: ComponentContext, props: any, slots: any) => Child;
  readonly fn: Function;
}

export type BlockDefinition<F extends BlockFields = {}, S extends readonly string[] = readonly []> = ((
  props: BlockProps<F, S>
) => Node) & {
  readonly id: string;
  readonly label: LocalizedText;
  readonly fields: F;
  readonly slots: S;
  readonly styles: string;
  readonly schema: BlockSchema;
};

const BLOCK_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLOT_NAME = /^[a-zA-Z][a-zA-Z0-9]*$/;
export const registeredBlocks = new Map<string, BlockDefinition<any, any>>();

/**
 * Defines a reusable visual block with a `field.*` schema for the Inspector
 * and optional inner `slots` for nested blocks.
 */
export function defineBlock<const F extends BlockFields = {}, const S extends readonly string[] = readonly []>(
  spec: BlockSpec<F, S>
): BlockDefinition<F, S> {
  if (!BLOCK_ID.test(spec.id)) {
    throw new Error(`The block "${spec.id}" needs an id of lowercase letters, digits and dashes, e.g. "split-columns".`);
  }
  if (!spec.label || !Object.keys(spec.label).length) {
    throw new Error(`The block "${spec.id}" needs a label.`);
  }
  const fields = (spec.fields ? defineSettings(spec.fields) : {}) as F;
  const slots = (spec.slots ?? []) as unknown as S;
  for (const name of slots) {
    if (!SLOT_NAME.test(name)) {
      throw new Error(`The block "${spec.id}" has an invalid slot name "${name}".`);
    }
  }
  const schema: BlockSchema = {
    label: spec.label,
    ...(Object.keys(fields).length ? { fields } : {}),
    ...(slots.length ? { slots } : {})
  };
  const placeholder = function blockPlaceholder(): never {
    throw new Error(`The block ${spec.id} is rendered by the theme runtime: use <${spec.id} />.`);
  };
  const internal: InternalBlockDefinition = {
    id: spec.id,
    label: spec.label,
    fields,
    slots,
    styles: spec.styles ?? '',
    schema,
    render: spec.render,
    fn: placeholder
  };
  Object.defineProperty(placeholder, BLOCK, { value: internal });
  Object.defineProperties(placeholder, {
    id: { value: spec.id, enumerable: true },
    label: { value: spec.label, enumerable: true },
    fields: { value: fields, enumerable: true },
    slots: { value: slots, enumerable: true },
    styles: { value: internal.styles, enumerable: true },
    schema: { value: schema, enumerable: true }
  });
  const block = placeholder as unknown as BlockDefinition<F, S>;
  registeredBlocks.set(spec.id, block);
  return block;
}

export function blockDefinition(value: unknown): InternalBlockDefinition | undefined {
  return typeof value === 'function' ? (value as unknown as { [BLOCK]?: InternalBlockDefinition })[BLOCK] : undefined;
}

/** Renders a list of BlockNodes into JSX using the available block definitions. */
export function renderBlocks(
  nodes: readonly BlockNode[] | undefined,
  catalog: ReadonlyMap<string, BlockDefinition<any, any>> = registeredBlocks
): Node {
  if (!nodes || !nodes.length) return jsx(Fragment, {});
  const children: Node[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!;
    const Block = catalog.get(node.block) ?? registeredBlocks.get(node.block);
    if (!Block) continue;
    const props: Record<string, unknown> = { ...(node.props ?? {}) };
    if (node.slots) {
      for (const [slotName, slotChildren] of Object.entries(node.slots)) {
        if (Array.isArray(slotChildren) && slotChildren.length) {
          props[slotName] = () => renderBlocks(slotChildren, catalog);
        }
      }
    }
    children.push(jsx(Block, props, `${node.block}-${i}`));
  }
  return jsx(Fragment, { children });
}

/**
 * Binds a component slot to a `field.blocks()` setting in `this.settings`.
 * When the setting holds blocks, they render; when it is empty, `fallback` renders.
 */
export function blockSlot<P extends object = {}>(
  settingName: string,
  fallback?: (props: P) => Child
): Slot<P> {
  let definition: SlotDefinition | undefined;
  const s: Slot<P> = slot<P>((props): Child => {
    const owner = definition?.owner;
    const nodes = owner ? ((owner.settings as Record<string, unknown>)[settingName] as readonly BlockNode[] | undefined) : undefined;
    if (Array.isArray(nodes) && nodes.length > 0) {
      const catalog = owner?.[CONTEXT]?.blocks ?? registeredBlocks;
      return renderBlocks(nodes, catalog);
    }
    return fallback ? fallback(props) : null;
  });
  definition = slotDefinition(s);
  return s;
}

// --- Selectors ---

export interface SelectOptions<T> {
  /** Compares results; structural by default. */
  equals?: Equals<T>;
  /** Explicit dependencies, as useMemo's array: the selector runs again only when these change. */
  deps?: (s: ThemeStore) => readonly unknown[];
}

export interface SelectDefinition {
  readonly fn: (s: ThemeStore) => unknown;
  readonly equals: Equals<any> | undefined;
  readonly deps: ((s: ThemeStore) => readonly unknown[]) | undefined;
}

/**
 * A value derived from the store, for the `data` member. It re-runs only when
 * what it read changes, and counts as changed only when its result differs.
 * Typed as its result, which is what `this.data.x` returns.
 */
export function select<T>(fn: (s: ThemeStore) => T, options: SelectOptions<T> = {}): T {
  const definition: SelectDefinition = { fn, equals: options.equals, deps: options.deps };
  return { [SELECT]: definition } as unknown as T;
}

export function selectDefinition(value: unknown): SelectDefinition | undefined {
  return isRecord(value) ? (value as { [SELECT]?: SelectDefinition })[SELECT] : undefined;
}

// --- Listeners ---

export interface ListenOptions<T> {
  /** Also call the handler with the first value. */
  immediate?: boolean;
  /** Compares values; structural by default. */
  equals?: Equals<T>;
}

export interface ListenerDefinition {
  readonly trigger: string | (() => unknown);
  readonly handler: (...args: any[]) => void | Cleanup;
  readonly options: ListenOptions<any>;
}

/** An entry of the `listeners` member. */
export type Listener = { readonly [LISTENER]: ListenerDefinition };

/**
 * The open type of `listeners`. A class meant to be extended declares its
 * listeners with it, so a subclass can add its own: they merge at run time.
 */
export type Listeners = Readonly<Record<string, Listener | undefined>>;

/**
 * The open type of `state` for a class meant to be extended: its keys are
 * optional, so a subclass can declare only its own (`state: Parent['state'] & { b?: number }`).
 */
export type State<T extends object = {}> = Partial<T> & Readonly<Record<string, unknown>>;

/** Reacts to an event from the catalog. */
export function on<K extends EventName>(event: K, handler: (event: ThemeEvent<K>) => void | Cleanup): Listener;
/** Reacts to a value changing, as useEffect does with its dependencies. */
export function on<T>(
  watch: () => T,
  handler: (value: T, previous: T | undefined) => void | Cleanup,
  options?: ListenOptions<T>
): Listener;
export function on(
  trigger: string | (() => unknown),
  handler: (...args: any[]) => void | Cleanup,
  options: ListenOptions<unknown> = {}
): Listener {
  return { [LISTENER]: { trigger, handler, options } };
}

export function listenerDefinition(value: unknown): ListenerDefinition | undefined {
  return isRecord(value) ? (value as { [LISTENER]?: ListenerDefinition })[LISTENER] : undefined;
}

// --- App components ---

/** A part only the app can run (the avatar, a button, a video): themes place it, the app renders it. */
export type HostComponent<P extends object = {}> = ((props: P) => Node) & { readonly hostName: string };

export function hostComponent<P extends object = {}>(name: string): HostComponent<P> {
  const placeholder = function hostPlaceholder(): never {
    throw new Error(`${name} is rendered by the app.`);
  };
  Object.defineProperty(placeholder, HOST, { value: name });
  Object.defineProperty(placeholder, 'hostName', { value: name });
  return placeholder as unknown as HostComponent<P>;
}

export function hostName(value: unknown): string | undefined {
  return typeof value === 'function' ? (value as unknown as { [HOST]?: string })[HOST] : undefined;
}

/** Where a layout shows the current page. */
export function Outlet(_props: {}): Node {
  throw new Error('The outlet is rendered by the theme runtime: use <Outlet /> in a layout.');
}

// --- Components ---

/** What the runtime gives each component; theme code reaches it through the Component's methods. */
export interface ComponentContext {
  readonly store: ThemeStore;
  readonly settings: ThemeSettings;
  readonly blocks?: ReadonlyMap<string, BlockDefinition<any, any>>;
  setState(component: Component, patch: object): void;
  raise(component: Component, name: string, payload: unknown): boolean;
  emit(component: Component, name: string, payload: unknown): void;
  action(name: string, ...args: unknown[]): void;
  track(name: string): void;
}

let constructing: ComponentContext | null = null;

/** Creates a component for the runtime: only it can. */
export function construct<C extends Component<any>>(Class: new () => C, context: ComponentContext): C {
  const outer = constructing;
  constructing = context;
  try {
    return new Class();
  } finally {
    constructing = outer;
  }
}

const MERGED = new Set(['state', 'data', 'listeners']);

const inheritance: ProxyHandler<Component<any>> = {
  defineProperty(target, key, descriptor) {
    if ('value' in descriptor) descriptor = { ...descriptor, value: inherit(target, key, descriptor.value) };
    return Reflect.defineProperty(target, key, descriptor);
  },
  // For themes compiled with assignment semantics for class fields.
  set(target, key, value) {
    return Reflect.set(target, key, inherit(target, key, value));
  }
};

function inherit(target: Component<any>, key: string | symbol, value: unknown): unknown {
  if (typeof key !== 'string') return value;
  const previous: unknown = Reflect.get(target, key);
  const definition = slotDefinition(value);
  if (definition) {
    definition.name = key;
    definition.owner = (target as unknown as { [PROXY]: Component })[PROXY];
    const replaced = slotDefinition(previous);
    if (replaced && replaced !== definition) definition.parent = replaced;
    return value;
  }
  if (MERGED.has(key) && isRecord(previous) && isRecord(value)) return { ...previous, ...value };
  if (key === 'styles' && typeof previous === 'string' && previous && typeof value === 'string') return `${previous}\n${value}`;
  return value;
}

/**
 * A page, a layout or a reusable part of a theme. Subclass it, override the
 * slots you want to change, and add state, data and listeners.
 */
export class Component<P extends object = {}> {
  /** What it was given in JSX. */
  declare readonly props: P;
  /** A page's parameters, from the app (the category it shows…); tracked, and updated in place. */
  declare readonly params: Readonly<Record<string, unknown>>;
  /** Its own state; read it here, change it with `this.set()`. */
  state: object = {};
  /** Values derived from the store, made with `select()`. */
  data: object = {};
  /** Reactions to values and events, made with `on()`. */
  listeners: Listeners = {};
  /** CSS for this class, made with `css`. */
  styles = '';
  declare readonly [RAW]: Component<P>;
  declare readonly [CONTEXT]: ComponentContext;

  constructor() {
    const context = constructing;
    if (!context) throw new Error('Theme components are created by the theme runtime, not with new.');
    Object.defineProperty(this, CONTEXT, { value: context });
    Object.defineProperty(this, RAW, { value: this });
    const proxy = new Proxy(this, inheritance);
    Object.defineProperty(this, PROXY, { value: proxy });
    return proxy;
  }

  /** The app's state, read-only; every read is tracked. */
  get store(): ThemeStore {
    return this[CONTEXT].store;
  }

  /** The theme's settings as the app's admin set them, defaults filled in; every read is tracked. */
  get settings(): ThemeSettings {
    return this[CONTEXT].settings;
  }

  render(): Child {
    return null;
  }

  /** Changes the component's own state. */
  set(patch: Partial<this['state']>): void {
    this[CONTEXT].setState(this, patch);
  }

  /** Raises a catalog event here, as a base class does when one of its parts is used. Returns whether it was prevented. */
  raise<K extends EventName>(name: K, payload: EventCatalog[K]): boolean {
    return this[CONTEXT].raise(this, name, payload);
  }

  /** Sends a theme's own event up through its components; it never reaches the app. */
  emit<K extends EventName>(name: K, payload: EventCatalog[K]): void {
    this[CONTEXT].emit(this, name, payload);
  }

  /** Asks the app to do something (navigate, ask…); the app decides whether it may. */
  action(name: string, ...args: unknown[]): void {
    this[CONTEXT].action(name, ...args);
  }

  /** Counts an event in the app's usage figures. */
  track(name: string): void {
    this[CONTEXT].track(name);
  }
}

/** A layout: the frame around pages, always on screen. By default, just the page. */
export class Layout extends Component {
  override render(): Child {
    return jsx(Outlet, {});
  }
}

export function isComponentClass(value: unknown): value is new () => Component<any> {
  return typeof value === 'function' && value.prototype instanceof Component;
}

/** CSS for a component's `styles` member. */
export function css(strings: TemplateStringsArray, ...values: unknown[]): string {
  return String.raw({ raw: strings }, ...values);
}
