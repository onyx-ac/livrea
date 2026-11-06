import { strToU8, zipSync } from 'fflate';
import type { SettingsJson } from 'livrea';
import { DEMO_SETTINGS_JSON } from './theme.js';

export interface ThemePackageMeta {
  readonly id?: string;
  readonly name?: string;
  readonly version?: string;
}

/**
 * Builds a complete, ready-to-pack `.zip` archive of the customized theme folder:
 * - `theme.json`
 * - `settings.json` (the theme's customizability schema with updated defaults)
 * - `preset-settings.json` (the current `store.settings` JSON values)
 * - `package.json`
 * - `tsconfig.json`
 * - `src/settings.ts`
 * - `src/index.tsx`
 * - `README.md`
 */
export function buildThemeZipBytes(
  values: Readonly<Record<string, unknown>>,
  schema: SettingsJson = DEMO_SETTINGS_JSON,
  meta: ThemePackageMeta = {}
): Uint8Array {
  const mergedSettings: Record<string, unknown> = {};
  const updatedFields: Record<string, unknown> = {};

  for (const [key, fieldDef] of Object.entries(schema.fields)) {
    const currentValue = values[key] !== undefined ? values[key] : fieldDef.default;
    mergedSettings[key] = currentValue;
    updatedFields[key] = { ...fieldDef, default: currentValue };
  }

  const updatedSettingsJson: SettingsJson = {
    format: schema.format ?? 1,
    fields: updatedFields as SettingsJson['fields'],
    ...(schema.blocks ? { blocks: schema.blocks } : {}),
    ...(schema.patterns ? { patterns: schema.patterns } : {}),
    ...(schema.data ? { data: schema.data } : {})
  };

  const siteName =
    typeof mergedSettings.siteName === 'string' && mergedSettings.siteName.trim()
      ? mergedSettings.siteName.trim()
      : (meta.name ?? 'Meridian Studio');

  const themeJson = {
    id: meta.id ?? 'meridian-studio',
    name: siteName,
    version: meta.version ?? '1.0.0',
    engine: 'meridian-web@1',
    description: {
      en: 'Customized website theme exported from the Livrea Visual Builder.',
      it: 'Tema web personalizzato esportato dal Visual Builder di Livrea.'
    },
    entry: 'src/index.tsx',
    settings: 'src/settings.ts'
  };

  const packageJson = {
    name: `${themeJson.id}-theme`,
    version: themeJson.version,
    private: true,
    type: 'module',
    scripts: {
      pack: 'livrea pack',
      typecheck: 'tsc --noEmit'
    },
    dependencies: {
      livrea: '^0.1.0'
    },
    devDependencies: {
      '@livrea/cli': '^0.1.0',
      typescript: '~5.8.3'
    }
  };

  const tsconfigJson = {
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      strict: true,
      jsx: 'react-jsx',
      jsxImportSource: 'livrea',
      resolveJsonModule: true,
      noEmit: true
    },
    include: ['src']
  };

  const fieldLines = Object.entries(schema.fields).map(([key, def]) => {
    const val = JSON.stringify(mergedSettings[key], null, 2);
    switch (def.kind) {
      case 'color':
        return `  ${key}: field.color({ label: ${JSON.stringify(def.label)}, default: ${val} })`;
      case 'range':
        return `  ${key}: field.range({ label: ${JSON.stringify(def.label)}, min: ${def.min}, max: ${def.max}, step: ${def.step}${def.unit ? `, unit: ${JSON.stringify(def.unit)}` : ''}, default: ${val} })`;
      case 'text':
        return `  ${key}: field.text({ label: ${JSON.stringify(def.label)}, default: ${val} })`;
      case 'localizedText':
        return `  ${key}: field.localizedText({ label: ${JSON.stringify(def.label)}, default: ${val} })`;
      case 'toggle':
        return `  ${key}: field.toggle({ label: ${JSON.stringify(def.label)}, default: ${val} })`;
      case 'select':
        return `  ${key}: field.select({ label: ${JSON.stringify(def.label)}, options: ${JSON.stringify(def.options)}, default: ${val} })`;
      case 'image':
        return `  ${key}: field.image({ label: ${JSON.stringify(def.label)}, default: ${val} })`;
      case 'blocks':
        return `  ${key}: field.blocks({ label: ${JSON.stringify(def.label)}${def.allowed ? `, allowed: ${JSON.stringify(def.allowed)}` : ''}, default: ${val} })`;
    }
  });

  const settingsTs = `import { definePattern, defineSettings, field } from 'livrea';

export const blocks = ${JSON.stringify(schema.blocks ?? {}, null, 2)} as const;

export const patterns = Object.values(${JSON.stringify(schema.patterns ?? {}, null, 2)}).map((p) => definePattern(p));

export const settings = defineSettings({
${fieldLines.join(',\n')}
});
`;

  const indexTsx = `/** @jsxImportSource livrea */
import { blockSlot, Component, defineBlock, field, hostComponent, Layout, Outlet, slot } from 'livrea';
import { settings } from './settings.js';

export const ContactForm = hostComponent<{
  heading?: string;
  defaultTopic?: 'project' | 'consulting' | 'general';
  submitLabel?: string;
  onSubmit?: (payload: { name: string; email: string; topic: string; message: string }) => void;
}>('ContactForm');

export const ActionButton = hostComponent<{
  label: string;
  target: string;
  variant?: 'primary' | 'ghost';
  onPress?: () => void;
}>('ActionButton');

export const SplitColumns = defineBlock({
  id: 'split-columns',
  label: { en: 'Split Columns' },
  fields: {
    ratio: field.select({
      label: { en: 'Column Ratio' },
      options: [
        { value: '1:1', label: { en: 'Equal (1:1)' } },
        { value: '1:2', label: { en: 'Sidebar Left (1:2)' } },
        { value: '2:1', label: { en: 'Sidebar Right (2:1)' } }
      ],
      default: '1:2'
    }),
    gap: field.range({ label: { en: 'Column Gap' }, min: 0.5, max: 2.5, step: 0.25, unit: 'rem', default: 1.25 })
  },
  slots: ['Left', 'Right'],
  render({ ratio, gap }, slots) {
    const template = ratio === '1:2' ? '1fr 1.6fr' : ratio === '2:1' ? '1.6fr 1fr' : '1fr 1fr';
    return (
      <div style={{ display: 'grid', gridTemplateColumns: template, gap: \`\${gap}rem\` }}>
        <div><slots.Left /></div>
        <div><slots.Right /></div>
      </div>
    );
  }
});

export class SiteLayout extends Layout {
  override render() {
    return (
      <div className="meridian-shell">
        <Outlet />
      </div>
    );
  }
}

export class HomePage extends Component {
  Hero = slot(() => <h1>{String((this.settings as Record<string, any>).heroTitle?.en ?? 'Welcome')}</h1>);
  Stage = blockSlot('homeStage');
  override render() {
    return (
      <section>
        <this.Hero />
        <this.Stage />
      </section>
    );
  }
}

export class ArticlesPage extends Component {
  Stage = blockSlot('articlesStage');
  override render() {
    return (
      <section>
        <this.Stage />
      </section>
    );
  }
}

export class ContactPage extends Component {
  Stage = blockSlot('contactStage');
  override render() {
    return (
      <section>
        <this.Stage />
      </section>
    );
  }
}

export default {
  layout: SiteLayout,
  pages: { home: HomePage, articles: ArticlesPage, contact: ContactPage },
  settings,
  blocks: [SplitColumns]
};
`;

  const readmeMd = `# ${themeJson.name} — Livrea Theme

Exported from the **Livrea Visual Theme Builder (\`@livrea/ui\`)**.

## Quick Start

\`\`\`bash
npm install
npm run typecheck
npm run pack       # produces ${themeJson.id}-${themeJson.version}.livrea
\`\`\`

- \`settings.json\`: The theme's customizability schema (\`fields\`, \`blocks\`, \`patterns\`) — can also be uploaded directly back into the Livrea Playground.
- \`src/settings.ts\`: Contains your customized \`field.*\` defaults, \`blocks\` schemas, and \`patterns\`.
- \`src/data.ts\` and \`src/samples.json\`: What the theme reads from the store, with the samples for previews, as you left them in the builder.
- \`src/index.tsx\`: Contains the theme's \`Layout\`, page classes (\`HomePage\`, \`ArticlesPage\`, \`ContactPage\`), and reusable blocks.
- \`preset-settings.json\`: Raw \`store.settings\` JSON values from your visual builder session.
`;

  return zipSync(
    {
      'theme.json': strToU8(JSON.stringify(themeJson, null, 2) + '\n'),
      'settings.json': strToU8(JSON.stringify(updatedSettingsJson, null, 2) + '\n'),
      'preset-settings.json': strToU8(JSON.stringify(mergedSettings, null, 2) + '\n'),
      'package.json': strToU8(JSON.stringify(packageJson, null, 2) + '\n'),
      'tsconfig.json': strToU8(JSON.stringify(tsconfigJson, null, 2) + '\n'),
      'src/settings.ts': strToU8(settingsTs),
      ...dataFiles(schema.data),
      'src/index.tsx': strToU8(indexTsx),
      'README.md': strToU8(readmeMd)
    },
    { level: 9 }
  );
}

