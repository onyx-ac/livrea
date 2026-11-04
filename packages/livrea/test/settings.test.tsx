import { describe, expect, it } from 'vitest';
import { Component, defineSettings, field, resolveSettings, settingsJson } from '../src/index.js';
import { run, STATE } from './harness.js';
import { SETTINGS } from './settings.js';

describe('settings', () => {
  it('are plain data an admin can build its form from', () => {
    const json = JSON.parse(JSON.stringify(settingsJson(SETTINGS)));
    expect(json.format).toBe(1);
    expect(json.fields.accent).toEqual({ kind: 'color', label: { en: 'Accent' }, default: '#c9a96e' });
    expect(json.fields.showClock).toEqual({ kind: 'toggle', label: { en: 'Show the clock' }, default: false });
    expect(json.fields.layout.options.map((o: { value: string }) => o.value)).toEqual(['stage', 'split']);
  });

  it('are checked when the theme declares them', () => {
    expect(() => defineSettings({ 'bad name': field.toggle({ label: { en: 'x' } }) })).toThrow('letters and digits');
    expect(() => defineSettings({ size: field.range({ label: { en: 'x' }, min: 0, max: 10, step: 1, default: 20 }) })).toThrow('min ≤ default ≤ max');
    expect(() =>
      defineSettings({ mode: field.select({ label: { en: 'x' }, options: [{ value: 'a', label: { en: 'A' } }], default: 'b' as 'a' }) })
    ).toThrow('isn’t one of its options'.replace('’', "'"));
    expect(() => defineSettings({ accent: field.color({ label: { en: 'x' }, default: 'red' }) })).toThrow('doesn’t fit'.replace('’', "'"));
  });

  it('read as the default where the app’s value is missing or doesn’t fit', () => {
    const values = resolveSettings(SETTINGS, {
      accent: '#123456',
      welcome: { en: 'Hello', it: '' },
      layout: 'sideways',
      showClock: 'yes',
      radius: 99,
      background: '/media/lobby.jpg'
    });
    expect(values).toEqual({
      accent: '#123456',
      // A language left empty reads as the default's.
      welcome: { en: 'Hello', it: 'Benvenuti' },
      layout: 'stage',
      showClock: false,
      radius: 16,
      background: '/media/lobby.jpg'
    });
    expect(resolveSettings(SETTINGS, undefined).accent).toBe('#c9a96e');
  });

  it('reach theme code as this.settings, follow the app’s changes, and become CSS variables', () => {
    class Home extends Component {
      render() {
        return <p className={this.settings.layout}>{this.settings.welcome.en}</p>;
      }
    }
    const app = run({ pages: { home: Home }, settings: SETTINGS, state: { ...STATE, settings: { layout: 'split' } } });
    app.runtime.receive({ kind: 'page', name: 'home' });
    expect(app.view()).toBe('<p class="split">Welcome</p>');
    expect(app.tree.styles.get('livrea-settings')).toBe(':root {\n  --setting-accent: #c9a96e;\n  --setting-radius: 16px;\n}');

    app.updates();
    app.runtime.receive({ kind: 'state', patches: [{ path: ['settings'], value: { layout: 'split', welcome: { en: 'Hi' }, accent: '#000000' } }] });
    expect(app.view()).toBe('<p class="split">Hi</p>');
    expect(app.tree.styles.get('livrea-settings')).toContain('--setting-accent: #000000;');
  });

  it('can’t be changed by theme code', () => {
    class Home extends Component {
      render() {
        (this.settings as { accent: string }).accent = '#ffffff';
        return null;
      }
    }
    const app = run({ pages: { home: Home }, settings: SETTINGS });
    app.runtime.receive({ kind: 'page', name: 'home' });
    expect(app.errors().join()).toContain('Themes read their settings');
  });
});
