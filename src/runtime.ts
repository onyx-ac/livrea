/**
 * The theme runtime: it runs a theme's classes (in a sandbox, in production),
 * renders them, and talks to the app only through messages (protocol.ts).
 *
 * Rendering is split into units: the layout, the page, and each slot and
 * component instance. Each unit renders in its own effect, so it re-renders
 * only when what it read changes, and sends only its own part of the tree.
 */
import {
  Component,
  construct,
  hostName,
  isComponentClass,
  listenerDefinition,
  Outlet,
  RAW,
  selectDefinition,
  slotDefinition,
  type ComponentContext,
  type SlotDefinition
} from './component.js';
import { shallowEqual, structuralEqual } from './equality.js';
import { createEvent, LIFECYCLE_EVENTS, THEME_EVENT, type EventInfo } from './events.js';
import type { Child, ComponentNode, Key, Node } from './jsx-runtime.js';
import type { AppMessage, Out, OutProps, ThemeMessage, TreeOp } from './protocol.js';
import { batch, Computed, effect, Signal, untrack, watch } from './reactive.js';
import { isRecord, Store } from './store.js';
import type { Cleanup, EventName, ThemeStore } from './types.js';

export type { EventInfo } from './events.js';
export type { AppMessage, Out, OutProps, ThemeMessage, TreeOp } from './protocol.js';
export { Store, type Patch, type PathKey } from './store.js';

export type ComponentClass = new () => Component<any>;

export interface RuntimeOptions {
  /** Sends a message to the app. */
  post(message: ThemeMessage): void;
  /** The theme's pages, by the names the app shows them by. */
  pages: Readonly<Record<string, ComponentClass>>;
  /** The frame around pages; without one, the page is the whole screen. */
  layout?: ComponentClass;
  /** The app's event catalog: how each event behaves. */
  events?: Readonly<Record<string, EventInfo>>;
  /** The initial state of the store. */
  state?: object;
  /** Functions next to the state, such as `s.items(type)`. */
  helpers?: (view: any) => Record<string, unknown>;
}

export interface Runtime {
  receive(message: AppMessage): void;
  readonly store: Store<object>;
  dispose(): void;
}

interface Instance {
  readonly id: string;
  readonly proxy: Component<any>;
  readonly raw: Component<any>;
  unit: Unit | null;
  readonly handlers: Map<string, Handler[]>;
  readonly state: Map<string, Signal<unknown>>;
  /** A page's parameters (the category it shows…); the same page with new ones updates in place. */
  readonly params: Signal<Readonly<Record<string, unknown>>>;
  /** The name it was shown by, for a page. */
  readonly pageName: string | null;
  readonly disposers: (() => void)[];
  alive: boolean;
}

interface Handler {
  readonly run: (event: unknown) => void | Cleanup;
  cleanup: Cleanup | undefined;
}

interface Unit {
  readonly id: string;
  readonly parent: Unit | null;
  /** The instance theme code in this unit belongs to: where its events start. */
  owner: Instance | null;
  /** A component unit's own instance, destroyed with it. */
  instance: Instance | null;
  readonly props: Signal<Readonly<Record<string, unknown>>>;
  readonly children: Map<string, Unit>;
  callbacks: number[];
  stop: () => void;
}

interface Pass {
  readonly unit: Unit;
  readonly seen: Set<string>;
  readonly counts: Map<string, number>;
}

