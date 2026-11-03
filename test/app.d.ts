/** The test app's store and event catalog, declared the way an app declares its own. */
import '../src/types.js';

declare module '../src/types.js' {
  interface ThemeStore {
    site: { name: string };
    categories: readonly { id: string; name: string }[];
    menu: readonly { id: number; title: string; course: string }[];
  }

  interface EventCatalog {
    'rail:press': { category: { id: string; name: string } };
    'session:start': {};
    'before:navigate': { to: string };
    'promo:seen': { id: string };
  }
}
