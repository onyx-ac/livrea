import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, CommandPalette, createStaticSource, IconButton, Kbd } from '@astryxdesign/core';
import { Resizable } from 're-resizable';
import type { BlockNode, BlocksField, DataSchema, SettingsJson } from 'livrea';
import type { ThemeClient } from 'livrea/host';
import type { HostComponents } from 'livrea/react';
import { BlockTree } from './block-tree.js';
import { DataSection } from './data-section.js';
import { SettingsForm, type SettingsFormProps } from './settings-form.js';
import { BUILDER_STYLES } from './styles.js';
import { ThemeCanvas, type ThemeCanvasEventTrigger } from './theme-canvas.js';
import { createBlockNode, getBlockAtPath, insertBlocksAtSlotPath, localize, moveBlock, pathAfterRemoval, removeBlockAtPath, updateBlockAtPath, type BlockPath } from './tree-ops.js';
import type { BlockAddress, VisualEditorProps } from './visual-editor.js';

export interface ThemeBuilderProps {
  /** The `settings.json` schema from the `.livrea` package. */
  readonly schema: SettingsJson;
  /** Current `store.settings` values. */
  readonly values: Readonly<Record<string, unknown>>;
  /** The data the app really provides, as in its store: what the Data section reports the theme's declarations against. */
  readonly data?: Readonly<Record<string, unknown>>;
  /** Called when samples are edited in the Data section, with the theme's data as it now is; without it, they can't be. */
  readonly onDataChange?: (nextData: DataSchema) => void;
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

/** A moment to go back to: the values, and what was on screen, so undoing shows what it changed. */
interface HistoryEntry {
  readonly values: Readonly<Record<string, unknown>>;
  readonly data: DataSchema | undefined;
  readonly slotKey: string;
  readonly path: BlockPath | null;
  readonly page: string;
}

const HISTORY_LIMIT = 100;
/** Changes to the same field this close together are one step: typing a word, dragging a slider. */
const SAME_STEP_MS = 800;

/**
 * Full 3-pane visual studio:
 * - Left pane: Slot selector, `<BlockTree />` outline, and `<PatternPicker />`
 * - Center pane: Live `<ThemeCanvas />`
 * - Right pane: `<SettingsForm />` Inspector for theme settings and the selected Block's `props`
 */
export function ThemeBuilder({
  schema,
  values,
  data,
  onDataChange,
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
  const rootRef = useRef<HTMLDivElement | null>(null);
  const past = useRef<HistoryEntry[]>([]);
  const future = useRef<HistoryEntry[]>([]);
  const lastStep = useRef<{ key: string; at: number } | null>(null);
  // The values this builder last gave the app. Any others are the app's own (a new theme, a reset): the history isn't about them.
  const emitted = useRef(values);
  const [, setHistorySize] = useState(0);
  const historyChanged = () => setHistorySize((n) => n + 1);

  // Likewise the samples this builder last gave the app. Any others are a new theme's: Reset goes back to those.
  const emittedData = useRef(schema.data);
  const originalData = useRef(schema.data);

  if (emitted.current !== values || emittedData.current !== schema.data) {
    if (emittedData.current !== schema.data) originalData.current = schema.data;
    emitted.current = values;
    emittedData.current = schema.data;
    past.current = [];
    future.current = [];
    lastStep.current = null;
  }

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

  const here = (): HistoryEntry => ({ values, data: schema.data, slotKey: activeSlotKey, path: selectedPath, page: activePageId });

  /** Every change goes through here. `stepKey` names a field whose quick changes count as one step. */
  const commit = (next: Record<string, unknown>, stepKey?: string) => {
    const now = Date.now();
    const sameStep = stepKey !== undefined && lastStep.current?.key === stepKey && now - lastStep.current.at < SAME_STEP_MS;
    if (!sameStep) past.current = [...past.current, here()].slice(-HISTORY_LIMIT);
    future.current = [];
    lastStep.current = stepKey === undefined ? null : { key: stepKey, at: now };
    emitted.current = next;
    onChange(next);
    historyChanged();
  };

  const commitData = (next: DataSchema) => {
    past.current = [...past.current, here()].slice(-HISTORY_LIMIT);
    future.current = [];
    lastStep.current = null;
    emittedData.current = next;
    onDataChange?.(next);
    historyChanged();
  };

  const restore = (entry: HistoryEntry) => {
    lastStep.current = null;
    emitted.current = entry.values as Record<string, unknown>;
    if (entry.data !== schema.data && entry.data) {
      emittedData.current = entry.data;
      onDataChange?.(entry.data);
    }
    setActiveSlotKey(entry.slotKey);
    setSelectedPath(entry.path);
    onChange(entry.values as Record<string, unknown>);
    if (entry.page !== activePageId) {
      lastActivePageRef.current = entry.page;
      onPageChange?.(entry.page);
    }
    historyChanged();
  };

  const undo = () => {
    const entry = past.current.at(-1);
    if (!entry) return;
    past.current = past.current.slice(0, -1);
    future.current = [...future.current, here()];
    restore(entry);
  };

  const redo = () => {
    const entry = future.current.at(-1);
    if (!entry) return;
    future.current = future.current.slice(0, -1);
    past.current = [...past.current, here()];
    restore(entry);
  };

  // The latest of each, for the one listener below.
  const historyKeys = useRef({ undo, redo });
  historyKeys.current = { undo, redo };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      const isUndo = key === 'z' && !event.shiftKey;
      const isRedo = (key === 'z' && event.shiftKey) || (key === 'y' && !event.shiftKey);
      if (!isUndo && !isRedo) return;
      // A field undoes its own typing; a block being dragged can't have the tree change under it.
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (rootRef.current?.querySelector('.livrea-ui-editor[data-dragging]')) return;
      event.preventDefault();
      if (isUndo) historyKeys.current.undo();
      else historyKeys.current.redo();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const updateCurrentTree = (nextTree: readonly BlockNode[], stepKey?: string) => {
    if (!currentSlotName) return;
    commit({ ...values, [currentSlotName]: nextTree }, stepKey);
  };

  const treeOf = (setting: string): readonly BlockNode[] => {
    const field = blockFields.find(([key]) => key === setting)?.[1];
    return Array.isArray(values[setting]) ? (values[setting] as readonly BlockNode[]) : (field?.default ?? []);
  };

  /** A selection on the preview is the same selection as in the outline, whichever setting it's in. */
  const select = (address: BlockAddress | null) => {
    if (address && address.setting !== currentSlotName) setActiveSlotKey(address.setting);
    setSelectedPath(address?.path ?? null);
  };

  const editor: VisualEditorProps | undefined = schema.blocks
    ? {
        treeOf,
        allowedOf: (setting) => blockFields.find(([key]) => key === setting)?.[1].allowed,
        blocks: schema.blocks,
        selected: selectedPath && currentSlotName ? { setting: currentSlotName, path: selectedPath } : null,
        onSelect: select,
        locale,
        onMove(from, to, gap) {
          if (from.setting === to.setting) {
            const moved = moveBlock(treeOf(from.setting), from.path, to.path, gap);
            if (!moved) return;
            commit({ ...values, [from.setting]: moved.tree });
            select({ setting: from.setting, path: moved.path });
            return;
          }
          const node = getBlockAtPath(treeOf(from.setting), from.path);
          if (!node) return;
          commit({
            ...values,
            [from.setting]: removeBlockAtPath(treeOf(from.setting), from.path),
            [to.setting]: insertBlocksAtSlotPath(treeOf(to.setting), to.path, [node], gap)
          });
          select({ setting: to.setting, path: [...to.path, gap] });
        },
        onRemove(address) {
          commit({ ...values, [address.setting]: removeBlockAtPath(treeOf(address.setting), address.path) });
          if (address.setting === currentSlotName && selectedPath) setSelectedPath(pathAfterRemoval(selectedPath, address.path));
        },
        onInsert(slot, blockId, index) {
          const tree = treeOf(slot.setting);
          const siblings = slot.path.length ? (getBlockAtPath(tree, slot.path.slice(0, -1))?.slots?.[slot.path.at(-1) as string] ?? []) : tree;
          commit({ ...values, [slot.setting]: insertBlocksAtSlotPath(tree, slot.path, [createBlockNode(blockId, schema.blocks)], index) });
          select({ setting: slot.setting, path: [...slot.path, index ?? siblings.length] });
        }
      }
    : undefined;

  return (
    <div ref={rootRef} className="livrea-ui-builder">
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
              onChange={(nextTree) => updateCurrentTree(nextTree)}
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
            editor={editor}
            toolbar={
              <>
                <IconButton
                  label="Undo"
                  tooltip="Undo (Ctrl+Z)"
                  icon={<span aria-hidden="true">↶</span>}
                  variant="secondary"
                  size="sm"
                  isDisabled={past.current.length === 0}
                  onClick={undo}
                />
                <IconButton
                  label="Redo"
                  tooltip="Redo (Ctrl+Shift+Z)"
                  icon={<span aria-hidden="true">↷</span>}
                  variant="secondary"
                  size="sm"
                  isDisabled={future.current.length === 0}
                  onClick={redo}
                />
              </>
            }
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
                    })),
                    `block:${currentSlotName}:${selectedPath.join('/')}`
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
                onChange={(next) => commit(next, 'theme-settings')}
                locale={locale}
                languages={languages}
                onPickImage={onPickImage}
              />
              <DataSection
                schema={schema.data}
                original={originalData.current}
                provided={data ?? {}}
                locale={locale}
                onChange={onDataChange ? commitData : undefined}
              />
            </section>
          )}
        </div>
      </Resizable>
    </div>
  );
}
