import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react';
import { CommandPalette, createStaticSource } from '@astryxdesign/core';
import { EDIT_BLOCK_HOST, EDIT_SLOT_HOST, type BlockSchema } from 'livrea';
import { hostNames, read, type HostComponents } from 'livrea/react';
import { distanceTo, nearestGap, type Box, type Gap } from './drop-target.js';
import { getBlockAtPath, isWithin, localize, pathsEqual, type BlockPath } from './tree-ops.js';
import type { BlockNode } from 'livrea';

/** A block or a slot, across a theme's `field.blocks()` settings. */
export interface BlockAddress {
  readonly setting: string;
  readonly path: BlockPath;
}

const ATTR_BLOCK = 'data-livrea-block';
const ATTR_SLOT = 'data-livrea-slot';
const ATTR_EMPTY = 'data-livrea-empty';
const DRAG_THRESHOLD = 5;
/** Close to a nested block's edge, a drop means beside it rather than inside it. */
const OUTER_EDGE = 10;
const SCROLL_EDGE = 40;
/** A line is thin to aim at: this close, a drag takes it. */
const LINE_REACH = 16;
const SCROLL_SPEED = 14;

const encode = (address: BlockAddress) => JSON.stringify([address.setting, address.path]);

function decode(value: string | null): BlockAddress | null {
  if (!value) return null;
  const [setting, path] = JSON.parse(value) as [string, BlockPath];
  return { setting, path };
}

const readPath = (value: unknown): BlockPath =>
  Array.isArray(value) ? value.filter((part): part is string | number => typeof part === 'string' || typeof part === 'number') : [];

/**
 * The markers the engine puts around blocks and slots while editing (`editing` in `createRuntime`). `display: contents`:
 * they give the preview no boxes of its own, so its layout is the theme's. An empty slot keeps room for a block: a box,
 * or just a line beside filled slots, so a filled block looks like itself. It stays the same whether it's hovered or
 * not, so nothing jumps under the pointer.
 */
export const EDITOR_COMPONENTS: HostComponents = {
  [EDIT_BLOCK_HOST]: ({ setting, path, children }) => (
    <div {...{ [ATTR_BLOCK]: encode({ setting: read.text(setting), path: readPath(path) }) }} style={{ display: 'contents' }}>
      {children as ReactNode}
    </div>
  ),
  [EDIT_SLOT_HOST]: ({ setting, path, count, siblings, children }) => (
    <div {...{ [ATTR_SLOT]: encode({ setting: read.text(setting), path: readPath(path) }) }} style={{ display: 'contents' }}>
      {children as ReactNode}
      {read.number(count) === 0 ? (
        <div {...{ [ATTR_EMPTY]: read.number(siblings) > 0 ? 'line' : 'box' }} className="livrea-ui-slot-room" />
      ) : null}
    </div>
  )
};

/** For the preview's `policy.hosts`, beside the app's own components. */
export const EDITOR_HOST_NAMES: ReadonlySet<string> = hostNames(EDITOR_COMPONENTS);

export interface VisualEditorProps {
  /** Reads a setting's block tree. */
  readonly treeOf: (setting: string) => readonly BlockNode[];
  /** Which blocks may sit at the root of a setting; any when omitted. */
  readonly allowedOf: (setting: string) => readonly string[] | undefined;
  readonly blocks: Readonly<Record<string, BlockSchema>>;
  readonly selected: BlockAddress | null;
  readonly onSelect: (address: BlockAddress | null) => void;
  readonly onMove: (from: BlockAddress, to: BlockAddress, gap: number) => void;
  readonly onRemove: (address: BlockAddress) => void;
  readonly onInsert: (slot: BlockAddress, blockId: string, index?: number) => void;
  readonly locale?: string;
}

interface Drag {
  readonly from: BlockAddress;
  readonly fromElement: Element;
  readonly label: string;
}

interface Drop {
  readonly slot: BlockAddress;
  readonly gap: number;
  readonly line: Box | null;
  readonly room: Box | null;
}

