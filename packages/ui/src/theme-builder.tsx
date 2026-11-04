import { useState } from 'react';
import type { BlockNode, BlocksField, SettingsJson } from 'livrea';
import type { ThemeClient } from 'livrea/host';
import type { HostComponents } from 'livrea/react';
import { BlockTree } from './block-tree.js';
import { SettingsForm, type SettingsFormProps } from './settings-form.js';
import { BUILDER_STYLES } from './styles.js';
import { ThemeCanvas, type ThemeCanvasEventTrigger } from './theme-canvas.js';
import { getBlockAtPath, localize, updateBlockAtPath, type BlockPath } from './tree-ops.js';

export interface ThemeBuilderProps {
  /** The `settings.json` schema from the `.livrea` package. */
  readonly schema: SettingsJson;
  /** Current `store.settings` values. */
  readonly values: Readonly<Record<string, unknown>>;
  /** Called whenever scalar settings or slot block trees change. */
  readonly onChange: (nextValues: Record<string, unknown>) => void;
  /** Optional live `ThemeClient` to render the interactive center canvas. */
  readonly client?: ThemeClient;
  /** Host components (`hostComponent()`) for the live preview. */
  readonly components?: HostComponents;
  /** Page names available in the preview canvas. */
  readonly pages?: readonly string[];
  /** Optional catalog event triggers for the preview toolbar. */
  readonly events?: readonly ThemeCanvasEventTrigger[];
  /** UI language for labels and help text; `"en"` by default. */
  readonly locale?: string;
  /** Language codes for `localizedText` inputs. */
  readonly languages?: readonly string[];
  /** Optional media library hook for `image` fields. */
  readonly onPickImage?: SettingsFormProps['onPickImage'];
}

/**
 * Full 3-pane visual studio:
 * - Left pane: Slot selector, `<BlockTree />` outline, and `<PatternPicker />`
 * - Center pane: Live `<ThemeCanvas />`
 * - Right pane: `<SettingsForm />` Inspector for theme settings and the selected Block's `props`
 */
export function ThemeBuilder({
  schema,
  values,
  onChange,
  client,
  components,
  pages,
  events,
  locale = 'en',
  languages,
  onPickImage
}: ThemeBuilderProps) {
  const blockFields = Object.entries(schema.fields).filter(
    (entry): entry is [string, BlocksField] => entry[1].kind === 'blocks'
  );
  const [activeSlotKey, setActiveSlotKey] = useState<string>(() => blockFields[0]?.[0] ?? '');
  const [selectedPath, setSelectedPath] = useState<BlockPath | null>(null);

  const currentSlotEntry = blockFields.find(([key]) => key === activeSlotKey) ?? blockFields[0];
  const currentSlotName = currentSlotEntry?.[0];
  const currentSlotField = currentSlotEntry?.[1];
  const currentTree: readonly BlockNode[] =
    currentSlotName && Array.isArray(values[currentSlotName])
      ? (values[currentSlotName] as readonly BlockNode[])
      : (currentSlotField?.default ?? []);

  const selectedBlock = selectedPath ? getBlockAtPath(currentTree, selectedPath) : undefined;
  const selectedBlockSchema = selectedBlock ? schema.blocks?.[selectedBlock.block] : undefined;

  const updateCurrentTree = (nextTree: readonly BlockNode[]) => {
    if (!currentSlotName) return;
    onChange({ ...values, [currentSlotName]: nextTree });
  };

  return (
    <div className="livrea-ui-builder">
      <style data-livrea-ui-styles="">{BUILDER_STYLES}</style>

      {/* Left Pane: Slots, Block Tree & Pattern Picker */}
      <aside className="livrea-ui-pane livrea-ui-pane-left" aria-label="Document Outline">
        <h3 className="livrea-ui-section-title">Slots &amp; Blocks</h3>
        {blockFields.length > 1 ? (
          <div className="livrea-ui-field">
            <label className="livrea-ui-label" htmlFor="livrea-ui-slot-select">
              Slot
            </label>
            <select
              id="livrea-ui-slot-select"
              className="livrea-ui-select"
              aria-label="Active Slot"
              value={currentSlotName ?? ''}
              onChange={(event) => {
                setActiveSlotKey(event.target.value);
                setSelectedPath(null);
              }}
            >
              {blockFields.map(([key, fieldDef]) => (
                <option key={key} value={key}>
                  {localize(fieldDef.label, locale, key)}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {currentSlotField && schema.blocks ? (
          <BlockTree
            tree={currentTree}
            blocks={schema.blocks}
            allowed={currentSlotField.allowed}
            patterns={schema.patterns}
            slotName={currentSlotName}
            selectedPath={selectedPath}
            onSelect={setSelectedPath}
            onChange={updateCurrentTree}
            locale={locale}
          />
        ) : (
          <p className="livrea-ui-help">This theme has no visual block slots.</p>
        )}
      </aside>

      {/* Center Pane: Live Preview Canvas */}
      <main className="livrea-ui-canvas">
        {client ? (
          <ThemeCanvas client={client} components={components} pages={pages} events={events} />
        ) : (
          <div className="livrea-ui-canvas-stage">
            <p className="livrea-ui-help">Connect a ThemeClient to preview the theme live.</p>
          </div>
        )}
      </main>

      {/* Right Pane: Inspector (Selected Block Props + Theme Settings) */}
      <aside className="livrea-ui-pane livrea-ui-pane-right" aria-label="Inspector">
        {selectedBlock && selectedBlockSchema && selectedPath ? (
          <section aria-label="Block Inspector">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h3 className="livrea-ui-section-title" style={{ margin: 0 }}>
                Block: {localize(selectedBlockSchema.label, locale, selectedBlock.block)}
              </h3>
              <button type="button" className="livrea-ui-button" onClick={() => setSelectedPath(null)}>
                Done
              </button>
            </div>
            <SettingsForm
              fields={selectedBlockSchema.fields ?? {}}
              values={selectedBlock.props ?? {}}
              locale={locale}
              languages={languages}
              onPickImage={onPickImage}
              onChange={(nextProps) => {
                updateCurrentTree(
                  updateBlockAtPath(currentTree, selectedPath, (node) => ({
                    ...node,
                    props: nextProps
                  }))
                );
              }}
            />
          </section>
        ) : null}

        <section aria-label="Theme Settings">
          <h3 className="livrea-ui-section-title">Theme Settings</h3>
          <SettingsForm
            fields={schema.fields}
            values={values}
            onChange={onChange}
            locale={locale}
            languages={languages}
            onPickImage={onPickImage}
          />
        </section>
      </aside>
    </div>
  );
}

