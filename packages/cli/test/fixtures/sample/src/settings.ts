import { defineSettings, field } from 'livrea';

export const settings = defineSettings({
  accent: field.color({ label: { en: 'Accent' }, default: '#336699' }),
  greeting: field.localizedText({ label: { en: 'Greeting' }, default: { en: 'Hello' } })
});
