import { useMemo, useState } from 'react';
import { Button, CommandPalette, createStaticSource, Icon, IconButton } from '@astryxdesign/core';
import type { BlockNode, BlockSchema, PatternDefinition } from 'livrea';
import { PatternPicker } from './pattern-picker.js';
import {
  createBlockNode,
  insertBlocksAtSlotPath,
  localize,
  moveBlockAtPath,
  pathAfterMove,
  pathAfterRemoval,
  pathKey,
  pathsEqual,
  removeBlockAtPath,
  reorderBlockInSlot,
  type BlockPath
} from './tree-ops.js';

export interface BlockTreeProps {
  /** Current `BlockNode[]` tree for the slot. */
  readonly tree: readonly BlockNode[];
  /** Available block schemas from `settings.json`. */
  readonly blocks: Readonly<Record<string, BlockSchema>>;
  /** Allowed block ids at the root of this slot; any known block if omitted. */
  readonly allowed?: readonly string[];
  /** Starter patterns from `settings.json`. */
  readonly patterns?: Readonly<Record<string, PatternDefinition>>;
  /** Name of the root slot or setting being edited. */
  readonly slotName?: string;
  /** Currently selected block path in the Inspector. */
  readonly selectedPath?: BlockPath | null;
  /** Called when the user selects a block in the outline. */
  readonly onSelect?: (path: BlockPath | null) => void;
  /** Called whenever blocks are added, reordered, or removed. */
  readonly onChange: (nextTree: readonly BlockNode[]) => void;
  /** UI language for block labels; `"en"` by default. */
  readonly locale?: string;
}

function isDescendant(parent: BlockPath, child: BlockPath | null | undefined): boolean {
  if (!child || child.length <= parent.length) return false;
  return parent.every((seg, i) => seg === child[i]);
}

/**
 * Gutenberg-style recursive tree editor for a `field.blocks()` slot.
 * Supports selecting blocks at any depth, reordering, deleting, and inserting blocks or patterns.
 * Sections with nested content are collapsible and default to collapsed when added.
 */
