// @vitest-environment jsdom
import { act, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { dataField, defineData, definePattern, defineSettings, field, settingsJson, type BlockNode, type BlockSchema } from 'livrea';
import { describe, expect, it, vi } from 'vitest';
import {
  BlockTree,
  cloneBlockTree,
  getBlockAtPath,
  insertBlocksAtSlotPath,
  moveBlockAtPath,
  PatternPicker,
  removeBlockAtPath,
  reorderBlockInSlot,
  SettingsForm,
  ThemeBuilder,
  updateBlockAtPath,
  moveBlock,
  nearestGap,
  pathAfterMove,
  pathAfterRemoval
} from '../src/index.js';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

if (typeof globalThis.CSS === 'undefined') {
  (globalThis as Record<string, unknown>).CSS = {
    escape: (s: string) => s
  };
} else if (!globalThis.CSS.escape) {
  globalThis.CSS.escape = (s: string) => s;
}

if (typeof HTMLDialogElement !== 'undefined') {
  HTMLDialogElement.prototype.showModal = HTMLDialogElement.prototype.showModal || function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = HTMLDialogElement.prototype.close || function (this: HTMLDialogElement) { this.removeAttribute('open'); };
}

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

    const reordered = reorderBlockInSlot(moved, [0, 'Right', 0, 'Body'], 0, 1);
    expect(getBlockAtPath(reordered, [0, 'Right', 0, 'Body', 0])?.props?.title).toBe('Mains');
    expect(getBlockAtPath(reordered, [0, 'Right', 0, 'Body', 1])?.props?.title).toBe('Desserts');

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

    // Sections with nested content are default collapsed; expand to reveal inner Card block.
    const expandBtn = view.container.querySelector<HTMLButtonElement>('button[aria-label="Expand Split Columns"]');
    if (expandBtn) act(() => expandBtn.click());

    // Select the inner Card block inside Right slot ([0, 'Right', 0]).
    const cardButton = Array.from(view.container.querySelectorAll('button')).find((b) => b.textContent === 'Card')!;
    act(() => cardButton.click());
    expect(selected).toEqual([0, 'Right', 0]);

    // A single item in a slot has both Up and Down buttons disabled.
    const moveCardUp = view.container.querySelector<HTMLButtonElement>('button[aria-label="Move Card up"]')!;
    const moveCardDown = view.container.querySelector<HTMLButtonElement>('button[aria-label="Move Card down"]')!;
    expect(moveCardUp.disabled || moveCardUp.getAttribute('aria-disabled') === 'true').toBe(true);
    expect(moveCardDown.disabled || moveCardDown.getAttribute('aria-disabled') === 'true').toBe(true);

    view.unmount();
  });

  it('disables up arrow on first item and down arrow on last item in a multi-block slot', () => {
    const twoItemTree = cloneBlockTree(
      [
        { block: 'card' },
        { block: 'daily-menu' }
      ],
      BLOCKS
    );
    const view = mount(<BlockTree tree={twoItemTree} blocks={BLOCKS} onChange={() => {}} />);

    const firstUp = view.container.querySelector<HTMLButtonElement>('button[aria-label="Move Card up"]')!;
    const firstDown = view.container.querySelector<HTMLButtonElement>('button[aria-label="Move Card down"]')!;
    const lastUp = view.container.querySelector<HTMLButtonElement>('button[aria-label="Move Daily Menu up"]')!;
    const lastDown = view.container.querySelector<HTMLButtonElement>('button[aria-label="Move Daily Menu down"]')!;

    expect(firstUp.disabled || firstUp.getAttribute('aria-disabled') === 'true').toBe(true);
    expect(firstDown.disabled || firstDown.getAttribute('aria-disabled') === 'true').toBe(false);
    expect(lastUp.disabled || lastUp.getAttribute('aria-disabled') === 'true').toBe(false);
    expect(lastDown.disabled || lastDown.getAttribute('aria-disabled') === 'true').toBe(true);

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

    const inspector = view.container.querySelector('[aria-label="Inspector"]')!;
    // With no block selected, the inspector exclusively shows Theme Settings.
    expect(inspector.textContent).toContain('Theme Settings');
    expect(inspector.textContent).not.toContain('Block: Card');

    // Expand the collapsed nested block.
    const expandBtn = view.container.querySelector<HTMLButtonElement>('button[aria-label="Expand Split Columns"]');
    if (expandBtn) act(() => expandBtn.click());

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

    // The right-hand Inspector now exclusively shows "Block: Card" (hiding Theme Settings) and its "Style" select input.
    expect(inspector.textContent).toContain('Block: Card');
    expect(inspector.textContent).not.toContain('Show Clock');
    expect(inspector.textContent).toContain('Style');

    const combobox = inspector.querySelector<HTMLButtonElement>('button[role="combobox"]');
    if (combobox) {
      act(() => combobox.click());
      const glassOption = Array.from(document.querySelectorAll('[role="option"]')).find((o) =>
        o.textContent?.includes('Glass')
      ) as HTMLElement | undefined;
      if (glassOption) {
        act(() => glassOption.click());
      }
    }

    const updatedTree = settingsValues.homeStage as typeof WELCOME_PATTERN.tree;
    expect(getBlockAtPath(updatedTree, [0, 'Right', 0])?.props?.tone).toBe('glass');

    // Clicking "← Theme Settings" deselects the block and returns to Theme Settings.
    const backBtn = Array.from(inspector.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Theme Settings')
    )!;
    act(() => backBtn.click());
    expect(inspector.textContent).toContain('Show Clock');
    expect(inspector.textContent).not.toContain('Block: Card');

    view.unmount();
  });
});


