/**
 * `livrea pack`: a theme's folder into one package, `<id>-<version>.livrea`,
 * that an app's admin installs. The package:
 *
 *   theme.json      the theme's own, as written
 *   build/theme.js  the theme as one ES module; Livrea and the app's shared
 *                   modules are looked up when it loads (importTheme in livrea/worker)
 *   settings.json   its settings' definitions, for the admin's form (if it has settings)
 *   source/...      the folder it was built from
 *   manifest.json   every other file's SHA-256
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build, type Plugin } from 'esbuild';
import { zipSync } from 'fflate';
import ts from 'typescript';

/** theme.json: what the theme is, and how to build it. */
export interface ThemeJson {
  id: string;
  name: string;
  /** x.y.z; a package's version never changes once installed. */
  version: string;
  /** The app API it's written for, e.g. "hotel-kiosk@1": the app decides which it runs. */
  engine: string;
  /** The theme it extends, for the admin to show; the code says what it extends. */
  parent?: string;
  /**
   * What it looks like, for the app's admin: one text, or one per language
   * ({ "EN": "…", "IT": "…" }), with the language codes the app uses.
   */
  description?: string | Record<string, string>;
  /** The module whose default export is the theme ({ pages, layout, settings }); src/index.ts(x) by default. */
  entry?: string;
  /** The module that exports its settings (defineSettings) as `settings`; src/settings.ts if there is one. */
  settings?: string;
  /** Modules the app provides at runtime, such as its base pages: imported, never bundled. */
  shared?: string[];
}

export interface PackOptions {
  /** Where to write the package; the theme's folder by default. */
  outDir?: string;
  /** Type-check with the theme's tsconfig.json first; on by default. */
  check?: boolean;
}

export interface PackResult {
  file: string;
  theme: ThemeJson;
  bytes: number;
  /** The files in the package, by path. */
  files: string[];
}

/** Livrea's own modules: always the runtime's, so the theme's classes share its reactive core. */
const LIVREA_MODULES = ['livrea', 'livrea/jsx-runtime', 'livrea/jsx-dev-runtime'];
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VERSION = /^\d+\.\d+\.\d+$/;
const SKIPPED = new Set(['node_modules', 'dist', '.git']);

export class PackError extends Error {}

export async function pack(folder: string, options: PackOptions = {}): Promise<PackResult> {
  const dir = resolve(folder);
  const theme = readThemeJson(dir);
  const entry = theme.entry ?? ['src/index.ts', 'src/index.tsx'].find((file) => existsSync(join(dir, file)));
  if (!entry || !existsSync(join(dir, entry))) throw new PackError(`No entry module: add src/index.ts, or name one as "entry" in theme.json.`);
  const settingsFile = theme.settings ?? ['src/settings.ts', 'src/settings.tsx'].find((file) => existsSync(join(dir, file)));
  const tsconfig = existsSync(join(dir, 'tsconfig.json')) ? join(dir, 'tsconfig.json') : undefined;

  if (options.check !== false && tsconfig) typeCheck(tsconfig);

  const module = await bundle(dir, entry, tsconfig, [...LIVREA_MODULES, ...(theme.shared ?? [])]);
  const files: Record<string, Uint8Array> = {
    'theme.json': readFileSync(join(dir, 'theme.json')),
    'build/theme.js': module
  };
  if (settingsFile) files['settings.json'] = Buffer.from(JSON.stringify(await readSettings(dir, settingsFile, tsconfig), null, 2) + '\n');
  for (const path of sourceFiles(dir)) files[`source/${path}`] = readFileSync(join(dir, path));

  const manifest = { files: Object.fromEntries(Object.entries(files).map(([path, data]) => [path, sha256(data)])) };
  files['manifest.json'] = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
  const zip = zipSync(files, { level: 9, mtime: new Date('2000-01-01T00:00:00Z') });
  const file = join(resolve(options.outDir ?? dir), `${theme.id}-${theme.version}.livrea`);
  writeFileSync(file, zip);
  return { file, theme, bytes: zip.length, files: Object.keys(files) };
}

function readThemeJson(dir: string): ThemeJson {
  let theme: Partial<ThemeJson>;
  try {
    theme = JSON.parse(readFileSync(join(dir, 'theme.json'), 'utf8')) as Partial<ThemeJson>;
  } catch {
    throw new PackError(`No readable theme.json in ${dir}.`);
  }
  if (typeof theme.id !== 'string' || !ID.test(theme.id)) throw new PackError('theme.json needs an id of lowercase letters, digits and dashes, e.g. "linen".');
  if (typeof theme.name !== 'string' || !theme.name.trim()) throw new PackError('theme.json needs a name.');
  if (typeof theme.version !== 'string' || !VERSION.test(theme.version)) throw new PackError('theme.json needs a version like 1.0.0.');
  if (typeof theme.engine !== 'string' || !theme.engine) throw new PackError('theme.json needs the engine it is written for, e.g. "hotel-kiosk@1".');
  if (theme.shared !== undefined && (!Array.isArray(theme.shared) || !theme.shared.every((name) => typeof name === 'string'))) {
    throw new PackError('theme.json\'s "shared" lists module names.');
  }
  return theme as ThemeJson;
}

