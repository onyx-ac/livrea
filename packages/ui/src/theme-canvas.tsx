import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, Selector } from '@astryxdesign/core';
import { Resizable } from 're-resizable';
import type { EventName } from 'livrea';
import type { ThemeClient } from 'livrea/host';
import { ThemeClientProvider, ThemePage, ThemeRoot, type HostComponents } from 'livrea/react';
import { EDITOR_COMPONENTS, VisualEditor, type VisualEditorProps } from './visual-editor.js';

export interface ThemeCanvasEventTrigger {
  readonly name: string;
  readonly label?: string;
  readonly payload?: unknown;
}

export type CanvasViewport = 'responsive' | 'kiosk-landscape' | 'kiosk-portrait' | 'mobile';

const VIEWPORT_DIMENSIONS: Readonly<Record<CanvasViewport, { width: string; minHeight: string }>> = {
  responsive: { width: '100%', minHeight: '480px' },
  'kiosk-landscape': { width: '1024px', minHeight: '640px' },
  'kiosk-portrait': { width: '540px', minHeight: '960px' },
  mobile: { width: '375px', minHeight: '667px' }
};

const MODE_OPTIONS = [
  { value: 'edit', label: 'Edit' },
  { value: 'preview', label: 'Preview' }
];

const VIEWPORT_OPTIONS = [
  { value: 'responsive', label: 'Responsive' },
  { value: 'kiosk-landscape', label: 'Kiosk Landscape' },
  { value: 'kiosk-portrait', label: 'Kiosk Portrait' },
  { value: 'mobile', label: 'Mobile' }
];

export interface ThemeCanvasProps {
  /** Live `ThemeClient` running the theme preview. */
  readonly client: ThemeClient;
  /** Host components (`hostComponent()`) or preview stand-ins. */
  readonly components?: HostComponents;
  /** Page names available to preview (`['home', 'guide', ...]`). */
  readonly pages?: readonly string[];
  /** Controlled active page name. */
  readonly activePage?: string;
  /** Called when the user switches the previewed page. */
  readonly onPageChange?: (page: string) => void;
  /** Optional parameters passed to `<ThemePage />`. */
  readonly pageParams?: Readonly<Record<string, unknown>>;
  /** Sample catalog events to trigger from the simulator toolbar. */
  readonly events?: readonly ThemeCanvasEventTrigger[];
  /** Initial viewport preset; `'responsive'` by default. */
  readonly viewport?: CanvasViewport;
  /** Controls of the app's beside the canvas's own, at the start of its toolbar. */
  readonly toolbar?: ReactNode;
  /** Selecting, moving and removing blocks on the preview itself; it needs a runtime started with `editing`. */
  readonly editor?: VisualEditorProps;
}

/**
 * Live theme preview canvas with a page switcher, viewport size presets,
 * and catalog event simulator bar.
 */
export function ThemeCanvas({
  client,
  components = {},
  pages = ['home'],
  activePage,
  onPageChange,
  pageParams,
  events = [],
  viewport: initialViewport = 'responsive',
  toolbar,
  editor
}: ThemeCanvasProps) {
  const [internalPage, setInternalPage] = useState<string>(() => pages[0] ?? 'home');
  const [viewport, setViewport] = useState<CanvasViewport>(initialViewport);
  const currentPage = activePage ?? internalPage;

  const selectPage = (nextPage: string) => {
    setInternalPage(nextPage);
    onPageChange?.(nextPage);
  };

  const dimensions = VIEWPORT_DIMENSIONS[viewport];

  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [hasMarkers, setHasMarkers] = useState(false);
  const themeRef = useRef<HTMLDivElement | null>(null);

  // A runtime that isn't `editing` has nothing to edit: the preview stays a plain, interactive one.
  useEffect(() => {
    const theme = themeRef.current;
    if (!theme || !editor) return;
    const check = () => setHasMarkers(theme.querySelector('[data-livrea-slot]') !== null);
    check();
    const observer = new MutationObserver(check);
    observer.observe(theme, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [editor !== undefined, viewport === 'responsive']);

  const isEditing = editor !== undefined && hasMarkers && mode === 'edit';
  const allComponents = editor ? { ...components, ...EDITOR_COMPONENTS } : components;
  const preview = (
    <div className="livrea-ui-canvas-content" data-mode={isEditing ? 'edit' : 'preview'}>
      <div ref={themeRef}>
        <ThemeClientProvider client={client} components={allComponents}>
          <ThemeRoot>
            <ThemePage page={currentPage} params={pageParams} />
          </ThemeRoot>
        </ThemeClientProvider>
      </div>
      {isEditing ? <VisualEditor {...editor} themeRef={themeRef} /> : null}
    </div>
  );

  return (
    <div className="livrea-ui-canvas" role="region" aria-label="Theme Preview Canvas">
      <div className="livrea-ui-canvas-toolbar">
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {toolbar}
          {events.map((trigger) => (
            <Button
              key={trigger.name}
              label={trigger.label ?? trigger.name}
              variant="secondary"
              size="sm"
              onClick={() => void client.emit(trigger.name as EventName, (trigger.payload ?? {}) as never)}
            />
          ))}

          {editor && hasMarkers ? (
            <Selector
              label="Canvas mode"
              isLabelHidden
              options={MODE_OPTIONS}
              value={mode}
              onChange={(val) => setMode(val as 'edit' | 'preview')}
              size="sm"
              width={110}
            />
          ) : null}

          <Selector
            label="Viewport size"
            isLabelHidden
            options={VIEWPORT_OPTIONS}
            value={viewport}
            onChange={(val) => setViewport(val as CanvasViewport)}
            size="sm"
            width={140}
          />
        </div>
      </div>

      <div className="livrea-ui-canvas-stage">
        {viewport === 'responsive' ? (
          <Resizable
            defaultSize={{ width: '100%', height: '100%' }}
            minWidth={320}
            minHeight={300}
            enable={{
              top: true,
              right: true,
              bottom: true,
              left: true,
              topRight: true,
              bottomRight: true,
              bottomLeft: true,
              topLeft: true
            }}
            className="livrea-ui-canvas-frame livrea-ui-canvas-frame-resizable"
            data-viewport={viewport}
            style={{
              border: '1px solid var(--livrea-ui-border)',
              borderRadius: 'var(--livrea-ui-radius)',
              position: 'relative'
            }}
          >
            {preview}
          </Resizable>
        ) : (
          <div
            className="livrea-ui-canvas-frame"
            data-viewport={viewport}
            style={{
              width: dimensions.width,
              minHeight: dimensions.minHeight,
              border: '1px solid var(--livrea-ui-border)',
              borderRadius: 'var(--livrea-ui-radius)'
            }}
          >
            {preview}
          </div>
        )}
      </div>
    </div>
  );
}

