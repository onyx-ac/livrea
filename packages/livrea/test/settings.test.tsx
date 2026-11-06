import { describe, expect, it } from 'vitest';
import {
  blockSlot,
  checkThemeData,
  dataField,
  defineData,
  withSampleData,
  Component,
  EDIT_BLOCK_HOST,
  EDIT_SLOT_HOST,
  defineBlock,
  definePattern,
  defineSettings,
  field,
  resolveSettings,
  settingsJson
} from '../src/index.js';
import { createRuntime } from '../src/runtime.js';
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

describe('blocks while a builder edits them', () => {
  const Card = defineBlock({
    id: 'marker-card',
    label: { en: 'Card' },
    slots: ['Body'],
    render(_props, slots) {
      return (
        <section>
          <slots.Body />
        </section>
      );
    }
  });
  const Text = defineBlock({ id: 'marker-text', label: { en: 'Text' }, render: () => <p>text</p> });
  const Columns = defineBlock({
    id: 'marker-columns',
    label: { en: 'Columns' },
    slots: ['Left', 'Right'],
    render(_props, slots) {
      return (
        <div>
          <slots.Left />
          <slots.Right />
        </div>
      );
    }
  });
  const settings = defineSettings({ stage: field.blocks({ label: { en: 'Stage' }, default: [] }) });
  class Page extends Component {
    Stage = blockSlot('stage', () => <p>fallback</p>);
    render() {
      return (
        <main>
          <this.Stage />
        </main>
      );
    }
  }
  const STAGE = [
    { block: 'marker-text' },
    { block: 'marker-card', slots: { Body: [{ block: 'marker-text' }] } },
    { block: 'marker-card' },
    { block: 'marker-columns', slots: { Left: [{ block: 'marker-text' }] } }
  ];
  const render = (editing: boolean | undefined, stage: unknown) => {
    const ops: unknown[] = [];
    const runtime = createRuntime({
      pages: { page: Page },
      settings,
      blocks: [Card, Text, Columns],
      editing,
      state: { settings: { stage } },
      post: (message) => {
        if (message.kind === 'tree') ops.push(...message.ops);
      }
    });
    runtime.receive({ kind: 'page', name: 'page' });
    return JSON.stringify(ops);
  };
  const markers = (json: string, name: string) =>
    [...json.matchAll(new RegExp(`"name":"${name}","props":(\\{.*?\\}),"c"`, 'g'))].map((m) => JSON.parse(m[1]!));

  it('carry no markers otherwise', () => {
    expect(render(undefined, STAGE)).not.toContain('LivreaEdit');
    expect(render(false, STAGE)).not.toContain('LivreaEdit');
  });

  it('say where each block and slot is, nested, by its place in the list', () => {
    const json = render(true, STAGE);
    expect(markers(json, EDIT_BLOCK_HOST).map((m) => m.path)).toEqual(expect.arrayContaining([[0], [1], [2], [1, 'Body', 0]]));
    const slots = markers(json, EDIT_SLOT_HOST);
    expect(slots).toEqual(
      expect.arrayContaining([
        { setting: 'stage', path: [], count: 4 },
        { setting: 'stage', path: [1, 'Body'], count: 1 },
        { setting: 'stage', path: [2, 'Body'], count: 0 },
        // Beside a filled slot, an empty one says so; alone in an empty block, it doesn't.
        { setting: 'stage', path: [3, 'Left'], count: 1 },
        { setting: 'stage', path: [3, 'Right'], count: 0, siblings: 1 }
      ])
    );
  });

  it('mark an empty stage too, around what the theme shows instead', () => {
    const json = render(true, []);
    expect(markers(json, EDIT_SLOT_HOST)).toEqual([{ setting: 'stage', path: [], count: 0 }]);
    expect(json).toContain('fallback');
  });
});