/** Type errors stop the build, as they would in the admin's editor. */
function typeCheck(tsconfig: string): void {
  const config = ts.getParsedCommandLineOfConfigFile(tsconfig, { noEmit: true }, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} });
  if (!config) throw new PackError(`${tsconfig} can't be read.`);
  const program = ts.createProgram(config.fileNames, { ...config.options, noEmit: true });
  const problems = ts.getPreEmitDiagnostics(program);
  if (!problems.length) return;
  const host = { getCanonicalFileName: (name: string) => name, getCurrentDirectory: () => process.cwd(), getNewLine: () => '\n' };
  throw new PackError(`The theme has type errors:\n${ts.formatDiagnostics(problems, host)}`);
}

/** Imports of these modules become lookups in what importTheme() provides. */
function sharedModules(names: readonly string[]): Plugin {
  const pattern = new RegExp(`^(${names.map((name) => name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')).join('|')})$`);
  return {
    name: 'livrea-shared',
    setup(context) {
      context.onResolve({ filter: pattern }, (args) => ({ path: args.path, namespace: 'livrea-shared' }));
      context.onLoad({ filter: /.*/, namespace: 'livrea-shared' }, (args) => ({
        contents: `const shared = globalThis.__livreaModules__ && globalThis.__livreaModules__[${JSON.stringify(args.path)}];
if (!shared) throw new Error(${JSON.stringify(`The app doesn't provide ${args.path}, which this theme needs.`)});
module.exports = shared;`,
        loader: 'js'
      }));
    }
  };
}

async function bundle(dir: string, entry: string, tsconfig: string | undefined, shared: string[]): Promise<Uint8Array> {
  const result = await build({
    absWorkingDir: dir,
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    jsx: 'automatic',
    jsxImportSource: 'livrea',
    tsconfig,
    metafile: true,
    logLevel: 'silent',
    plugins: [sharedModules(shared)]
  }).catch((error: { message: string }) => {
    throw new PackError(`The theme doesn't build: ${error.message}`);
  });
  const output = Object.values(result.metafile.outputs)[0];
  if (!output?.exports.includes('default')) throw new PackError(`${entry} needs a default export: the theme, { pages, layout, settings }.`);
  return result.outputFiles[0]!.contents;
}

/** The settings' definitions: only the settings module runs, never the theme. */
async function readSettings(dir: string, file: string, tsconfig: string | undefined): Promise<unknown> {
  const result = await build({
    absWorkingDir: dir,
    entryPoints: [file],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    jsx: 'automatic',
    jsxImportSource: 'livrea',
    tsconfig,
    logLevel: 'silent'
  }).catch((error: { message: string }) => {
    throw new PackError(`${file} doesn't build: ${error.message}`);
  });
  const temporary = mkdtempSync(join(tmpdir(), 'livrea-pack-'));
  try {
    const path = join(temporary, 'settings.mjs');
    writeFileSync(path, result.outputFiles[0]!.contents);
    const loaded = (await import(pathToFileURL(path).href)) as {
      settings?: unknown;
      blocks?: unknown;
      patterns?: unknown;
      data?: unknown;
    };
    if (!loaded.settings || typeof loaded.settings !== 'object') {
      throw new PackError(`${file} needs to export its settings: export const settings = defineSettings({ … }).`);
    }
    const blocks = extractBlocks(loaded.blocks);
    const patterns = extractPatterns(loaded.patterns);
    return JSON.parse(
      JSON.stringify({
        format: 1,
        fields: loaded.settings,
        ...(blocks ? { blocks } : {}),
        ...(patterns ? { patterns } : {}),
        ...(loaded.data && typeof loaded.data === 'object' && Object.keys(loaded.data).length ? { data: loaded.data } : {})
      })
    ) as unknown;
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

function extractBlocks(input: unknown): Record<string, unknown> | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const out: Record<string, unknown> = {};
  if (Array.isArray(input)) {
    for (const item of input) {
      if (item && (typeof item === 'object' || typeof item === 'function') && 'id' in item && 'schema' in item) {
        out[String((item as { id: string }).id)] = (item as { schema: unknown }).schema;
      }
    }
  } else {
    for (const [key, item] of Object.entries(input as Record<string, unknown>)) {
      if (item && (typeof item === 'object' || typeof item === 'function') && 'schema' in item) {
        const id = 'id' in item && typeof item.id === 'string' ? item.id : key;
        out[id] = (item as { schema: unknown }).schema;
      } else if (item && typeof item === 'object') {
        out[key] = item;
      }
    }
  }
  return Object.keys(out).length ? out : undefined;
}

function extractPatterns(input: unknown): Record<string, unknown> | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const out: Record<string, unknown> = {};
  if (Array.isArray(input)) {
    for (const item of input) {
      if (item && typeof item === 'object' && 'id' in item) {
        out[String((item as { id: string }).id)] = item;
      }
    }
  } else {
    for (const [key, item] of Object.entries(input as Record<string, unknown>)) {
      if (item && typeof item === 'object') {
        const id = 'id' in item && typeof item.id === 'string' ? item.id : key;
        out[id] = item;
      }
    }
  }
  return Object.keys(out).length ? out : undefined;
}

/** The theme's folder, as written: no installed modules, builds or packages. */
function sourceFiles(dir: string, sub = ''): string[] {
  return readdirSync(join(dir, sub)).flatMap((name) => {
    if (SKIPPED.has(name) || name.startsWith('.') || name.endsWith('.livrea')) return [];
    const path = sub ? `${sub}/${name}` : name;
    return statSync(join(dir, path)).isDirectory() ? sourceFiles(dir, path) : [relative(dir, join(dir, path)).split(sep).join('/')];
  });
}

const sha256 = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