describe('moving blocks', () => {
  const t = (id: string, slots?: Record<string, BlockNode[]>): BlockNode => ({ block: id, ...(slots ? { slots } : {}) });
  const ids = (nodes: readonly BlockNode[]) => nodes.map((n) => n.block);

  it('reorders within a slot, by the gaps as they are before the move', () => {
    const tree = [t('a'), t('b'), t('c')];
    expect(ids(moveBlock(tree, [0], [], 3)!.tree)).toEqual(['b', 'c', 'a']);
    expect(moveBlock(tree, [0], [], 3)!.path).toEqual([2]);
    expect(ids(moveBlock(tree, [2], [], 0)!.tree)).toEqual(['c', 'a', 'b']);
    expect(moveBlock(tree, [2], [], 0)!.path).toEqual([0]);
  });

  it('does nothing when the block is already there', () => {
    const tree = [t('a'), t('b')];
    expect(moveBlock(tree, [0], [], 0)).toBeNull();
    expect(moveBlock(tree, [0], [], 1)).toBeNull();
  });

  it('moves into another slot, even an empty one, and out of one', () => {
    const tree = [t('x', { L: [t('a'), t('b')], R: [] }), t('y')];
    const across = moveBlock(tree, [0, 'L', 0], [0, 'R'], 0)!;
    expect(ids(across.tree[0]!.slots!.L!)).toEqual(['b']);
    expect(ids(across.tree[0]!.slots!.R!)).toEqual(['a']);
    expect(across.path).toEqual([0, 'R', 0]);
    const out = moveBlock(tree, [0, 'L', 1], [], 1)!;
    expect(ids(out.tree)).toEqual(['x', 'b', 'y']);
    expect(out.path).toEqual([1]);
  });

  it('keeps the target right when the move shifts what leads to it', () => {
    const tree = [t('a'), t('x', { L: [t('b')] })];
    const moved = moveBlock(tree, [0], [1, 'L'], 1)!;
    expect(ids(moved.tree)).toEqual(['x']);
    expect(ids(moved.tree[0]!.slots!.L!)).toEqual(['b', 'a']);
    expect(moved.path).toEqual([0, 'L', 1]);
  });

  it('refuses to put a block inside itself', () => {
    const tree = [t('x', { L: [t('y', { M: [] })] })];
    expect(moveBlock(tree, [0], [0, 'L'], 0)).toBeNull();
    expect(moveBlock(tree, [0], [0, 'L', 0, 'M'], 0)).toBeNull();
    expect(moveBlock(tree, [9], [], 0)).toBeNull();
  });

  it('keeps nodes and their inner slots whole', () => {
    const inner = t('x', { L: [t('a')] });
    expect(moveBlock([t('b'), inner], [1], [], 0)!.tree[0]).toBe(inner);
  });

  it('keeps a selection on its block as others move or go', () => {
    expect(pathAfterRemoval([2], [0])).toEqual([1]);
    expect(pathAfterRemoval([0], [2])).toEqual([0]);
    expect(pathAfterRemoval([1, 'L', 0], [0])).toEqual([0, 'L', 0]);
    expect(pathAfterRemoval([1, 'L', 0], [1])).toBeNull();
    expect(pathAfterMove([1], [0], [], 3)).toEqual([0]);
    expect(pathAfterMove([0], [0], [], 3)).toEqual([2]);
    expect(pathAfterMove([0, 'L', 0], [0], [], 2)).toEqual([1, 'L', 0]);
    expect(pathAfterMove([1], [2], [], 0)).toEqual([2]);
  });
});

