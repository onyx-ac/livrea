import { resolveSettings, type BlockNode, type BlockSchema, type LocalizedText } from 'livrea';

/**
 * Address of a block or inner slot within a `BlockNode[]` tree:
 * - `[]` refers to the root slot list
 * - `[0]` refers to the 0th BlockNode at the root
 * - `[0, 'Right']` refers to the `Right` inner slot list of `[0]`
 * - `[0, 'Right', 1]` refers to the 1st BlockNode inside `[0]`'s `Right` slot
 */
export type BlockPath = readonly (number | string)[];

export function pathKey(path: BlockPath): string {
  return path.join('/');
}

export function pathsEqual(a: BlockPath | null | undefined, b: BlockPath | null | undefined): boolean {
  if (!a || !b || a.length !== b.length) return false;
  return a.every((part, index) => part === b[index]);
}

/** Reads a localized label in the preferred locale, falling back to `en` or the first entry. */
export function localize(text: LocalizedText | undefined, locale = 'en', fallback = ''): string {
  if (!text) return fallback;
  if (text[locale]) return text[locale]!;
  const lower = locale.toLowerCase();
  for (const [code, value] of Object.entries(text)) {
    if (code.toLowerCase() === lower && value) return value;
  }
  return text.en ?? Object.values(text)[0] ?? fallback;
}

/** Deep-clones a `BlockNode[]` tree and fills in default props and inner slots from `blockSchemas`. */
export function cloneBlockTree(
  nodes: readonly BlockNode[],
  blockSchemas?: Readonly<Record<string, BlockSchema>>
): readonly BlockNode[] {
  return nodes.map((node) => createBlockNode(node.block, blockSchemas, node.props, node.slots));
}

/** Creates a fresh `BlockNode` with default props and empty inner slots from its `BlockSchema`. */
export function createBlockNode(
  blockId: string,
  blockSchemas?: Readonly<Record<string, BlockSchema>>,
  initialProps?: Readonly<Record<string, unknown>>,
  initialSlots?: Readonly<Record<string, readonly BlockNode[]>>
): BlockNode {
  const schema = blockSchemas?.[blockId];
  const props = schema?.fields
    ? (resolveSettings(schema.fields, initialProps ?? {}) as Readonly<Record<string, unknown>>)
    : { ...(initialProps ?? {}) };
  if (!schema?.slots?.length && !initialSlots) {
    return { block: blockId, props };
  }
  const slots: Record<string, readonly BlockNode[]> = {};
  for (const slotName of schema?.slots ?? Object.keys(initialSlots ?? {})) {
    slots[slotName] = cloneBlockTree(initialSlots?.[slotName] ?? [], blockSchemas);
  }
  return { block: blockId, props, slots };
}

/** Looks up the `BlockNode` at `path`. */
export function getBlockAtPath(tree: readonly BlockNode[], path: BlockPath): BlockNode | undefined {
  if (!path.length) return undefined;
  const [head, ...rest] = path;
  if (typeof head !== 'number') return undefined;
  const node = tree[head];
  if (!node) return undefined;
  if (!rest.length) return node;
  const [slotName, ...tail] = rest;
  if (typeof slotName !== 'string' || !tail.length) return undefined;
  return getBlockAtPath(node.slots?.[slotName] ?? [], tail);
}

/** Immutably updates the `BlockNode` at `path`. */
export function updateBlockAtPath(
  tree: readonly BlockNode[],
  path: BlockPath,
  updater: (node: BlockNode) => BlockNode
): readonly BlockNode[] {
  if (!path.length) return tree;
  const [head, ...rest] = path;
  if (typeof head !== 'number' || head < 0 || head >= tree.length) return tree;
  const current = tree[head]!;
  if (!rest.length) {
    const next = [...tree];
    next[head] = updater(current);
    return next;
  }
  const [slotName, ...tail] = rest;
  if (typeof slotName !== 'string' || !tail.length) return tree;
  const nextChildren = updateBlockAtPath(current.slots?.[slotName] ?? [], tail, updater);
  const next = [...tree];
  next[head] = {
    ...current,
    slots: { ...(current.slots ?? {}), [slotName]: nextChildren }
  };
  return next;
}