export function BlockTree({
  tree,
  blocks,
  allowed,
  patterns,
  slotName,
  selectedPath = null,
  onSelect,
  onChange,
  locale = 'en'
}: BlockTreeProps) {
  const allBlockIds = Object.keys(blocks);
  const rootAllowedIds = allowed?.length ? allowed.filter((id) => Object.hasOwn(blocks, id)) : allBlockIds;
  const [dragging, setDragging] = useState<{ readonly slotKey: string; readonly index: number } | null>(null);
  const [dragOver, setDragOver] = useState<{ readonly slotKey: string; readonly index: number } | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<ReadonlySet<string>>(() => new Set());

  const toggleExpanded = (path: BlockPath) => {
    const key = pathKey(path);
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const insertBlock = (slotPath: BlockPath, blockId: string) => {
    const node = createBlockNode(blockId, blocks);
    onChange(insertBlocksAtSlotPath(tree, slotPath, [node]));
  };

  /** A selection stays on its block when blocks move around it. */
  const followMove = (from: BlockPath, toSlot: BlockPath, gap: number) => {
    if (selectedPath) onSelect?.(pathAfterMove(selectedPath, from, toSlot, gap));
  };

  const renderSlotList = (nodes: readonly BlockNode[], slotPath: BlockPath, allowedIds: readonly string[]) => {
    const currentSlotKey = pathKey(slotPath);
    return (
      <div className="livrea-ui-slot-list">
        {nodes.map((node, index) => {
          const currentPath: BlockPath = [...slotPath, index];
          const schema = blocks[node.block];
          const label = localize(schema?.label, locale, node.block);
          const isSelected = pathsEqual(selectedPath, currentPath);
          const isDropTarget = dragOver?.slotKey === currentSlotKey && dragOver.index === index;
          const hasNestedContent = Boolean(schema?.slots && schema.slots.length > 0);
          const isExpanded = expandedPaths.has(pathKey(currentPath)) || isDescendant(currentPath, selectedPath);
          const canReorder = nodes.length > 1;

          return (
            <div
              key={pathKey(currentPath)}
              className={`livrea-ui-tree-node${isSelected ? ' livrea-ui-tree-node-selected' : ''}`}
              data-block-path={pathKey(currentPath)}
              draggable={canReorder}
              onDragStart={(event) => {
                if (!canReorder) return;
                event.stopPropagation();
                setDragging({ slotKey: currentSlotKey, index });
                event.dataTransfer?.setData('text/plain', pathKey(currentPath));
              }}
              onDragOver={(event) => {
                if (!canReorder || !dragging || dragging.slotKey !== currentSlotKey) return;
                event.preventDefault();
                event.stopPropagation();
                setDragOver({ slotKey: currentSlotKey, index });
              }}
              onDrop={(event) => {
                if (!canReorder || !dragging || dragging.slotKey !== currentSlotKey) return;
                event.preventDefault();
                event.stopPropagation();
                if (dragging.index !== index) {
                  onChange(reorderBlockInSlot(tree, slotPath, dragging.index, index));
                  followMove([...slotPath, dragging.index], slotPath, index > dragging.index ? index + 1 : index);
                }
                setDragging(null);
                setDragOver(null);
              }}
              onDragEnd={() => {
                setDragging(null);
                setDragOver(null);
              }}
              style={isDropTarget ? { outline: '2px dashed var(--livrea-ui-accent)' } : undefined}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                <span
                  aria-hidden="true"
                  title={canReorder ? 'Drag to reorder' : 'Only one item'}
                  style={{
                    cursor: canReorder ? 'grab' : 'default',
                    color: canReorder ? 'var(--livrea-ui-muted)' : 'var(--livrea-ui-border)',
                    opacity: canReorder ? 1 : 0.35,
                    userSelect: 'none',
                    padding: '0 2px'
                  }}
                >
                  ⋮⋮
                </span>

                {hasNestedContent ? (
                  <IconButton
                    label={isExpanded ? `Collapse ${label}` : `Expand ${label}`}
                    icon={<Icon icon={isExpanded ? 'chevronLeft' : 'chevronRight'}/>}
                    variant="ghost"
                    size="sm"
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleExpanded(currentPath);
                    }}
                    type='button'
                  />
                ) : null}

                <Button
                  label={label}
                  variant={isSelected ? 'primary' : 'ghost'}
                  size="sm"
                  width="100%"
                  onClick={() => onSelect?.(currentPath)}
                />

                <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                  <IconButton
                    label={`Move ${label} up`}
                    icon={<Icon icon="arrowUp"/>}
                    variant="ghost"
                    size="sm"
                    isDisabled={index === 0}
                    onClick={() => {
                      if (index > 0) {
                        onChange(moveBlockAtPath(tree, currentPath, -1));
                        followMove(currentPath, slotPath, index - 1);
                      }
                    }}
                  />
                  <IconButton
                    label={`Move ${label} down`}
                    icon={<Icon icon="chevronDown"/>}
                    variant="ghost"
                    size="sm"
                    isDisabled={index === nodes.length - 1}
                    onClick={() => {
                      if (index < nodes.length - 1) {
                        onChange(moveBlockAtPath(tree, currentPath, 1));
                        followMove(currentPath, slotPath, index + 2);
                      }
                    }}
                  />
                  <IconButton
                    label={`Remove ${label}`}
                    icon={<Icon icon="close"/>}
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (selectedPath) onSelect?.(pathAfterRemoval(selectedPath, currentPath));
                      onChange(removeBlockAtPath(tree, currentPath));
                    }}
                  />
                </div>
              </div>

              {hasNestedContent && isExpanded ? (
                <div className="livrea-ui-tree-slots">
                  {schema!.slots!.map((innerSlot) => {
                    const innerSlotPath: BlockPath = [...currentPath, innerSlot];
                    const children = node.slots?.[innerSlot] ?? [];
                    return (
                      <div key={innerSlot} className="livrea-ui-tree-slot">
                        <div className="livrea-ui-help" style={{ marginBottom: 4 }}>
                          Slot: <strong>{innerSlot}</strong>
                        </div>
                        {renderSlotList(children, innerSlotPath, allBlockIds)}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}

        <SlotInserter
          allowedIds={allowedIds}
          blocks={blocks}
          locale={locale}
          onInsertBlock={(blockId) => insertBlock(slotPath, blockId)}
        />
      </div>
    );
  };

  return (
    <div className="livrea-ui-block-tree" role="region" aria-label={slotName ? `Blocks in ${slotName}` : 'Block Tree'}>
      {renderSlotList(tree, [], rootAllowedIds)}
      {patterns && Object.keys(patterns).length ? (
        <div style={{ marginTop: 12 }}>
          <h4 className="livrea-ui-section-title">Insert Pattern</h4>
          <PatternPicker
            patterns={patterns}
            targetSlot={slotName}
            blockSchemas={blocks}
            locale={locale}
            onPick={(unpacked) => onChange(insertBlocksAtSlotPath(tree, [], unpacked))}
          />
        </div>
      ) : null}
    </div>
  );
}

function SlotInserter({
  allowedIds,
  blocks,
  locale,
  onInsertBlock
}: {
  readonly allowedIds: readonly string[];
  readonly blocks: Readonly<Record<string, BlockSchema>>;
  readonly locale: string;
  readonly onInsertBlock: (blockId: string) => void;
}) {
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);

  const items = useMemo(
    () =>
      allowedIds.map((id) => ({
        id,
        label: localize(blocks[id]?.label, locale, id)
      })),
    [allowedIds, blocks, locale]
  );
  const searchSource = useMemo(() => createStaticSource(items), [items]);
  if (!allowedIds.length) return null;

  return (
    <div style={{ marginTop: 6 }}>
      <Button
        label="+ Add Block…"
        variant="secondary"
        size="sm"
        width="100%"
        onClick={() => setIsPaletteOpen(true)}
      />
      <CommandPalette
        isOpen={isPaletteOpen}
        onOpenChange={setIsPaletteOpen}
        searchSource={searchSource}
        onValueChange={(blockId) => {
          onInsertBlock(blockId);
          setIsPaletteOpen(false);
        }}
        label="Add Block"
      />
    </div>
  );
}

