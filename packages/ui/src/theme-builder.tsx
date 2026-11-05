import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, CommandPalette, createStaticSource, Kbd } from '@astryxdesign/core';
import { Resizable } from 're-resizable';
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
  /** Controlled active page name in the preview canvas. */
  readonly activePage?: string;
  /** Called when the user switches the previewed page. */
  readonly onPageChange?: (page: string) => void;
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
  activePage,
  onPageChange,
  events,
  locale = 'en',
  languages,
  onPickImage
}: ThemeBuilderProps) {
  const blockFields = useMemo(
    () =>
      Object.entries(schema.fields).filter(
        (entry): entry is [string, BlocksField] => entry[1].kind === 'blocks'
      ),
    [schema.fields]
  );
  const [activeSlotKey, setActiveSlotKey] = useState<string>(() => blockFields[0]?.[0] ?? '');
  const [selectedPath, setSelectedPath] = useState<BlockPath | null>(null);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const lastActivePageRef = useRef(activePage);

  const pageItems = useMemo(() => {
    if (pages && pages.length > 0) {
      return pages.map((pageName) => {
        const matchingSlot = blockFields.find(
          ([key]) =>
            key === `${pageName}Stage` ||
            key === pageName ||
            key.toLowerCase().includes(pageName.toLowerCase())
        );
        const label = matchingSlot
          ? localize(matchingSlot[1].label, locale, pageName)
          : pageName.charAt(0).toUpperCase() + pageName.slice(1);
        return {
          id: pageName,
          label,
          auxiliaryData: {
            slotKey: matchingSlot?.[0] ?? pageName,
            pageName
          }
        };
      });
    }
    return blockFields.map(([key, fieldDef]) => {
      const pageName = key.replace(/Stage$/, '');
      return {
        id: pageName,
        label: localize(fieldDef.label, locale, key),
        auxiliaryData: {
          slotKey: key,
          pageName
        }
      };
    });
  }, [pages, blockFields, locale]);

  const searchSource = useMemo(() => createStaticSource(pageItems), [pageItems]);

  const activePageId =
    activePage ??
    pageItems.find((p) => p.auxiliaryData.slotKey === activeSlotKey)?.id ??
    pageItems[0]?.id ??
    '';

  const currentPageLabel =
    pageItems.find((p) => p.id === activePageId)?.label ??
    (activePageId ? activePageId.charAt(0).toUpperCase() + activePageId.slice(1) : 'Page');

  const handleSelectPage = (selectedPageId: string) => {
    const item = pageItems.find((p) => p.id === selectedPageId);
    if (!item) return;
    setActiveSlotKey(item.auxiliaryData.slotKey);
    setSelectedPath(null);
    lastActivePageRef.current = item.auxiliaryData.pageName;
    onPageChange?.(item.auxiliaryData.pageName);
    setIsPaletteOpen(false);
  };

  useEffect(() => {
    if (!activePage) return;
    if (lastActivePageRef.current === activePage) return;
    lastActivePageRef.current = activePage;

    const item = pageItems.find((p) => p.id === activePage);
    if (item) {
      setActiveSlotKey(item.auxiliaryData.slotKey);
      setSelectedPath(null);
      return;
    }
    const matchingSlot = blockFields.find(
      ([key]) => key === `${activePage}Stage` || key === activePage || key.toLowerCase().includes(activePage.toLowerCase())
    );
    if (matchingSlot) {
      setActiveSlotKey(matchingSlot[0]);
      setSelectedPath(null);
    }
  }, [activePage, blockFields, pageItems]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsPaletteOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

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

      {/* Left Pane: Slots, Block Tree & Pattern Picker (Resizable only on the right) */}
      <Resizable
        as="aside"
        className="livrea-ui-pane-resizable livrea-ui-pane-left-resizable"
        aria-label="Document Outline"
        defaultSize={{ width: 300, height: '100%' }}
        minWidth={220}
        maxWidth={600}
        enable={{
          top: false,
          right: true,
          bottom: false,
          left: false,
          topRight: false,
          bottomRight: false,
          bottomLeft: false,
          topLeft: false
        }}
        handleClasses={{ right: 'livrea-ui-resize-handle' }}
      >
        <div className="livrea-ui-pane livrea-ui-pane-left">
          <h3 className="livrea-ui-section-title">Slots &amp; Blocks</h3>
          {pageItems.length > 1 ? (
            <div className="livrea-ui-field" style={{ marginBottom: 10 }}>
              <span
                className="livrea-ui-label"
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'var(--livrea-ui-muted)'
                }}
              >
                Page
              </span>
              <Button
                label={currentPageLabel}
                variant="secondary"
                size="sm"
                width="100%"
                endContent={<Kbd keys="mod+k" />}
                onClick={() => setIsPaletteOpen(true)}
                aria-label="Select Page"
              />
              <CommandPalette
                isOpen={isPaletteOpen}
                onOpenChange={setIsPaletteOpen}
                searchSource={searchSource}
                value={activePageId}
                onValueChange={handleSelectPage}
                label="Select Page"
              />
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
        </div>
      </Resizable>

      {/* Center Pane: Live Preview Canvas */}
      <main className="livrea-ui-canvas">
        {client ? (
          <ThemeCanvas
            client={client}
            components={components}
            pages={pages}
            activePage={activePage}
            onPageChange={onPageChange}
            events={events}
          />
        ) : (
          <div className="livrea-ui-canvas-stage">
            <p className="livrea-ui-help">Connect a ThemeClient to preview the theme live.</p>
          </div>
        )}
      </main>

      {/* Right Pane: Inspector (Resizable only on the left; Block Settings when selected, otherwise Theme Settings) */}
      <Resizable
        as="aside"
        className="livrea-ui-pane-resizable livrea-ui-pane-right-resizable"
        aria-label="Inspector"
        defaultSize={{ width: 320, height: '100%' }}
        minWidth={240}
        maxWidth={700}
        boundsByDirection
        enable={{
          top: false,
          right: false,
          bottom: false,
          left: true,
          topRight: false,
          bottomRight: false,
          bottomLeft: false,
          topLeft: false
        }}
        handleClasses={{ left: 'livrea-ui-resize-handle' }}
      >
        <div className="livrea-ui-pane livrea-ui-pane-right">
          {selectedBlock && selectedBlockSchema && selectedPath ? (
            <section aria-label="Block Inspector">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <h3 className="livrea-ui-section-title" style={{ margin: 0 }}>
                  Block: {localize(selectedBlockSchema.label, locale, selectedBlock.block)}
                </h3>
                <Button
                  label="← Theme Settings"
                  variant="secondary"
                  size="sm"
                  onClick={() => setSelectedPath(null)}
                />
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
          ) : (
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
          )}
        </div>
      </Resizable>
    </div>
  );
}

