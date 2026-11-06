// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { strFromU8, strToU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { DemoApp } from '../src/app.js';
import { buildThemeZipBytes } from '../src/download.js';
import { checkThemeData, withSampleData, type SettingsJson } from 'livrea';
import { DEMO_DATA, DEMO_SETTINGS_JSON } from '../src/theme.js';
import { parseUploadedTheme } from '../src/upload.js';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

if (typeof globalThis.CSS === 'undefined') {
  (globalThis as Record<string, unknown>).CSS = {
    escape: (s: string) => s
  };
} else if (!globalThis.CSS.escape) {
  globalThis.CSS.escape = (s: string) => s;
}

if (typeof HTMLDialogElement !== 'undefined') {
  HTMLDialogElement.prototype.showModal = HTMLDialogElement.prototype.showModal || function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = HTMLDialogElement.prototype.close || function (this: HTMLDialogElement) { this.removeAttribute('open'); };
}

describe('@livrea/playground', () => {
  it('renders the website theme with articles list processing, featured services, and theme upload/download controls', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(<DemoApp />));

    expect(container.textContent).toContain('Livrea Playground');
    expect(container.textContent).toContain('Meridian Studio v1.0.0');
    expect(container.textContent).not.toContain('Starting Theme:');
    expect(container.textContent).not.toContain('Action log:');
    expect(container.textContent).not.toContain('Articles · Services · Contact Form (@livrea/ui)');
    expect(container.textContent).toContain('Engineering journal, product studio & modular web systems.');
    // Featured services and articles list processing
    expect(container.textContent).toContain('Design System & Block Library Engineering');
    expect(container.textContent).toContain('Why Sandboxed Class Inheritance Beats Static Templates');
    expect(container.textContent).toContain('Upload theme');
    expect(container.textContent).toContain('Download theme');
    // The preview is edited in place: its blocks carry their addresses, under the editor's layer.
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(container.querySelector('.livrea-ui-editor')).not.toBeNull();
    expect(container.querySelector('[data-livrea-block]')?.getAttribute('data-livrea-block')).toBe(JSON.stringify(['homeStage', [0]]));

    // Clicking "Articles" in the rendered theme header navigates to the Articles page and syncs the Page command palette selector.
    const navButtons = Array.from(container.querySelectorAll('.meridian-nav button'));
    const articlesNavBtn = navButtons.find((b) => b.textContent?.includes('Articles')) as HTMLButtonElement | undefined;
    expect(articlesNavBtn).toBeDefined();
    await act(async () => {
      articlesNavBtn!.click();
    });
    expect(container.textContent).toContain('Articles & Research');
    const pageSelectBtn = container.querySelector<HTMLButtonElement>('button[aria-label="Select Page"]');
    expect(pageSelectBtn?.textContent).toContain('Articles');

    // Clicking "Contact" in the rendered theme header navigates to the Contact page.
    const contactNavBtn = Array.from(container.querySelectorAll('.meridian-nav button')).find((b) =>
      b.textContent?.includes('Contact')
    ) as HTMLButtonElement | undefined;
    await act(async () => {
      contactNavBtn!.click();
    });
    expect(container.textContent).toContain('Work With Us');

    act(() => root.unmount());
    container.remove();
  });

  it('exports a ready-to-pack .zip archive and supports uploading it back as a starting theme', async () => {
    const zipBytes = buildThemeZipBytes(
      {
        accent: '#10b981',
        siteName: 'Apex Engineering',
        homeStage: [{ block: 'article-feed', props: { category: 'engineering', featuredOnly: true, limit: 2, showReadingTime: true } }]
      },
      DEMO_SETTINGS_JSON,
      { id: 'apex-web', name: 'Apex Engineering', version: '2.1.0' }
    );

    const files = unzipSync(zipBytes);
    expect(Object.keys(files).sort()).toEqual([
      'README.md',
      'package.json',
      'preset-settings.json',
      'settings.json',
      'src/index.tsx',
      'src/settings.ts',
      'theme.json',
      'tsconfig.json'
    ]);

    // What the theme reads from the store travels with it.
    expect((JSON.parse(strFromU8(files['settings.json']!)) as SettingsJson).data?.articles?.kind).toBe('list');
    expect(strFromU8(files['src/settings.ts']!)).toContain('export const data = defineData(');

    const preset = JSON.parse(strFromU8(files['preset-settings.json']!)) as Record<string, unknown>;
    expect(preset.accent).toBe('#10b981');
    expect(preset.siteName).toBe('Apex Engineering');

    // Re-uploading the exported .zip restores its starting theme metadata, schema, and values.
    const uploaded = await parseUploadedTheme('apex-web-2.1.0.zip', zipBytes, DEMO_SETTINGS_JSON);
    expect(uploaded.id).toBe('apex-web');
    expect(uploaded.name).toBe('Apex Engineering');
    expect(uploaded.version).toBe('2.1.0');
    expect(uploaded.values.accent).toBe('#10b981');
    expect(uploaded.schema.fields.accent?.default).toBe('#10b981');
  });

  it('declares the data it shows, and keeps it when only the settings are replaced', async () => {
    expect(checkThemeData(DEMO_DATA, {}).every((check) => check.status === 'missing')).toBe(true);
    expect(checkThemeData(DEMO_DATA, withSampleData(DEMO_DATA, {})).every((check) => check.status === 'provided')).toBe(true);
    const parsed = await parseUploadedTheme('s.json', strToU8(JSON.stringify({ format: 1, fields: {} })), DEMO_SETTINGS_JSON);
    expect(parsed.schema.data).toBe(DEMO_DATA);
  });

  it('allows uploading a standalone settings.json schema to redefine customizability', async () => {
    const customSchema = {
      format: 1,
      fields: {
        brandColor: {
          kind: 'color',
          label: { en: 'Brand Color' },
          default: '#6366f1'
        }
      },
      blocks: {},
      patterns: {}
    };

    const uploaded = await parseUploadedTheme(
      'custom-theme.json',
      strToU8(JSON.stringify(customSchema)),
      DEMO_SETTINGS_JSON
    );
    expect(Object.keys(uploaded.schema.fields)).toEqual(['brandColor']);
    expect(uploaded.values).toEqual({ brandColor: '#6366f1' });
  });
});
