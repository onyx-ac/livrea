import type { EventCatalog, EventName } from './types.js';

/** How an event behaves; the app declares this for each event in its catalog. */
export interface EventInfo {
  /** Who raises it: the app, a base class's component, or a theme (`emit`). */
  readonly source: 'app' | 'component' | 'theme';
  /** Whether `preventDefault()` stops the default (and answers a `before:` event). */
  readonly cancellable: boolean;
  /** Whether it goes up from where it started: slot, component, page, layout. */
  readonly bubbles: boolean;
}

export const LIFECYCLE_EVENTS: Readonly<Record<'mount' | 'leave', EventInfo>> = {
  mount: { source: 'app', cancellable: false, bubbles: false },
  leave: { source: 'app', cancellable: false, bubbles: false }
};

/** For an event no one declared: a theme's own, emitted with `emit()`. */
export const THEME_EVENT: EventInfo = { source: 'theme', cancellable: true, bubbles: true };

export class EventBase<K extends EventName = EventName> {
  #prevented = false;
  #stopped = false;
  readonly name: K;
  readonly payload: Readonly<EventCatalog[K]>;
  readonly info: EventInfo;

  constructor(name: K, payload: EventCatalog[K], info: EventInfo) {
    this.name = name;
    this.payload = Object.freeze({ ...(payload as object) }) as Readonly<EventCatalog[K]>;
    this.info = info;
  }

  get defaultPrevented(): boolean {
    return this.#prevented;
  }

  get propagationStopped(): boolean {
    return this.#stopped;
  }

  /** Stops the default behaviour, if the event can be cancelled. */
  preventDefault(): void {
    if (this.info.cancellable) this.#prevented = true;
  }

  /** Stops the event from going further up. */
  stopPropagation(): void {
    this.#stopped = true;
  }
}

/** An event as listeners receive it: its payload's fields are on the event itself (`e.category`). */
export type ThemeEvent<K extends EventName = EventName> = EventBase<K> & Readonly<EventCatalog[K]>;

export function createEvent<K extends EventName>(name: K, payload: EventCatalog[K], info: EventInfo): ThemeEvent<K> {
  const event = new EventBase(name, payload, info);
  for (const [key, value] of Object.entries(event.payload)) {
    if (!(key in event)) Object.defineProperty(event, key, { value, enumerable: true });
  }
  return event as ThemeEvent<K>;
}

/**
 * A class's default behaviour per event: `static defaults: Defaults<HomePage> = {…}`.
 * (Method syntax keeps a subclass's defaults assignable to its base class's.)
 */
export type Defaults<C> = {
  [K in EventName]?: { handle(component: C, event: ThemeEvent<K>): void }['handle'];
};
