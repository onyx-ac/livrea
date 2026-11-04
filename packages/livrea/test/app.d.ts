/** The test app's store and event catalog, and the test theme's settings, declared the way apps and themes declare theirs. */
import '../src/types.js';
import type { SettingsValues } from '../src/settings.js';
import type { SETTINGS } from './settings.js';

declare module '../src/types.js' {
  interface ThemeStore {
    site: { name: string };
    categories: readonly { id: string; name: string }[];
    menu: readonly { id: number; title: string; course: string }[];
  }

  interface ThemeSettings extends SettingsValues<typeof SETTINGS> {}

  interface EventCatalog {
    'rail:press': { category: { id: string; name: string } };
    'session:start': {};
    'before:navigate': { to: string };
    'promo:seen': { id: string };
  }
}
