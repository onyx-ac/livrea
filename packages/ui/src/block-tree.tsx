import { useState } from 'react';
import type { BlockNode, BlockSchema, PatternDefinition } from 'livrea';
import { PatternPicker } from './pattern-picker.js';
import {
  createBlockNode,
  insertBlocksAtSlotPath,
  localize,
  moveBlockAtPath,
  pathKey,
  pathsEqual,
  removeBlockAtPath,
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

/**
 * Gutenberg-style recursive tree editor for a `field.blocks()` slot.
 * Supports selecting blocks at any depth, reordering, deleting, and inserting blocks or patterns.
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

  const insertBlock = (slotPath: BlockPath, blockId: string) => {
    const node = createBlockNode(blockId, blocks);
    onChange(insertBlocksAtSlotPath(tree, slotPath, [node]));
  };

  const renderSlotList = (nodes: readonly BlockNode[], slotPath: BlockPath, allowedIds: readonly string[]) => {
    return (
      <div className="livrea-ui-slot-list">
        {nodes.map((node, index) => {
          const currentPath: BlockPath = [...slotPath, index];
          const schema = blocks[node.block];
          const label = localize(schema?.label, locale, node.block);
          const isSelected = pathsEqual(selectedPath, currentPath);

          return (
            <div
              key={pathKey(currentPath)}
              className={`livrea-ui-tree-node${isSelected ? ' livrea-ui-tree-node-selected' : ''}`}
              data-block-path={pathKey(currentPath)}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                <button
                  type="button"
                  className={`livrea-ui-button${isSelected ? ' livrea-ui-button-active' : ''}`}
                  style={{ flex: 1, textAlign: 'left' }}
                  onClick={() => onSelect?.(currentPath)}
                >
                  {label}
                </button>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    type="button"
                    className="livrea-ui-button"
                    aria-label={`Move ${label} up`}
                    disabled={index === 0}
                    onClick={() => onChange(moveBlockAtPath(tree, currentPath, -1))}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="livrea-ui-button"
                    aria-label={`Move ${label} down`}
                    disabled={index === nodes.length - 1}
                    onClick={() => onChange(moveBlockAtPath(tree, currentPath, 1))}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="livrea-ui-button"
                    aria-label={`Remove ${label}`}
                    onClick={() => {
                      if (isSelected) onSelect?.(null);
                      onChange(removeBlockAtPath(tree, currentPath));
                    }}
                  >
                    ×
                  </button>
                </div>
              </div>

              {schema?.slots?.length ? (
                <div className="livrea-ui-tree-slots">
                  {schema.slots.map((innerSlot) => {
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
  const [selectedBlock, setSelectedBlock] = useState<string>(() => allowedIds[0] ?? '');
  if (!allowedIds.length) return null;
  const activeId = allowedIds.includes(selectedBlock) ? selectedBlock : allowedIds[0]!;

  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
      <select
        className="livrea-ui-select"
        aria-label="Choose block to add"
        style={{ flex: 1 }}
        value={activeId}
        onChange={(event) => setSelectedBlock(event.target.value)}
      >
        {allowedIds.map((id) => (
          <option key={id} value={id}>
            {localize(blocks[id]?.label, locale, id)}
          </option>
        ))}
      </select>
      <button type="button" className="livrea-ui-button" onClick={() => onInsertBlock(activeId)}>
        + Add Block
      </button>
    </div>
  );
}