describe('the nearest gap', () => {
  const box = (left: number, top: number, right: number, bottom: number) => ({ left, top, right, bottom });

  it('runs along a stack', () => {
    const stack = [box(0, 0, 100, 50), box(0, 60, 100, 110)];
    expect(nearestGap(stack, 50, 10)?.index).toBe(0);
    expect(nearestGap(stack, 50, 40)?.index).toBe(1);
    expect(nearestGap(stack, 50, 70)?.index).toBe(1);
    expect(nearestGap(stack, 50, 500)?.index).toBe(2);
    expect(nearestGap(stack, 50, 40)?.line).toEqual({ left: 0, right: 100, top: 50, bottom: 50 });
  });

  it('runs across a row, and shows a vertical line', () => {
    const row = [box(0, 0, 50, 100), box(60, 0, 110, 100)];
    expect(nearestGap(row, 10, 50)?.index).toBe(0);
    expect(nearestGap(row, 40, 50)?.index).toBe(1);
    expect(nearestGap(row, 100, 50)?.index).toBe(2);
    expect(nearestGap(row, 40, 50)?.line).toEqual({ left: 50, right: 50, top: 0, bottom: 100 });
  });

  it('follows a wrapping grid', () => {
    const grid = [box(0, 0, 50, 50), box(60, 0, 110, 50), box(0, 60, 50, 110), box(60, 60, 110, 110)];
    expect(nearestGap(grid, 100, 100)?.index).toBe(4);
    expect(nearestGap(grid, 5, 70)?.index).toBe(2);
  });

  it('has nothing to say without blocks', () => {
    expect(nearestGap([], 0, 0)).toBeNull();
  });
});