describe('the data a theme reads', () => {
  const data = defineData({
    articles: dataField.list({
      label: { en: 'Articles' },
      item: { id: 'string', title: 'string', minutes: 'number?' },
      sample: [{ id: 'a', title: 'Hello' }]
    }),
    hotel: dataField.record({ label: { en: 'Hotel' }, fields: { name: 'string' }, sample: { name: 'Grand View' } }),
    tagline: dataField.value({ label: { en: 'Tagline' }, type: 'string', sample: 'Welcome' })
  });

  it('is plain data, in settings.json', () => {
    const json = JSON.parse(JSON.stringify(settingsJson(SETTINGS, { data })));
    expect(json.data.articles.item.minutes).toBe('number?');
    expect(json.data.tagline.sample).toBe('Welcome');
    expect('data' in settingsJson(SETTINGS)).toBe(false);
  });

  it.each([
    ['a sample missing a value', { x: dataField.list({ label: { en: 'X' }, item: { id: 'string' }, sample: [{}] as never }) }, 'its sample[0].id is missing'],
    ['a sample of the wrong type', { x: dataField.value({ label: { en: 'X' }, type: 'number', sample: 'one' as never }) }, 'should be a number'],
    ['a list that is not one', { x: dataField.list({ label: { en: 'X' }, item: {}, sample: {} as never }) }, 'should be a list'],
    ['no label', { x: dataField.value({ label: {}, type: 'string', sample: 'a' }) }, 'needs a label'],
    ['a bad name', { 'no spaces': dataField.value({ label: { en: 'X' }, type: 'string', sample: 'a' }) }, 'needs a name'],
    ['the store\'s own settings', { settings: dataField.value({ label: { en: 'X' }, type: 'string', sample: 'a' }) }, 'needs a name'],
    ['a huge sample', { x: dataField.value({ label: { en: 'X' }, type: 'string', sample: 'a'.repeat(300 * 1024) }) }, 'over 256 KB']
  ])('refuses %s as the theme is defined', (_, schema, message) => {
    expect(() => defineData(schema as never)).toThrow(message);
  });

  it('takes nested data as `any`, checking only that it is there', () => {
    const nested = defineData({ content: dataField.record({ label: { en: 'Content' }, fields: { rooms: 'any', extra: 'any?' }, sample: { rooms: [{ beds: 2 }] } }) });
    expect(checkThemeData(nested, { content: { rooms: [] } })[0]?.status).toBe('provided');
    expect(checkThemeData(nested, { content: {} })[0]?.problem).toBe('content.rooms is missing.');
  });

  it('reports what an app provides, lacks, or has in the wrong shape', () => {
    const checks = checkThemeData(data, { articles: [{ id: 'a', title: 'x' }, { id: 'b', title: 3 }], hotel: { name: 'H' } });
    expect(checks).toEqual([
      { name: 'articles', status: 'invalid', problem: 'articles[1].title should be a string, and is a number.' },
      { name: 'hotel', status: 'provided' },
      { name: 'tagline', status: 'missing' }
    ]);
    expect(checkThemeData(undefined, {})).toEqual([]);
    expect(checkThemeData(data, { articles: [], hotel: { name: 'H' }, tagline: 'x' }).every((c) => c.status === 'provided')).toBe(true);
  });

  it('fills previews with samples, keeping what the app has', () => {
    const state = withSampleData(data, { tagline: 'Ours', language: 'en', settings: {} });
    expect(state.tagline).toBe('Ours');
    expect(state.articles).toEqual([{ id: 'a', title: 'Hello' }]);
    expect(state.language).toBe('en');
  });

  it("can't reach the rest of the state from an uploaded settings.json", () => {
    const uploaded = JSON.parse('{"settings":{"kind":"value","sample":"x"},"__proto__":{"kind":"value","sample":"y"},"constructor":{"kind":"value","sample":"z"},"unknown":{"kind":"later","sample":1}}');
    const state = withSampleData(uploaded, { settings: { real: true } }) as Record<string, unknown>;
    expect(state.settings).toEqual({ real: true });
    expect(({} as Record<string, unknown>).kind).toBeUndefined();
    expect(state.unknown).toBe(1);
    expect(checkThemeData(uploaded, { unknown: 'anything' }).find((c) => c.name === 'unknown')?.status).toBe('provided');
  });

  it('never reaches a running theme by itself', () => {
    const seen: unknown[] = [];
    class Page extends Component {
      render() {
        seen.push((this.store as unknown as { articles?: unknown }).articles);
        return <p>page</p>;
      }
    }
    const runtime = createRuntime({ pages: { page: Page }, state: {}, post: () => {} });
    runtime.receive({ kind: 'page', name: 'page' });
    expect(seen).toEqual([undefined]);
  });
});