export function createRuntime(options: RuntimeOptions): Runtime {
  const store = new Store<object>(options.state ?? {}, options.helpers);
  const events = new Map<string, EventInfo>(Object.entries({ ...LIFECYCLE_EVENTS, ...options.events }));
  const instances = new WeakMap<object, Instance>();
  const callbacks = new Map<number, { readonly fn: Function; readonly unit: Unit }>();
  const classIds = new WeakMap<Function, number>();
  const styled = new Set<Function>();
  const page = new Signal<Instance | null>(null);
  let ops: TreeOp[] = [];
  let mounts: Instance[] = [];
  let pass: Pass | null = null;
  let invoking: Unit | null = null;
  let nextId = 1;
  let disposed = false;

  const report = (where: string, error: unknown) =>
    options.post({ kind: 'error', where, message: error instanceof Error ? error.message : String(error) });

  const context: ComponentContext = {
    store: store.view as ThemeStore,
    setState(component, patch) {
      const instance = instances.get(component);
      if (!instance) return;
      batch(() => {
        for (const [key, value] of Object.entries(patch)) stateCell(instance, key).set(value);
      });
    },
    raise: (component, name, payload) => dispatch(name, payload, route(invoking ?? instances.get(component)?.unit ?? null, instances.get(component))),
    emit(component, name, payload) {
      dispatch(name, payload, route(invoking ?? instances.get(component)?.unit ?? null, instances.get(component)));
    },
    action: (name, args) => options.post({ kind: 'action', name, args: toPlain(args) as unknown[] }),
    track: (name) => options.post({ kind: 'track', name })
  };

  // --- Instances ---

  function createInstance(Class: ComponentClass, unit: Unit | null, page?: { name: string; params: Readonly<Record<string, unknown>> }): Instance {
    const proxy = construct(Class, context);
    const instance: Instance = {
      id: `c${nextId++}`,
      proxy,
      raw: proxy[RAW],
      unit,
      handlers: new Map(),
      state: new Map(),
      params: new Signal(Object.freeze({ ...page?.params }), structuralEqual),
      pageName: page?.name ?? null,
      disposers: [],
      alive: true
    };
    instances.set(proxy, instance);
    Object.defineProperty(instance.raw, 'params', { get: () => instance.params.get(), configurable: true });
    activate(instance, Class);
    return instance;
  }

  function stateCell(instance: Instance, key: string): Signal<unknown> {
    let cell = instance.state.get(key);
    if (!cell) {
      cell = new Signal<unknown>(undefined);
      instance.state.set(key, cell);
    }
    return cell;
  }

  /** Turns the instance's members into live values: props, state, data, listeners and styles. */
  function activate(instance: Instance, Class: ComponentClass): void {
    const { raw } = instance;
    Object.defineProperty(raw, 'props', { get: () => instance.unit?.props.get() ?? {}, configurable: true });

    for (const [key, value] of Object.entries(raw.state)) instance.state.set(key, new Signal(value));
    Object.defineProperty(raw, 'state', {
      value: readOnly('Change state with this.set().', (key) => stateCell(instance, key).get()),
      configurable: true
    });

    const values = new Map<string, Computed<unknown>>();
    const plain: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw.data)) {
      const definition = selectDefinition(value);
      if (!definition) {
        plain[key] = value;
        continue;
      }
      const s = context.store;
      const deps = definition.deps;
      let read: () => unknown = () => definition.fn(s);
      if (deps) {
        // Only the dependencies are tracked; the selector runs when they come out different.
        const watched = new Computed(() => deps(s), structuralEqual);
        instance.disposers.push(() => watched.dispose());
        read = () => {
          watched.get();
          return untrack(() => definition.fn(s));
        };
      }
      values.set(key, new Computed(read, definition.equals ?? structuralEqual));
    }
    instance.disposers.push(() => values.forEach((value) => value.dispose()));
    Object.defineProperty(raw, 'data', {
      value: readOnly('Data comes from selectors; it is read-only.', (key) => (values.has(key) ? values.get(key)!.get() : plain[key])),
      configurable: true
    });

    for (const [key, value] of Object.entries(raw.listeners)) {
      const listener = listenerDefinition(value);
      if (!listener) continue;
      if (typeof listener.trigger === 'string') {
        const list = instance.handlers.get(listener.trigger) ?? [];
        list.push({ run: listener.handler, cleanup: undefined });
        instance.handlers.set(listener.trigger, list);
      } else {
        instance.disposers.push(
          watch(listener.trigger, listener.handler, {
            immediate: listener.options.immediate,
            equals: listener.options.equals ?? structuralEqual,
            onError: (error) => report(`listener ${key}`, error)
          })
        );
      }
    }
    instance.disposers.push(() => {
      for (const list of instance.handlers.values()) for (const handler of list) runCleanup(handler, 'listener');
      instance.handlers.clear();
    });

    if (raw.styles && !styled.has(Class)) {
      styled.add(Class);
      ops.push({ op: 'styles', id: `${Class.name || 'Component'}-${classId(Class)}`, css: raw.styles });
    }
  }

  function destroyInstance(instance: Instance): void {
    if (!instance.alive) return;
    instance.alive = false;
    for (const dispose of instance.disposers) {
      try {
        dispose();
      } catch (error) {
        report('cleanup', error);
      }
    }
  }

  function classId(Class: Function): number {
    let id = classIds.get(Class);
    if (id === undefined) {
      id = nextId++;
      classIds.set(Class, id);
    }
    return id;
  }

  // --- Events ---

  /** The instances an event passes through: where it starts, then up the units it was rendered in. */
  function route(start: Unit | null, first?: Instance): Instance[] {
    const list: Instance[] = [];
    const add = (instance: Instance | null | undefined) => {
      if (instance && list[list.length - 1] !== instance) list.push(instance);
    };
    if (!start) add(first);
    for (let unit = start; unit; unit = unit.parent) add(unit.owner);
    return list;
  }

  function dispatch(name: string, payload: unknown, path: readonly Instance[]): boolean {
    const info = events.get(name) ?? THEME_EVENT;
    const event = createEvent(name as EventName, (payload ?? {}) as never, info);
    const scope = info.bubbles ? path : path.slice(0, 1);
    for (const instance of scope) {
      for (const handler of instance.handlers.get(name) ?? []) {
        runCleanup(handler, `listener for ${name}`);
        try {
          const result = untrack(() => handler.run(event));
          if (typeof result === 'function') handler.cleanup = result;
        } catch (error) {
          report(`listener for ${name}`, error);
        }
      }
      if (event.propagationStopped) break;
    }
    if (!event.defaultPrevented) {
      for (const instance of scope) {
        const action = defaultFor(instance, name);
        if (!action) continue;
        try {
          untrack(() => action(instance.proxy, event));
        } catch (error) {
          report(`default for ${name}`, error);
        }
        break;
      }
    }
    return event.defaultPrevented;
  }

  /** The most derived class's default for the event, along the class chain. */
  function defaultFor(instance: Instance, name: string): ((component: Component<any>, event: unknown) => void) | undefined {
    for (let Class: unknown = instance.raw.constructor; typeof Class === 'function'; Class = Object.getPrototypeOf(Class)) {
      if (!Object.hasOwn(Class, 'defaults')) continue;
      const action = (Class as { defaults?: Record<string, unknown> }).defaults?.[name];
      if (typeof action === 'function') return action as (component: Component<any>, event: unknown) => void;
    }
    return undefined;
  }

  function runCleanup(handler: Handler, where: string): void {
    const cleanup = handler.cleanup;
    handler.cleanup = undefined;
    if (!cleanup) return;
    try {
      untrack(cleanup);
    } catch (error) {
      report(where, error);
    }
  }

  // --- Units ---

  function createUnit(parent: Unit | null, props: Readonly<Record<string, unknown>>): Unit {
    return {
      id: `u${nextId++}`,
      parent,
      owner: null,
      instance: null,
      props: new Signal(props, shallowEqual),
      children: new Map(),
      callbacks: [],
      stop: () => {}
    };
  }

  /** Renders the unit with the first producer that works: a slot's fallbacks are its base versions. */
  function start(unit: Unit, producers: readonly (() => Child)[], where: string): void {
    unit.stop = effect(() => renderInto(unit, producers, where), { priority: 'render', onError: (error) => report(where, error) });
  }

  function renderInto(unit: Unit, producers: readonly (() => Child)[], where: string): void {
    const previous = unit.callbacks;
    unit.callbacks = [];
    let done: Pass = { unit, seen: new Set(), counts: new Map() };
    let tree: Out[] = [];
    for (const [index, produce] of producers.entries()) {
      const attempt: Pass = { unit, seen: new Set(), counts: new Map() };
      const outer = pass;
      pass = attempt;
      try {
        const out: Out[] = [];
        serialize(produce(), out);
        done = attempt;
        tree = out;
        break;
      } catch (error) {
        report(index === 0 ? where : `${where}, base version`, error);
        for (const id of unit.callbacks.splice(0)) callbacks.delete(id);
      } finally {
        pass = outer;
      }
    }
    for (const [key, child] of unit.children) {
      if (done.seen.has(key)) continue;
      unit.children.delete(key);
      destroyUnit(child);
    }
    for (const id of previous) callbacks.delete(id);
    ops.push({ op: 'set', id: unit.id, tree });
  }

  function destroyUnit(unit: Unit): void {
    unit.stop();
    for (const child of unit.children.values()) destroyUnit(child);
    unit.children.clear();
    for (const id of unit.callbacks) callbacks.delete(id);
    unit.callbacks = [];
    if (unit.instance) {
      dispatch('leave', {}, [unit.instance]);
      destroyInstance(unit.instance);
    }
    ops.push({ op: 'drop', id: unit.id });
  }

  /** The child unit at this place in the current render: the same one as last time if it's still there. */
  function childUnit(base: string, key: Key | undefined, props: Readonly<Record<string, unknown>>, startUnit: (unit: Unit) => void): Unit {
    const current = pass!;
    let identity: string;
    if (key !== undefined) {
      identity = `${base}:${key}`;
    } else {
      const n = current.counts.get(base) ?? 0;
      current.counts.set(base, n + 1);
      identity = `${base}#${n}`;
    }
    if (current.seen.has(identity)) throw new Error(`Two siblings have the same key (${String(key)}).`);
    current.seen.add(identity);
    const existing = current.unit.children.get(identity);
    if (existing) {
      existing.props.set(props);
      return existing;
    }
    const unit = createUnit(current.unit, props);
    current.unit.children.set(identity, unit);
    startUnit(unit);
    return unit;
  }

  function serialize(child: Child, out: Out[]): void {
    if (child === null || child === undefined || typeof child === 'boolean') return;
    if (typeof child === 'string') {
      out.push(child);
      return;
    }
    if (typeof child === 'number') {
      out.push(String(child));
      return;
    }
    if (Array.isArray(child)) {
      for (const item of child as readonly Child[]) serialize(item, out);
      return;
    }
    if (typeof child === 'function') throw new TypeError('A function was rendered as a child: a slot calls its children function itself.');
    const node = child as Node;
    switch (node.kind) {
      case 'fragment':
        serialize(node.children, out);
        return;
      case 'element':
        out.push({ t: 'e', tag: node.tag, props: serializeProps(node.props), c: collect(node.children), ...keyed(node.key) });
        return;
      case 'component':
        serializeComponent(node, out);
        return;
      default:
        throw new TypeError('A theme can only render elements, slots, app components and components.');
    }
  }

  function collect(children: Child): Out[] {
    const out: Out[] = [];
    serialize(children, out);
    return out;
  }

  function serializeComponent(node: ComponentNode, out: Out[]): void {
    const { type, props, key } = node;
    if (type === Outlet) {
      out.push({ t: 'u', id: childUnit('outlet', undefined, {}, startOutlet).id });
      return;
    }
    const host = hostName(type);
    if (host !== undefined) {
      const { children, ...rest } = props;
      out.push({ t: 'h', name: host, props: serializeProps(rest), c: collect(children as Child), ...keyed(key) });
      return;
    }
    const definition = slotDefinition(type);
    if (definition) {
      out.push({ t: 'u', id: childUnit(`s${definition.id}`, key, props, (unit) => startSlot(unit, definition)).id });
      return;
    }
    if (isComponentClass(type)) {
      out.push({ t: 'u', id: childUnit(`k${classId(type)}`, key, props, (unit) => startComponent(unit, type)).id });
      return;
    }
    // A plain function: rendered in place, as part of this unit.
    serialize((type as (props: object) => Child)(props), out);
  }

  function serializeProps(props: Readonly<Record<string, unknown>>): OutProps {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(props)) {
      if (key === 'children' || value === undefined) continue;
      if (typeof value === 'function') {
        const id = nextId++;
        callbacks.set(id, { fn: value, unit: pass!.unit });
        pass!.unit.callbacks.push(id);
        out[key] = { $fn: id };
      } else {
        out[key] = toPlain(value);
      }
    }
    return out;
  }

  function startSlot(unit: Unit, definition: SlotDefinition): void {
    unit.owner = definition.owner ? (instances.get(definition.owner) ?? null) : null;
    const chain: SlotDefinition[] = [];
    for (let link: SlotDefinition | undefined = definition; link; link = link.parent) chain.push(link);
    start(
      unit,
      chain.map((link) => () => {
        const props = unit.props.get();
        if (!link.deps) return link.render(props);
        link.deps();
        return untrack(() => link.render(props));
      }),
      `slot ${definition.name}`
    );
  }

  function startComponent(unit: Unit, Class: ComponentClass): void {
    const instance = createInstance(Class, unit);
    unit.owner = instance;
    unit.instance = instance;
    start(unit, [() => instance.proxy.render()], `component ${Class.name}`);
    mounts.push(instance);
  }

  function startOutlet(unit: Unit): void {
    ops.push({ op: 'outlet', id: unit.id });
    start(unit, [() => renderPage(unit)], 'page');
  }

  function renderPage(unit: Unit): Child {
    const current = page.get();
    if (!current) return null;
    current.unit = unit;
    unit.owner = current;
    return current.proxy.render();
  }

  // --- Pages and messages ---

  function showPage(name: string | null, params: Readonly<Record<string, unknown>> = {}): void {
    const Class = name === null ? null : options.pages[name];
    if (name !== null && !Class) {
      report('page', new Error(`The theme has no page "${name}".`));
      return;
    }
    const previous = page.peek();
    if (previous && name !== null && previous.pageName === name) {
      // The same page with other parameters (another category): it stays, and what read them updates.
      previous.params.set(Object.freeze({ ...params }));
      return;
    }
    if (previous) {
      dispatch('leave', {}, [previous]);
      destroyInstance(previous);
    }
    if (!Class) {
      page.set(null);
      return;
    }
    const instance = createInstance(Class, null, { name: name as string, params });
    page.set(instance);
    mounts.push(instance);
  }

  /** Runs a change, lets everything it affects update, then sends the tree's changes at once. */
  function process(task: () => void): void {
    if (disposed) return;
    batch(task);
    while (mounts.length) {
      const mounted = mounts;
      mounts = [];
      batch(() => {
        for (const instance of mounted) if (instance.alive) dispatch('mount', {}, [instance]);
      });
    }
    if (ops.length) {
      const tree = ops;
      ops = [];
      options.post({ kind: 'tree', ops: tree });
    }
  }

  const root = createUnit(null, {});
  process(() => {
    ops.push({ op: 'root', id: root.id });
    if (options.layout) {
      const layout = createInstance(options.layout, root);
      root.owner = layout;
      root.instance = layout;
      start(root, [() => layout.proxy.render()], 'layout');
      mounts.push(layout);
    } else {
      startOutlet(root);
    }
  });

  return {
    store,
    receive(message) {
      switch (message.kind) {
        case 'state':
          process(() => ('patches' in message ? store.patch(message.patches) : store.set(message.value)));
          return;
        case 'page':
          process(() => showPage(message.name, message.params));
          return;
        case 'event': {
          let prevented = false;
          process(() => {
            const current = page.peek();
            prevented = dispatch(message.name, message.payload, current ? route(current.unit, current) : route(root));
          });
          if (message.id !== undefined && events.get(message.name)?.cancellable) {
            options.post({ kind: 'answer', id: message.id, prevented });
          }
          return;
        }
        case 'invoke':
          process(() => {
            const entry = callbacks.get(message.fn);
            if (!entry) return;
            invoking = entry.unit;
            try {
              entry.fn(...message.args);
            } catch (error) {
              report('callback', error);
            } finally {
              invoking = null;
            }
          });
          return;
      }
    },
    dispose() {
      process(() => {
        const current = page.peek();
        if (current) destroyInstance(current);
        destroyUnit(root);
      });
      disposed = true;
    }
  };
}

function keyed(key: Key | undefined): { k?: Key } {
  return key === undefined ? {} : { k: key };
}

/** Theme values as plain data: store views become ordinary objects, and functions are left out. */
function toPlain(value: unknown, depth = 0): unknown {
  if (depth > 32) throw new Error('A value is nested too deeply to send to the app.');
  if (value === null || typeof value !== 'object') return typeof value === 'function' ? undefined : value;
  if (Array.isArray(value)) return value.map((item) => toPlain(item, depth + 1));
  if (!isRecord(value)) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    const plain = toPlain(item, depth + 1);
    if (plain !== undefined) out[key] = plain;
  }
  return out;
}

function readOnly(message: string, get: (key: string) => unknown): object {
  return new Proxy(
    {},
    {
      get: (_, key) => (typeof key === 'string' ? get(key) : undefined),
      set: () => {
        throw new TypeError(message);
      },
      defineProperty: () => {
        throw new TypeError(message);
      },
      deleteProperty: () => {
        throw new TypeError(message);
      }
    }
  );
}
