import { useState } from 'react';
import { Button, Selector } from '@astryxdesign/core';
import { Resizable } from 're-resizable';
import type { EventName } from 'livrea';
import type { ThemeClient } from 'livrea/host';
import { ThemeClientProvider, ThemePage, ThemeRoot, type HostComponents } from 'livrea/react';

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
  viewport: initialViewport = 'responsive'
}: ThemeCanvasProps) {
  const [internalPage, setInternalPage] = useState<string>(() => pages[0] ?? 'home');
  const [viewport, setViewport] = useState<CanvasViewport>(initialViewport);
  const currentPage = activePage ?? internalPage;

  const selectPage = (nextPage: string) => {
    setInternalPage(nextPage);
    onPageChange?.(nextPage);
  };

  const dimensions = VIEWPORT_DIMENSIONS[viewport];

  return (
    <div className="livrea-ui-canvas" role="region" aria-label="Theme Preview Canvas">
      <div className="livrea-ui-canvas-toolbar">
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {events.map((trigger) => (
            <Button
              key={trigger.name}
              label={`⚡ ${trigger.label ?? trigger.name}`}
              variant="secondary"
              size="sm"
              onClick={() => void client.emit(trigger.name as EventName, (trigger.payload ?? {}) as never)}
            />
          ))}

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
            <ThemeClientProvider client={client} components={components}>
              <ThemeRoot>
                <ThemePage page={currentPage} params={pageParams} />
              </ThemeRoot>
            </ThemeClientProvider>
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
            <ThemeClientProvider client={client} components={components}>
              <ThemeRoot>
                <ThemePage page={currentPage} params={pageParams} />
              </ThemeRoot>
            </ThemeClientProvider>
          </div>
        )}
      </div>
    </div>
  );
}