/** The elements of an address's kind under the theme. */
function find(theme: Element | null, attribute: string, address: BlockAddress | null): Element | null {
  if (!theme || !address) return null;
  const wanted = encode(address);
  for (const element of Array.from(theme.querySelectorAll(`[${attribute}]`))) {
    if (element.getAttribute(attribute) === wanted) return element;
  }
  return null;
}

const parentBlockOf = (slot: Element) => slot.parentElement?.closest(`[${ATTR_BLOCK}]`) ?? null;
const parentSlotOf = (block: Element) => block.parentElement?.closest(`[${ATTR_SLOT}]`) ?? null;

/**
 * Visual editing over the preview, in a layer of its own: nothing here is in the theme's DOM but the markers. A click
 * selects the innermost block under the pointer; dragging moves it, within its slot or into another; empty slots show
 * where blocks can go when their block is hovered or selected, or during a drag. Selecting drives the same Inspector
 * and outline as the panels, which stay an alternative way to do all of it.
 */
export function VisualEditor({
  themeRef,
  treeOf,
  allowedOf,
  blocks,
  selected,
  onSelect,
  onMove,
  onRemove,
  onInsert,
  locale = 'en'
}: VisualEditorProps & { readonly themeRef: RefObject<HTMLElement | null> }) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const [hover, setHover] = useState<BlockAddress | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [inserting, setInserting] = useState<{ slot: BlockAddress; index?: number } | null>(null);
  const press = useRef<{ id: number; x: number; y: number; address: BlockAddress | null; canDrag: boolean; fromGrip: boolean } | null>(null);
  const last = useRef<{ x: number; y: number } | null>(null);

  // What's drawn follows the theme's boxes, whatever moved them.
  useEffect(() => {
    const theme = themeRef.current;
    if (!theme) return;
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(redraw);
    };
    // Not everywhere a builder may be mounted (jsdom, in an app's tests); what's drawn then follows the mutations alone.
    const resizes = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    resizes?.observe(theme);
    const mutations = new MutationObserver(schedule);
    mutations.observe(theme, { childList: true, subtree: true, attributes: true, characterData: true });
    theme.addEventListener('load', schedule, true);
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      resizes?.disconnect();
      mutations.disconnect();
      theme.removeEventListener('load', schedule, true);
      window.removeEventListener('resize', schedule);
    };
  }, [themeRef]);

  /** A marker's box in this layer: the union of what it holds, since a marker has none of its own. */
  const boxOf = useCallback((element: Element | null): Box | null => {
    const root = rootRef.current;
    if (!element || !root) return null;
    const range = document.createRange();
    range.selectNodeContents(element);
    // Without layout (jsdom) there's nothing to measure, and nothing to draw.
    // An empty element, such as a slot's room, has nothing inside to measure: its own box, then.
    const rect = element.childNodes.length ? range.getBoundingClientRect?.() : element.getBoundingClientRect();
    if (!rect) return null;
    if (rect.width === 0 && rect.height === 0) return null;
    const origin = root.getBoundingClientRect();
    return { left: rect.left - origin.left, top: rect.top - origin.top, right: rect.right - origin.left, bottom: rect.bottom - origin.top };
  }, []);

  const elementAt = useCallback(
    (x: number, y: number): Element | null => {
      const theme = themeRef.current;
      if (!theme) return null;
      return document.elementsFromPoint(x, y).find((element) => theme.contains(element) && element !== theme) ?? null;
    },
    [themeRef]
  );

  const blockAt = useCallback(
    (x: number, y: number): BlockAddress | null => decode(elementAt(x, y)?.closest(`[${ATTR_BLOCK}]`)?.getAttribute(ATTR_BLOCK) ?? null),
    [elementAt]
  );

  const mayHold = useCallback(
    (slot: BlockAddress, blockId: string): boolean => {
      if (slot.path.length) return true;
      const allowed = allowedOf(slot.setting);
      return !allowed?.length || allowed.includes(blockId);
    },
    [allowedOf]
  );

  /** The slot and gap a dragged block would go to from a point: the innermost slot that may hold it, not inside itself. */
  const dropAt = useCallback(
    (x: number, y: number, dragged: Drag): Drop | null => {
      const root = rootRef.current;
      const theme = themeRef.current;
      if (!root || !theme) return null;
      // Past the frame's edge (where holding it scrolls), the point is at the edge: what's visible is what can be aimed at.
      const frame = root.closest('.livrea-ui-canvas-frame')?.getBoundingClientRect();
      const cx = frame ? Math.max(frame.left + 1, Math.min(x, frame.right - 1)) : x;
      const cy = frame ? Math.max(frame.top + 1, Math.min(y, frame.bottom - 1)) : y;
      const origin = root.getBoundingClientRect();
      const px = cx - origin.left;
      const py = cy - origin.top;
      const blockId = getBlockAtPath(treeOf(dragged.from.setting), dragged.from.path)?.block;
      if (!blockId) return null;

      // On the page around the blocks, the page's slot nearest the point: a slot has no box to aim at.
      const pageSlots = Array.from(theme.querySelectorAll(`[${ATTR_SLOT}]`)).filter((candidate) => !parentBlockOf(candidate));
      const nearestPageSlot = () =>
        pageSlots
          .map((candidate) => ({ candidate, box: boxOf(candidate) }))
          .sort((a, b) => (a.box ? distanceTo(a.box, px, py) : Infinity) - (b.box ? distanceTo(b.box, px, py) : Infinity))[0]?.candidate ?? null;
      // An empty slot's line, if the point is close enough to one this block may go to.
      const lines = Array.from(theme.querySelectorAll(`[${ATTR_EMPTY}="line"]`))
        .map((line) => ({ slot: line.closest(`[${ATTR_SLOT}]`)!, box: boxOf(line) }))
        .filter((line): line is { slot: Element; box: Box } => {
          if (!line.box || distanceTo(line.box, px, py) > LINE_REACH) return false;
          const address = decode(line.slot.getAttribute(ATTR_SLOT))!;
          return !(address.setting === dragged.from.setting && isWithin(address.path, dragged.from.path));
        })
        .sort((a, b) => distanceTo(a.box, px, py) - distanceTo(b.box, px, py));
      if (lines[0]) return { slot: decode(lines[0].slot.getAttribute(ATTR_SLOT))!, gap: 0, line: null, room: lines[0].box };

      let slot: Element | null = elementAt(cx, cy)?.closest(`[${ATTR_SLOT}]`) ?? nearestPageSlot();
      // At the edge of a block, the slot around it: otherwise nothing could go between two full containers.
      for (let block = slot && parentBlockOf(slot); slot && block; block = parentBlockOf(slot)) {
        const box = boxOf(block);
        const nearEdge = box && (py - box.top < OUTER_EDGE || box.bottom - py < OUTER_EDGE || px - box.left < OUTER_EDGE || box.right - px < OUTER_EDGE);
        if (!nearEdge) break;
        const outer = parentSlotOf(block);
        if (!outer) break;
        slot = outer;
      }
      for (; slot; slot = parentBlockOf(slot) && parentSlotOf(parentBlockOf(slot)!)) {
        const address = decode(slot.getAttribute(ATTR_SLOT))!;
        const inside = address.setting === dragged.from.setting && isWithin(address.path, dragged.from.path);
        if (inside || !mayHold(address, blockId)) continue;
        const children = Array.from(slot.children).filter((child) => child.hasAttribute(ATTR_BLOCK));
        if (!children.length) {
          return { slot: address, gap: 0, line: null, room: boxOf(slot) };
        }
        // Blocks that show nothing can't be aimed at: their positions still count.
        const boxes = children.map((child, index) => ({ box: boxOf(child), index })).filter((entry): entry is { box: Box; index: number } => entry.box !== null);
        const gap: Gap | null = nearestGap(boxes.map((entry) => entry.box), px, py);
        if (!gap) return { slot: address, gap: children.length, line: null, room: null };
        const realIndex = gap.index < boxes.length ? boxes[gap.index]!.index : boxes.at(-1)!.index + 1;
        return { slot: address, gap: realIndex, line: gap.line, room: null };
      }
      return null;
    },
    [boxOf, elementAt, mayHold, themeRef, treeOf]
  );

  // During a drag, a pointer held near the frame's edge scrolls it, and the gap follows.
  useEffect(() => {
    if (!drag) return;
    const scroller = rootRef.current?.closest('.livrea-ui-canvas-frame');
    let frame = requestAnimationFrame(function step() {
      const at = last.current;
      if (scroller && at) {
        const rect = scroller.getBoundingClientRect();
        const delta = at.y < rect.top + SCROLL_EDGE ? -SCROLL_SPEED : at.y > rect.bottom - SCROLL_EDGE ? SCROLL_SPEED : 0;
        if (delta) {
          scroller.scrollBy(0, delta);
          setDrop(dropAt(at.x, at.y, drag));
        }
      }
      frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [drag, dropAt]);

  const labelOf = useCallback(
    (address: BlockAddress): string => {
      const id = getBlockAtPath(treeOf(address.setting), address.path)?.block ?? '';
      return localize(blocks[id]?.label, locale, id);
    },
    [blocks, locale, treeOf]
  );

  const endDrag = useCallback(() => {
    press.current = null;
    setDrag(null);
    setDrop(null);
    setPointer(null);
  }, []);

  const isControl = (target: EventTarget) => target instanceof Element && target.closest('[data-livrea-control]') !== null;

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || isControl(event.target)) return;
    rootRef.current?.focus({ preventScroll: true });
    press.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      address: blockAt(event.clientX, event.clientY),
      // A finger on the page scrolls it: on touch, dragging starts from the grip.
      canDrag: event.pointerType === 'mouse' || event.pointerType === 'pen',
      fromGrip: false
    };
  };

  const startFromGrip = (event: ReactPointerEvent, address: BlockAddress) => {
    event.stopPropagation();
    if (event.button !== 0) return;
    rootRef.current?.focus({ preventScroll: true });
    press.current = { id: event.pointerId, x: event.clientX, y: event.clientY, address, canDrag: true, fromGrip: true };
    rootRef.current?.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    last.current = { x: event.clientX, y: event.clientY };
    const pressed = press.current;
    if (pressed && pressed.id === event.pointerId && !drag && pressed.canDrag && pressed.address) {
      if (Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) >= DRAG_THRESHOLD) {
        const fromElement = find(themeRef.current, ATTR_BLOCK, pressed.address);
        if (fromElement) {
          rootRef.current?.setPointerCapture(event.pointerId);
          setDrag({ from: pressed.address, fromElement, label: labelOf(pressed.address) });
        }
      }
    }
    if (drag) {
      const origin = rootRef.current!.getBoundingClientRect();
      setPointer({ x: event.clientX - origin.left, y: event.clientY - origin.top });
      setDrop(dropAt(event.clientX, event.clientY, drag));
      return;
    }
    // On the editor's own controls, what's under them stays hovered: a + at a block's edge mustn't go as it's reached.
    if (isControl(event.target)) return;
    const next = blockAt(event.clientX, event.clientY);
    setHover((current) => (current?.setting === next?.setting && pathsEqual(current?.path, next?.path) && (current === null) === (next === null) ? current : next));
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pressed = press.current;
    if (!pressed || pressed.id !== event.pointerId) return;
    if (drag) {
      const target = drop ?? dropAt(event.clientX, event.clientY, drag);
      if (target) onMove(drag.from, target.slot, target.gap);
    } else if (!pressed.fromGrip) {
      onSelect(blockAt(event.clientX, event.clientY));
    }
    endDrag();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.target !== rootRef.current) return;
    if (event.key === 'Escape') {
      if (drag) endDrag();
      else onSelect(null);
    } else if (selected && (event.key === 'Delete' || event.key === 'Backspace')) {
      event.preventDefault();
      onRemove(selected);
    } else if (selected && event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      const index = selected.path.at(-1) as number;
      const slot = { setting: selected.setting, path: selected.path.slice(0, -1) };
      onMove(selected, slot, event.key === 'ArrowUp' ? index - 1 : index + 2);
    }
  };

  const theme = themeRef.current;
  const hoverBlock = find(theme, ATTR_BLOCK, hover);
  const selectedBlock = find(theme, ATTR_BLOCK, selected);
  const hoverBox = !drag && hover && !(selected && hover.setting === selected.setting && pathsEqual(hover.path, selected.path)) ? boxOf(hoverBlock) : null;
  const selectedBox = boxOf(selectedBlock);
  const draggedBox = drag ? boxOf(find(theme, ATTR_BLOCK, drag.from)) : null;
  const parentOfSelected = selected && selected.path.length > 2 ? { setting: selected.setting, path: selected.path.slice(0, -2) } : null;

  // Empty slots show where blocks can go: of the block under the pointer or selected, at the top level always, and all of them during a drag.
  const rooms = theme
    ? Array.from(theme.querySelectorAll(`[${ATTR_EMPTY}]`)).flatMap((room) => {
        const slot = room.closest(`[${ATTR_SLOT}]`)!;
        const owner = parentBlockOf(slot);
        const shown = drag || !owner || owner === hoverBlock || owner === selectedBlock || (hoverBlock?.contains(owner) ?? false) || (selectedBlock?.contains(owner) ?? false);
        const box = shown ? boxOf(room) ?? boxOf(slot) : null;
        return box ? [{ address: decode(slot.getAttribute(ATTR_SLOT))!, box, isLine: room.getAttribute(ATTR_EMPTY) === 'line' }] : [];
      })
    : [];

  // A filled slot's end, only for the slot being worked in: the one the block under the pointer or selected sits in.
  const appends = drag
    ? []
    : Array.from(new Set([hoverBlock, selectedBlock].map((block) => block && parentSlotOf(block)))).flatMap((slot) => {
        if (!slot) return [];
        const boxes = Array.from(slot.children)
          .filter((child) => child.hasAttribute(ATTR_BLOCK))
          .map((child) => boxOf(child))
          .filter((box): box is Box => box !== null);
        const end = boxes.at(-1);
        const gap = end ? nearestGap(boxes, end.right, end.bottom) : null;
        return gap ? [{ address: decode(slot.getAttribute(ATTR_SLOT))!, line: gap.line }] : [];
      });

  const items = useMemo(() => {
    if (!inserting) return [];
    const allowed = allowedOf(inserting.slot.setting);
    const ids = inserting.slot.path.length || !allowed?.length ? Object.keys(blocks) : allowed.filter((id) => Object.hasOwn(blocks, id));
    return ids.map((id) => ({ id, label: localize(blocks[id]?.label, locale, id) }));
  }, [allowedOf, blocks, inserting, locale]);
  const searchSource = useMemo(() => createStaticSource(items), [items]);

  // A selection the tree no longer has (another page's, a removed block's) draws nothing, and is dropped.
  useLayoutEffect(() => {
    if (selected && !getBlockAtPath(treeOf(selected.setting), selected.path)) onSelect(null);
  }, [onSelect, selected, treeOf]);

  const place = (box: Box): React.CSSProperties => ({ left: box.left, top: box.top, width: box.right - box.left, height: box.bottom - box.top });

  return (
    <div
      ref={rootRef}
      className="livrea-ui-editor"
      data-dragging={drag ? '' : undefined}
      tabIndex={0}
      role="group"
      aria-label="Visual editor"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={endDrag}
      onPointerLeave={() => {
        if (!drag) setHover(null);
      }}
      onKeyDown={onKeyDown}
    >
      {rooms.map(({ address, box, isLine }) => {
        const isTarget = drop?.room && drop.slot.setting === address.setting && pathsEqual(drop.slot.path, address.path);
        const slotName = String(address.path.at(-1) ?? 'page');
        if (isLine) {
          return (
            <div key={encode(address)} className="livrea-ui-editor-room-line" data-target={isTarget ? '' : undefined} style={place(box)}>
              {drag ? null : (
                <button
                  type="button"
                  data-livrea-control=""
                  aria-label={`Add a block to ${slotName}`}
                  title={`Add a block to ${slotName}`}
                  onClick={() => setInserting({ slot: address })}
                >
                  +
                </button>
              )}
            </div>
          );
        }
        return drag ? (
          <div key={encode(address)} className="livrea-ui-editor-room" data-target={isTarget ? '' : undefined} style={place(box)} />
        ) : (
          <button
            key={encode(address)}
            type="button"
            data-livrea-control=""
            className="livrea-ui-editor-room"
            style={place(box)}
            onClick={() => setInserting({ slot: address })}
          >
            + Add block
          </button>
        );
      })}

      {appends.map(({ address, line }) => {
        const slotName = String(address.path.at(-1) ?? 'page');
        return (
          <div
            key={encode(address)}
            className="livrea-ui-editor-room-line"
            data-append=""
            data-vertical={line.left === line.right ? '' : undefined}
            style={place(line)}
          >
            <button
              type="button"
              data-livrea-control=""
              aria-label={`Add a block at the end of ${slotName}`}
              title={`Add a block at the end of ${slotName}`}
              onClick={() => setInserting({ slot: address })}
            >
              +
            </button>
          </div>
        );
      })}

      {hoverBox ? (
        <div className="livrea-ui-editor-outline" data-kind="hover" style={place(hoverBox)}>
          <span className="livrea-ui-editor-tag">{hover ? labelOf(hover) : ''}</span>
        </div>
      ) : null}

      {draggedBox ? <div className="livrea-ui-editor-outline" data-kind="dragged" style={place(draggedBox)} /> : null}

      {drop?.line ? <div className="livrea-ui-editor-line" style={place(drop.line)} /> : null}

      {drag && pointer ? (
        <div className="livrea-ui-editor-ghost" style={{ left: pointer.x + 12, top: pointer.y + 12 }}>
          {drag.label}
        </div>
      ) : null}

      {selected && selectedBox && !drag ? (
        <div className="livrea-ui-editor-outline" data-kind="selected" style={place(selectedBox)}>
          <div className="livrea-ui-editor-toolbar" data-livrea-control="" data-inside={selectedBox.top < 34 ? '' : undefined}>
            <button
              type="button"
              className="livrea-ui-editor-grip"
              aria-label={`Drag ${labelOf(selected)}`}
              title="Drag to move"
              onPointerDown={(event) => startFromGrip(event, selected)}
            >
              ⋮⋮
            </button>
            <span className="livrea-ui-editor-name">{labelOf(selected)}</span>
            {parentOfSelected ? (
              <button type="button" aria-label="Select parent block" title="Select parent block" onClick={() => onSelect(parentOfSelected)}>
                ↑
              </button>
            ) : null}
            <button
              type="button"
              aria-label={`Add a block after ${labelOf(selected)}`}
              title="Add a block after this one"
              onClick={() =>
                setInserting({ slot: { setting: selected.setting, path: selected.path.slice(0, -1) }, index: (selected.path.at(-1) as number) + 1 })
              }
            >
              +
            </button>
            <button type="button" aria-label={`Remove ${labelOf(selected)}`} title="Remove" data-danger="" onClick={() => onRemove(selected)}>
              ✕
            </button>
          </div>
        </div>
      ) : null}

      <div data-livrea-control="">
        <CommandPalette
          isOpen={inserting !== null}
          onOpenChange={(open) => {
            if (!open) setInserting(null);
          }}
          searchSource={searchSource}
          onValueChange={(blockId) => {
            if (inserting) onInsert(inserting.slot, blockId, inserting.index);
            setInserting(null);
          }}
          label="Add Block"
        />
      </div>
    </div>
  );
}
