import type { BlockNode, BlockSchema, PatternDefinition } from 'livrea';
import { cloneBlockTree, localize } from './tree-ops.js';

export interface PatternPickerProps {
  /** Patterns from `settings.json`. */
  readonly patterns: Readonly<Record<string, PatternDefinition>>;
  /** Optional slot or setting name to filter patterns by (`pattern.for` / `pattern.targetSlot`). */
  readonly targetSlot?: string;
  /** Called with a cloned `BlockNode[]` tree when the user picks a pattern. */
  readonly onPick: (tree: readonly BlockNode[], pattern: PatternDefinition) => void;
  /** Optional block schemas so unpacked blocks start with resolved default props. */
  readonly blockSchemas?: Readonly<Record<string, BlockSchema>>;
  /** UI language for pattern labels; `"en"` by default. */
  readonly locale?: string;
}

/**
 * Gallery of starter patterns from `settings.json`. Picking a pattern unpacks its
 * `BlockNode[]` tree into the target slot so every nested block can be customized.
 */
export function PatternPicker({
  patterns,
  targetSlot,
  onPick,
  blockSchemas,
  locale = 'en'
}: PatternPickerProps) {
  const entries = Object.entries(patterns).filter(([, pattern]) => {
    const target = pattern.for ?? pattern.targetSlot;
    return !target || !targetSlot || target === targetSlot;
  });

  if (!entries.length) {
    return <p className="livrea-ui-help">No patterns available for this slot.</p>;
  }

  return (
    <div className="livrea-ui-pattern-picker" role="list" aria-label="Patterns">
      {entries.map(([key, pattern]) => {
        const label = localize(pattern.label, locale, pattern.id || key);
        return (
          <div key={key} role="listitem" style={{ marginBottom: 6 }}>
            <button
              type="button"
              className="livrea-ui-button"
              style={{ width: '100%', textAlign: 'left', display: 'flex', justifyContent: 'space-between' }}
              onClick={() => onPick(cloneBlockTree(pattern.tree, blockSchemas), pattern)}
            >
              <span>{label}</span>
              <span className="livrea-ui-help">{pattern.tree.length} block(s)</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

