import { cloneBlockTree } from '@livrea/ui';
import { strFromU8, unzipSync } from 'fflate';
import type { SettingsJson } from 'livrea';
import type { ThemeSource } from 'livrea/runtime';
import { importTheme } from 'livrea/worker';

export interface UploadedThemeBundle {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly schema: SettingsJson;
  readonly values: Record<string, unknown>;
  readonly themeSource?: ThemeSource;
}

function defaultValuesFromSchema(schema: SettingsJson): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, fieldDef] of Object.entries(schema.fields)) {
    if (fieldDef.kind === 'blocks') {
      out[key] = cloneBlockTree(fieldDef.default ?? [], schema.blocks);
    } else {
      out[key] = fieldDef.default;
    }
  }
  return out;
}

function isSettingsJson(value: unknown): value is SettingsJson {
  return (
    value !== null &&
    typeof value === 'object' &&
    'fields' in value &&
    typeof (value as { fields?: unknown }).fields === 'object' &&
    (value as { fields?: unknown }).fields !== null
  );
}

/**
 * Parses an uploaded starting theme file:
 * - `.livrea` package (built by `livrea pack`)
 * - `.zip` theme archive (exported by the Playground or containing `settings.json` / `theme.json`)
 * - `.json` file (`settings.json` schema or preset values)
 */
export async function parseUploadedTheme(
  fileName: string,
  bytes: Uint8Array,
  currentSchema: SettingsJson
): Promise<UploadedThemeBundle> {
  const lower = fileName.toLowerCase();

  if (lower.endsWith('.json')) {
    const parsed = JSON.parse(strFromU8(bytes)) as unknown;
    if (isSettingsJson(parsed)) {
      return {
        id: fileName.replace(/\.json$/i, ''),
        name: fileName.replace(/\.json$/i, ''),
        version: '1.0.0',
        // The theme running is still the current one, and reads the data it always did.
        schema: { ...parsed, data: parsed.data ?? currentSchema.data },
        values: defaultValuesFromSchema(parsed)
      };
    }
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return {
        id: 'custom-preset',
        name: 'Uploaded Preset',
        version: '1.0.0',
        schema: currentSchema,
        values: {
          ...defaultValuesFromSchema(currentSchema),
          ...(parsed as Record<string, unknown>)
        }
      };
    }
    throw new Error('The uploaded JSON file must be a settings.json schema or a settings values object.');
  }

  // .livrea or .zip archive
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error(`"${fileName}" is not a valid .livrea or .zip archive.`);
  }

  const findEntry = (suffix: string): Uint8Array | undefined => {
    if (files[suffix]) return files[suffix];
    const match = Object.keys(files).find((k) => k.endsWith(`/${suffix}`));
    return match ? files[match] : undefined;
  };

  let id = fileName.replace(/\.(livrea|zip)$/i, '');
  let name = id;
  let version = '1.0.0';

  const themeJsonBytes = findEntry('theme.json');
  if (themeJsonBytes) {
    const meta = JSON.parse(strFromU8(themeJsonBytes)) as { id?: string; name?: string; version?: string };
    if (typeof meta.id === 'string' && meta.id) id = meta.id;
    if (typeof meta.name === 'string' && meta.name) name = meta.name;
    if (typeof meta.version === 'string' && meta.version) version = meta.version;
  }

  let schema = currentSchema;
  const settingsJsonBytes = findEntry('settings.json');
  if (settingsJsonBytes) {
    const parsedSchema = JSON.parse(strFromU8(settingsJsonBytes)) as unknown;
    if (!isSettingsJson(parsedSchema)) {
      throw new Error('settings.json inside the archive is missing a valid "fields" object.');
    }
    schema = parsedSchema;
  }

  let values = defaultValuesFromSchema(schema);
  const presetBytes = findEntry('preset-settings.json');
  if (presetBytes) {
    const parsedPreset = JSON.parse(strFromU8(presetBytes)) as Record<string, unknown>;
    values = { ...values, ...parsedPreset };
  }

  let themeSource: ThemeSource | undefined;
  const compiledModuleBytes = findEntry('build/theme.js');
  if (compiledModuleBytes) {
    const jsCode = strFromU8(compiledModuleBytes);
    const dataUrl = `data:text/javascript;charset=utf-8,${encodeURIComponent(jsCode)}`;
    themeSource = await importTheme(dataUrl);
  }

  // Without a theme of its own, the archive only changes the settings of the one running.
  if (!themeSource) schema = { ...schema, data: schema.data ?? currentSchema.data };
  return { id, name, version, schema, values, themeSource };
}

