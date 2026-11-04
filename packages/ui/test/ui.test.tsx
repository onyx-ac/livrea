// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { definePattern, defineSettings, field, settingsJson, type BlockSchema } from 'livrea';
import { describe, expect, it } from 'vitest';
import {
  BlockTree,
  cloneBlockTree,
  getBlockAtPath,
  insertBlocksAtSlotPath,
  moveBlockAtPath,
  PatternPicker,
  removeBlockAtPath,
  SettingsForm,
  ThemeBuilder,
  updateBlockAtPath
} from '../src/index.js';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

function mount(element: ReactNode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(element));
  return {
    container,
    rerender(next: ReactNode) {
      act(() => root.render(next));
    },
    unmount() {
      act(() => root.unmount());
      container.remove();
    }
  };
}

const BLOCKS: Readonly<Record<string, BlockSchema>> = {
  'split-columns': {
    label: { en: 'Split Columns' },
    fields: {
      ratio: field.select({
        label: { en: 'Ratio' },
        options: [
          { value: '1:1', label: { en: 'Equal' } },
          { value: '1:2', label: { en: 'Wide Right' } }
        ],
        default: '1:1'
      })
    },
    slots: ['Left', 'Right']
  },
  card: {
    label: { en: 'Card' },
    fields: {
      tone: field.select({
        label: { en: 'Style' },
        options: [
          { value: 'glass', label: { en: 'Glass' } },
          { value: 'gold', label: { en: 'Gold' } }
        ],
        default: 'glass'
      }),
      padding: field.range({
        label: { en: 'Padding' },
        min: 8,
        max: 48,
        step: 4,
        unit: 'px',
        default: 24
      })
    },
    slots: ['Body']
  },
  'daily-menu': {
    label: { en: 'Daily Menu' },
    fields: {
      title: field.text({ label: { en: 'Title' }, default: "Today's Menu" })
    }
  }
};

const WELCOME_PATTERN = definePattern({
  id: 'welcome-split',
  label: { en: 'Welcome Split' },
  for: 'homeStage',
  tree: [
    {
      block: 'split-columns',
      props: { ratio: '1:2' },
      slots: {
        Left: [{ block: 'daily-menu', props: { title: 'Breakfast' } }],
        Right: [{ block: 'card', props: { tone: 'gold', padding: 32 } }]
      }
    }
  ]
});

const SCHEMA = settingsJson(
  defineSettings({
    accent: field.color({ label: { en: 'Accent Colour' }, default: '#c9a96e' }),
    showClock: field.toggle({ label: { en: 'Show Clock' }, default: true }),
    welcome: field.localizedText({ label: { en: 'Welcome' }, default: { en: 'Hello', it: 'Ciao' } }),
    homeStage: field.blocks({
      label: { en: 'Home Stage' },
      allowed: ['split-columns', 'card', 'daily-menu'],
      default: []
    })
  }),
  {
    blocks: BLOCKS,
    patterns: [WELCOME_PATTERN]
  }
);

describe('@livrea/ui tree operations', () => {
  it('reads, updates, moves, inserts, and removes nested blocks at any depth', () => {
    const initial = cloneBlockTree(WELCOME_PATTERN.tree, BLOCKS);
    expect(getBlockAtPath(initial, [0, 'Right', 0])?.block).toBe('card');

    const withChild = insertBlocksAtSlotPath(initial, [0, 'Right', 0, 'Body'], [
      { block: 'daily-menu', props: { title: 'Mains' } },
      { block: 'daily-menu', props: { title: 'Desserts' } }
    ]);
    expect(getBlockAtPath(withChild, [0, 'Right', 0, 'Body', 1])?.props?.title).toBe('Desserts');

    const moved = moveBlockAtPath(withChild, [0, 'Right', 0, 'Body', 1], -1);
    expect(getBlockAtPath(moved, [0, 'Right', 0, 'Body', 0])?.props?.title).toBe('Desserts');

    const updated = updateBlockAtPath(moved, [0, 'Right', 0], (node) => ({
      ...node,
      props: { ...node.props, tone: 'glass' }
    }));
    expect(getBlockAtPath(updated, [0, 'Right', 0])?.props?.tone).toBe('glass');

    const removed = removeBlockAtPath(updated, [0, 'Right', 0, 'Body', 0]);
    expect(getBlockAtPath(removed, [0, 'Right', 0, 'Body', 0])?.props?.title).toBe('Mains');
  });
});

