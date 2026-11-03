/**
 * The types an app describes for its themes, by augmenting these interfaces:
 *
 *   declare module 'livrea' {
 *     interface ThemeStore { site: { name: string } }
 *     interface EventCatalog { 'rail:press': { category: { id: string } } }
 *   }
 */

/** The app's store, as theme code reads it (`this.store`, and `s` in selectors). */
export interface ThemeStore {}

/** Every event themes can listen to, with its payload. */
export interface EventCatalog {
  /** The page or component came on screen. */
  mount: {};
  /** The page or component is leaving the screen. */
  leave: {};
}

export type EventName = keyof EventCatalog & string;

export type Cleanup = () => void;
