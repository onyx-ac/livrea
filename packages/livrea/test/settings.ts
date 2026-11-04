/** A theme's settings, declared the way a theme declares its own (and typed in app.d.ts). */
import { defineSettings, field } from '../src/index.js';

export const SETTINGS = defineSettings({
  accent: field.color({ label: { en: 'Accent' }, default: '#c9a96e' }),
  welcome: field.localizedText({ label: { en: 'Welcome' }, default: { en: 'Welcome', it: 'Benvenuti' } }),
  layout: field.select({
    label: { en: 'Layout' },
    options: [
      { value: 'stage', label: { en: 'Host in the middle' } },
      { value: 'split', label: { en: 'Host on the side' } }
    ],
    default: 'stage'
  }),
  showClock: field.toggle({ label: { en: 'Show the clock' } }),
  radius: field.range({ label: { en: 'Corners' }, min: 0, max: 32, step: 2, unit: 'px', default: 16 }),
  background: field.image({ label: { en: 'Background' } })
});
