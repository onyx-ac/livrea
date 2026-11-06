import { dataField, defineData } from 'livrea';
import samples from './samples.json';

export const data = defineData({
  rooms: dataField.list({ label: { en: 'Rooms' }, item: { id: 'string', beds: 'number?', name: 'string' }, sample: samples.rooms })
});
