import { useState } from 'react';
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
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }} role="tablist" aria-label="Preview Pages">
          {pages.map((pageName) => (
            <button
              key={pageName}
              type="button"
              role="tab"
              aria-selected={currentPage === pageName}
              className={`livrea-ui-button${currentPage === pageName ? ' livrea-ui-button-active' : ''}`}
              onClick={() => selectPage(pageName)}
            >
              {pageName}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {events.map((trigger) => (
            <button
              key={trigger.name}
              type="button"
              className="livrea-ui-button"
              onClick={() => void client.emit(trigger.name as EventName, (trigger.payload ?? {}) as never)}
            >
              ⚡ {trigger.label ?? trigger.name}
            </button>
          ))}

          <select
            className="livrea-ui-select"
            aria-label="Viewport size"
            value={viewport}
            onChange={(event) => setViewport(event.target.value as CanvasViewport)}
          >
            <option value="responsive">Responsive</option>
            <option value="kiosk-landscape">Kiosk Landscape</option>
            <option value="kiosk-portrait">Kiosk Portrait</option>
            <option value="mobile">Mobile</option>
          </select>
        </div>
      </div>

      <div className="livrea-ui-canvas-stage">
        <div
          className="livrea-ui-canvas-frame"
          data-viewport={viewport}
          style={{
            width: dimensions.width,
            minHeight: dimensions.minHeight,
            border: '1px solid var(--livrea-ui-border)',
            borderRadius: 'var(--livrea-ui-radius)',
            overflow: 'hidden'
          }}
        >
          <ThemeClientProvider client={client} components={components}>
            <ThemeRoot>
              <ThemePage page={currentPage} params={pageParams} />
            </ThemeRoot>
          </ThemeClientProvider>
        </div>
      </div>
    </div>
  );
}