describe('<SettingsForm />', () => {
  it('renders scalar controls and emits updated values', () => {
    let current: Record<string, unknown> = { accent: '#c9a96e', showClock: true };
    const view = mount(
      <SettingsForm
        fields={SCHEMA.fields}
        values={current}
        onChange={(next) => {
          current = next;
        }}
      />
    );

    const checkbox = view.container.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(checkbox.checked).toBe(true);
    act(() => checkbox.click());
    expect(current.showClock).toBe(false);

    view.unmount();
  });
});

describe('<PatternPicker /> and <BlockTree />', () => {
  it('unpacks a pattern into a slot and allows selecting and reordering blocks', () => {
    let tree = cloneBlockTree([], BLOCKS);
    let selected: readonly (number | string)[] | null = null;

    const view = mount(
      <BlockTree
        tree={tree}
        blocks={BLOCKS}
        patterns={SCHEMA.patterns}
        slotName="homeStage"
        selectedPath={selected}
        onSelect={(path) => {
          selected = path;
        }}
        onChange={(next) => {
          tree = next;
        }}
      />
    );

    const patternButton = Array.from(view.container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Welcome Split')
    )!;
    act(() => patternButton.click());
    expect(tree.length).toBe(1);
    expect(tree[0]?.block).toBe('split-columns');

    view.rerender(
      <BlockTree
        tree={tree}
        blocks={BLOCKS}
        patterns={SCHEMA.patterns}
        slotName="homeStage"
        selectedPath={selected}
        onSelect={(path) => {
          selected = path;
        }}
        onChange={(next) => {
          tree = next;
        }}
      />
    );

    // Select the inner Card block inside Right slot ([0, 'Right', 0]).
    const cardButton = Array.from(view.container.querySelectorAll('button')).find((b) => b.textContent === 'Card')!;
    act(() => cardButton.click());
    expect(selected).toEqual([0, 'Right', 0]);

    view.unmount();
  });

  it('filters patterns by targetSlot in <PatternPicker />', () => {
    const view = mount(
      <PatternPicker
        patterns={SCHEMA.patterns!}
        targetSlot="otherSlot"
        onPick={() => {}}
      />
    );
    expect(view.container.textContent).toContain('No patterns available');
    view.unmount();
  });
});

describe('<ThemeBuilder />', () => {
  it('combines outline, pattern inserter, and block inspector to edit nested block props', () => {
    let settingsValues: Record<string, unknown> = {
      accent: '#c9a96e',
      homeStage: cloneBlockTree(WELCOME_PATTERN.tree, BLOCKS)
    };

    const view = mount(
      <ThemeBuilder
        schema={SCHEMA}
        values={settingsValues}
        onChange={(next) => {
          settingsValues = next;
        }}
      />
    );

    // Click the nested Card block in the left outline.
    const cardButton = Array.from(view.container.querySelectorAll('button')).find((b) => b.textContent === 'Card')!;
    act(() => cardButton.click());

    view.rerender(
      <ThemeBuilder
        schema={SCHEMA}
        values={settingsValues}
        onChange={(next) => {
          settingsValues = next;
        }}
      />
    );

    // The right-hand Inspector now shows "Block: Card" and its "Style" select input.
    const inspector = view.container.querySelector('[aria-label="Block Inspector"]')!;
    expect(inspector.textContent).toContain('Block: Card');
    const styleSelect = inspector.querySelector<HTMLSelectElement>('select[aria-label="Style"]')!;
    expect(styleSelect.value).toBe('gold');

    act(() => {
      styleSelect.value = 'glass';
      styleSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const updatedTree = settingsValues.homeStage as typeof WELCOME_PATTERN.tree;
    expect(getBlockAtPath(updatedTree, [0, 'Right', 0])?.props?.tone).toBe('glass');

    view.unmount();
  });
});

