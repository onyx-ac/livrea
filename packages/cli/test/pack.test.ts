import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { Component } from 'livrea';
import { importTheme } from 'livrea/worker';
import { describe, expect, it } from 'vitest';
import { pack } from '../src/index.js';

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
const out = () => mkdtempSync(join(tmpdir(), 'livrea-pack-test-'));
const text = (data: Uint8Array) => new TextDecoder().decode(data);

describe('livrea pack', () => {
  it('builds a package whose manifest names every file by its hash', async () => {
    const result = await pack(fixture('sample'), { outDir: out() });
    expect(result.file).toMatch(/sample-1\.2\.0\.livrea$/);
    const files = unzipSync(readFileSync(result.file));
    expect(Object.keys(files).sort()).toEqual(
      ['build/theme.js', 'manifest.json', 'settings.json', 'source/src/index.tsx', 'source/src/settings.ts', 'source/theme.json', 'source/tsconfig.json', 'theme.json'].sort()
    );
    const manifest = JSON.parse(text(files['manifest.json']!)) as { files: Record<string, string> };
    expect(Object.keys(manifest.files).sort()).toEqual(Object.keys(files).filter((path) => path !== 'manifest.json').sort());
    for (const [path, digest] of Object.entries(manifest.files)) {
      expect(createHash('sha256').update(files[path]!).digest('hex'), path).toBe(digest);
    }
    expect(JSON.parse(text(files['theme.json']!)).id).toBe('sample');
  });

  it('writes the settings’ definitions for the admin, without running the theme', async () => {
    const files = unzipSync(readFileSync((await pack(fixture('sample'), { outDir: out() })).file));
    expect(JSON.parse(text(files['settings.json']!))).toEqual({
      format: 1,
      fields: {
        accent: { kind: 'color', label: { en: 'Accent' }, default: '#336699' },
        greeting: { kind: 'localizedText', label: { en: 'Greeting' }, default: { en: 'Hello' } }
      }
    });
  });

  it('writes what the theme reads from the store, with its samples', async () => {
    const files = unzipSync(readFileSync((await pack(fixture('with-data'), { outDir: out() })).file));
    expect(JSON.parse(text(files['settings.json']!)).data).toEqual({
      rooms: { kind: 'list', label: { en: 'Rooms' }, item: { id: 'string', beds: 'number?' }, sample: [{ id: 'r1', beds: 2 }] }
    });
  });

  it('leaves Livrea and the app’s shared modules out, for importTheme to provide', async () => {
    const files = unzipSync(readFileSync((await pack(fixture('sample'), { outDir: out() })).file));
    const module = text(files['build/theme.js']!);
    expect(module).toContain('__livreaModules__');
    // Livrea's runtime isn't in it: the theme runs on the app's.
    expect(module).not.toContain('Themes read the store');

    class HomePage extends Component {
      get title() {
        return 'Grand';
      }
    }
    const theme = await importTheme(`data:text/javascript,${encodeURIComponent(module)}`, { '@app/pages': { HomePage } });
    expect(Object.keys(theme.pages)).toEqual(['home', 'about']);
    expect(theme.pages.home!.prototype).toBeInstanceOf(HomePage);
    expect(Object.keys(theme.settings ?? {})).toEqual(['accent', 'greeting']);
  });

  it('refuses a theme with type errors', async () => {
    await expect(pack(fixture('broken'), { outDir: out() })).rejects.toThrow(/type errors[\s\S]*not assignable to type 'number'/);
  });
});
