import { defineSettings, field, dataField, defineData } from 'livrea';

export const settings = defineSettings({
  accent: field.color({ label: { en: 'Accent' }, default: '#336699' }),
  greeting: field.localizedText({ label: { en: 'Greeting' }, default: { en: 'Hello' } })
});

export const data = defineData({
  rooms: dataField.list({ label: { en: 'Rooms' }, item: { id: 'string', beds: 'number?' }, sample: [{ id: 'r1', beds: 2 }] })
});