describe('undo and redo', () => {
  const start = () => ({ accent: '#c9a96e', homeStage: cloneBlockTree(WELCOME_PATTERN.tree, BLOCKS) }) as Record<string, unknown>;
  let current: Record<string, unknown>;
  let replace: (values: Record<string, unknown>) => void;

  function Stateful() {
    const [values, setValues] = useState(start);
    current = values;
    replace = setValues;
    return <ThemeBuilder schema={SCHEMA} values={values} onChange={setValues} client={undefined} />;
  }

  const button = (root: ParentNode, label: string) => root.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  const press = (key: string, options: KeyboardEventInit = {}, target: EventTarget = window) =>
    act(() => void target.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true, ...options })));
  const count = () => (current.homeStage as readonly BlockNode[]).length;
  const removeFirst = (root: ParentNode) => {
    const remove = root.querySelector<HTMLButtonElement>('button[aria-label^="Remove "]')!;
    act(() => remove.click());
  };

  it('takes a removal back and forward with the keyboard, restoring the very same values', () => {
    const view = mount(<Stateful />);
    const before = current;
    removeFirst(view.container);
    const after = current;
    expect(count()).toBe((before.homeStage as readonly BlockNode[]).length - 1);
    press('z');
    expect(current).toBe(before);
    press('z', { shiftKey: true });
    expect(current).toBe(after);
    press('z');
    press('y');
    expect(current).toBe(after);
    view.unmount();
  });

  it('does nothing with nothing to undo, and a new change ends what could be redone', () => {
    const view = mount(<Stateful />);
    const before = current;
    press('z');
    press('y');
    expect(current).toBe(before);
    removeFirst(view.container);
    press('z');
    expect(current).toBe(before);
    removeFirst(view.container);
    const changed = current;
    press('y');
    expect(current).toBe(changed);
    view.unmount();
  });

  it('leaves a text field its own undo', () => {
    const view = mount(<Stateful />);
    removeFirst(view.container);
    const after = current;
    const field = view.container.querySelector('[aria-label="Inspector"] input')!;
    press('z', {}, field);
    expect(current).toBe(after);
    view.unmount();
  });

  it('counts quick changes to one field as one step, and others as their own', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const view = mount(<Stateful />);
      const before = current;
      const type = (value: string) => {
        const field = view.container.querySelector<HTMLInputElement>('[aria-label="Inspector"] input[type="text"]')!;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        act(() => {
          setter.call(field, value);
          field.dispatchEvent(new Event('input', { bubbles: true }));
        });
      };
      type('a');
      vi.advanceTimersByTime(100);
      type('ab');
      const firstWord = current;
      vi.advanceTimersByTime(2000);
      type('abc');
      expect(current).not.toBe(firstWord);
      press('z');
      expect(current).toBe(firstWord);
      press('z');
      expect(current).toBe(before);
      view.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it("starts over when the app replaces the values itself", () => {
    const view = mount(<Stateful />);
    removeFirst(view.container);
    const fresh = start();
    act(() => replace(fresh));
    press('z');
    expect(current).toBe(fresh);
    view.unmount();
  });

  it('ignores the keys while a block is being dragged', () => {
    const view = mount(<Stateful />);
    removeFirst(view.container);
    const after = current;
    const marker = document.createElement('div');
    marker.className = 'livrea-ui-editor';
    marker.setAttribute('data-dragging', '');
    view.container.querySelector('.livrea-ui-builder')!.append(marker);
    press('z');
    expect(current).toBe(after);
    marker.remove();
    press('z');
    expect(current).not.toBe(after);
    view.unmount();
  });
});

describe('the Data section', () => {
  const data = defineData({
    articles: dataField.list({ label: { en: 'Articles', it: 'Articoli' }, item: { title: 'string' }, sample: [{ title: 'a' }, { title: 'b' }] }),
    tagline: dataField.value({ label: { en: 'Tagline' }, help: { en: 'Under the name.' }, type: 'string', sample: 'x' }),
    hotel: dataField.record({ label: { en: 'Hotel' }, fields: { name: 'string' }, sample: { name: 'x' } })
  });
  const section = (root: ParentNode) => root.querySelector('[role="group"][aria-label="Data"]');
  const render = (provided?: Record<string, unknown>, locale?: string) =>
    mount(<ThemeBuilder schema={{ ...SCHEMA, data }} values={{}} onChange={() => {}} data={provided} locale={locale} />);

  it('says the preview shows samples until the app provides the data', () => {
    const view = render();
    const text = section(view.container)!.textContent!;
    expect(text).toContain('Sample data · 2');
    expect(text).toContain('Under the name.');
    view.unmount();
  });

  it('tells what the app provides from what it provides wrongly', () => {
    const view = render({ articles: [{ title: 'real' }], tagline: 3 });
    const rows = Array.from(section(view.container)!.querySelectorAll('li')).map((row) => [row.getAttribute('data-status'), row.textContent]);
    expect(rows[0]![0]).toBe('provided');
    expect(rows[0]![1]).toContain('From the app · 1');
    expect(rows[1]![0]).toBe('invalid');
    expect(rows[1]![1]).toContain('tagline should be a string, and is a number.');
    expect(rows[2]![0]).toBe('missing');
    view.unmount();
  });

  it('speaks the builder\'s language', () => {
    const view = render(undefined, 'it');
    expect(section(view.container)!.textContent).toContain('Articoli');
    view.unmount();
  });

  it('is left out for a theme that declares nothing', () => {
    const view = mount(<ThemeBuilder schema={SCHEMA} values={{}} onChange={() => {}} />);
    expect(section(view.container)).toBeNull();
    view.unmount();
  });
});