export function triggerThemeZipDownload(
  values: Readonly<Record<string, unknown>>,
  schema: SettingsJson = DEMO_SETTINGS_JSON,
  meta: ThemePackageMeta = {},
  filename = `${meta.id ?? 'meridian-studio'}-theme.zip`
): void {
  const bytes = buildThemeZipBytes(values, schema, meta);
  const blob = new Blob([bytes as BlobPart], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** What the theme reads from the store: the declarations in src/data.ts, and their samples in the one src/samples.json. */
function dataFiles(data: SettingsJson['data']): Record<string, Uint8Array> {
  if (!data || !Object.keys(data).length) return {};
  const samples = Object.fromEntries(Object.entries(data).map(([name, definition]) => [name, definition.sample]));
  const declarations = Object.entries(data).map(([name, { sample: _sample, ...definition }]) => {
    const body = JSON.stringify(definition, null, 2).replace(/\n\}$/, `,\n  "sample": samples[${JSON.stringify(name)}]\n}`);
    return `  ${JSON.stringify(name)}: ${body.replace(/\n/g, '\n  ')}`;
  });
  const dataTs = `import { defineData, type DataSchema } from 'livrea';
import samples from './samples.json';

export const data = defineData({
${declarations.join(',\n')}
} as unknown as DataSchema);
`;
  return {
    'src/data.ts': strToU8(dataTs),
    'src/samples.json': strToU8(JSON.stringify(samples, null, 2) + '\n')
  };
}