/** Immutably removes the `BlockNode` at `path`. */
export function removeBlockAtPath(tree: readonly BlockNode[], path: BlockPath): readonly BlockNode[] {
  if (!path.length) return tree;
  const [head, ...rest] = path;
  if (typeof head !== 'number' || head < 0 || head >= tree.length) return tree;
  if (!rest.length) {
    return tree.filter((_, index) => index !== head);
  }
  const [slotName, ...tail] = rest;
  if (typeof slotName !== 'string' || !tail.length) return tree;
  const current = tree[head]!;
  const next = [...tree];
  next[head] = {
    ...current,
    slots: { ...(current.slots ?? {}), [slotName]: removeBlockAtPath(current.slots?.[slotName] ?? [], tail) }
  };
  return next;
}

/** Immutably reorders the `BlockNode` at `path` by `delta` (`-1` up, `1` down). */
export function moveBlockAtPath(tree: readonly BlockNode[], path: BlockPath, delta: -1 | 1): readonly BlockNode[] {
  if (!path.length) return tree;
  const [head, ...rest] = path;
  if (typeof head !== 'number' || head < 0 || head >= tree.length) return tree;
  if (!rest.length) {
    const target = head + delta;
    if (target < 0 || target >= tree.length) return tree;
    const next = [...tree];
    const [moved] = next.splice(head, 1);
    next.splice(target, 0, moved!);
    return next;
  }
  const [slotName, ...tail] = rest;
  if (typeof slotName !== 'string' || !tail.length) return tree;
  const current = tree[head]!;
  const next = [...tree];
  next[head] = {
    ...current,
    slots: { ...(current.slots ?? {}), [slotName]: moveBlockAtPath(current.slots?.[slotName] ?? [], tail, delta) }
  };
  return next;
}

/** Immutably moves the block at `fromIndex` to `toIndex` inside the slot at `slotPath`. */
export function reorderBlockInSlot(
  tree: readonly BlockNode[],
  slotPath: BlockPath,
  fromIndex: number,
  toIndex: number
): readonly BlockNode[] {
  if (fromIndex === toIndex) return tree;
  if (!slotPath.length) {
    if (fromIndex < 0 || fromIndex >= tree.length || toIndex < 0 || toIndex >= tree.length) return tree;
    const next = [...tree];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved!);
    return next;
  }
  const [head, slotName, ...tail] = slotPath;
  if (typeof head !== 'number' || typeof slotName !== 'string' || head < 0 || head >= tree.length) return tree;
  const current = tree[head]!;
  const existing = current.slots?.[slotName] ?? [];
  const nextChildren = reorderBlockInSlot(existing, tail, fromIndex, toIndex);
  const next = [...tree];
  next[head] = {
    ...current,
    slots: { ...(current.slots ?? {}), [slotName]: nextChildren }
  };
  return next;
}

/** Appends `nodesToInsert` into the slot at `slotPath` (`[]` for root, or `[index, slotName, ...]`). */
export function insertBlocksAtSlotPath(
  tree: readonly BlockNode[],
  slotPath: BlockPath,
  nodesToInsert: readonly BlockNode[]
): readonly BlockNode[] {
  if (!slotPath.length) {
    return [...tree, ...nodesToInsert];
  }
  const [head, slotName, ...tail] = slotPath;
  if (typeof head !== 'number' || typeof slotName !== 'string' || head < 0 || head >= tree.length) return tree;
  const current = tree[head]!;
  const existing = current.slots?.[slotName] ?? [];
  const nextChildren = tail.length ? insertBlocksAtSlotPath(existing, tail, nodesToInsert) : [...existing, ...nodesToInsert];
  const next = [...tree];
  next[head] = {
    ...current,
    slots: { ...(current.slots ?? {}), [slotName]: nextChildren }
  };
  return next;
}

