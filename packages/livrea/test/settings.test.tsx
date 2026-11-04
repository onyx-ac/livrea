import { describe, expect, it } from 'vitest';
import {
  blockSlot,
  Component,
  defineBlock,
  definePattern,
  defineSettings,
  field,
  resolveSettings,
  settingsJson
} from '../src/index.js';
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

  it('validates and renders nested blocks, inner block slots, and patterns via field.blocks() and blockSlot()', () => {
    const Badge = defineBlock({
      id: 'status-badge',
      label: { en: 'Badge' },
      fields: {
        label: field.text({ label: { en: 'Label' }, default: 'Open' })
      },
      render({ label }) {
        return <span className="badge">{label}</span>;
      }
    });

    const Card = defineBlock({
      id: 'info-card',
      label: { en: 'Card' },
      fields: {
        tone: field.select({
          label: { en: 'Tone' },
          options: [
            { value: 'glass', label: { en: 'Glass' } },
            { value: 'gold', label: { en: 'Gold' } }
          ],
          default: 'glass'
        })
      },
      slots: ['Header', 'Body'],
      render({ tone }, slots) {
        return (
          <article className={`card-${tone}`}>
            <slots.Header />
            <slots.Body />
          </article>
        );
      }
    });

    const WelcomePattern = definePattern({
      id: 'welcome-card',
      label: { en: 'Welcome Card' },
      targetSlot: 'stage',
      tree: [
        {
          block: 'info-card',
          props: { tone: 'gold' },
          slots: {
            Header: [{ block: 'status-badge', props: { label: 'VIP' } }],
            Body: [{ block: 'status-badge' }]
          }
        }
      ]
    });

    const schema = defineSettings({
      stage: field.blocks({
        label: { en: 'Stage' },
        allowed: ['info-card', 'status-badge'],
        default: []
      })
    });

    const json = settingsJson(schema, { blocks: [Badge, Card], patterns: [WelcomePattern] });
    expect(Object.keys(json.blocks ?? {})).toEqual(['status-badge', 'info-card']);
    expect(json.patterns?.['welcome-card']?.for).toBe('stage');

    // Invalid prop values inside nested blocks fall back to each block field's default.
    const resolved = resolveSettings(
      schema,
      {
        stage: [
          {
            block: 'info-card',
            props: { tone: 'invalid-tone' },
            slots: {
              Header: [{ block: 'status-badge', props: { label: 'Live' } }]
            }
          }
        ]
      },
      json.blocks
    );
    expect(resolved.stage).toEqual([
      {
        block: 'info-card',
        props: { tone: 'glass' },
        slots: {
          Header: [{ block: 'status-badge', props: { label: 'Live' } }],
          Body: []
        }
      }
    ]);

    class Home extends Component {
      Stage = blockSlot('stage', () => <p>Default Stage</p>);
      render() {
        return (
          <div>
            <this.Stage />
            <Card tone="gold" Body={() => <Badge label="Direct" />} />
          </div>
        );
      }
    }

    const app = run({ pages: { home: Home }, settings: schema, blocks: [Badge, Card], state: STATE });
    app.runtime.receive({ kind: 'page', name: 'home' });
    expect(app.view()).toBe('<div><p>Default Stage</p><article class="card-gold"><span class="badge">Direct</span></article></div>');

    app.runtime.receive({
      kind: 'state',
      patches: [{ path: ['settings'], value: { stage: WelcomePattern.tree } }]
    });
    expect(app.view()).toBe(
      '<div><article class="card-gold"><span class="badge">VIP</span><span class="badge">Open</span></article><article class="card-gold"><span class="badge">Direct</span></article></div>'
    );
  });
});
