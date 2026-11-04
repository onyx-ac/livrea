---
title: Packaging
---

# Packaging

A theme reaches an app as one file, `<id>-<version>.livrea`, built by `@livrea/cli` from the theme's folder. The app's server checks it and stores it as data, so it never compiles TSX.

```bash
npm install --save-dev @livrea/cli
npx livrea pack            # the theme in this folder
npx livrea pack themes/linen --out dist
```

## A Theme's Folder

```text
linen/
├── theme.json        what the theme is, and how to build it
├── tsconfig.json     for type-checking, with the app's theme kit
└── src/
    ├── index.tsx     export default { pages, layout, settings }
    ├── settings.ts   export const settings = defineSettings({ … })
    └── pages/, components/, shared/
```

### `theme.json`

```json
{
  "id": "linen",
  "name": "Linen",
  "version": "1.0.0",
  "engine": "hotel-kiosk@1",
  "parent": "lacquer",
  "description": { "EN": "Light and airy.", "IT": "Leggero e arioso." },
  "shared": ["@hotel/kiosk-theme"]
}
```

| Key | |
|---|---|
| `id` | Lowercase letters, digits and dashes; the same for every version |
| `version` | `x.y.z`. An app never accepts the same version with other content |
| `engine` | The app API the theme is written for; the app decides which it runs |
| `parent` | The theme it extends, for the admin to show |
| `description` | For the admin to show: one text, or one per language with the app's language codes |
| `entry` | The module whose default export is the theme; `src/index.ts(x)` by default |
| `settings` | The module that exports its settings; `src/settings.ts` if there is one |
| `shared` | Modules the app provides at runtime, such as its base pages: imported, never bundled |

## What `pack` Does

1. **Type-checks** the theme with its `tsconfig.json`. Type errors stop the build.
2. **Bundles** the entry into one ES module. `livrea`, its JSX runtime and the `shared` modules are left out: each import becomes a lookup of the module the app provides when it loads the theme. The theme's classes then extend the app's own base classes and run on the runtime's reactive core, not on a copy.
3. **Reads the settings** by running only the settings module, never the theme, and writes their definitions to `settings.json`.
4. **Writes the package**: a zip with the theme's `theme.json`, `build/theme.js`, `settings.json`, the folder under `source/`, and `manifest.json` with every other file's SHA-256.

```text
linen-1.0.0.livrea
├── theme.json
├── build/theme.js
├── settings.json
├── source/…
└── manifest.json
```

The same can be done from code: `import { pack } from '@livrea/cli'`.

## Loading a Package

The app's server checks the manifest's hashes, `theme.json` and the engine, and stores the package. It never runs the code. The app's worker loads the module with `importTheme`, giving it the modules the theme lists as `shared`:

```ts
import { importTheme, serveRuntime } from 'livrea/worker';
import * as kit from './theme-kit';

serveRuntime({
  theme: () => importTheme(themeModuleUrl, { '@hotel/kiosk-theme': kit }),
  block: { storage: true }
});
```

`livrea` and its JSX runtime are always the worker's own. A shared module the app doesn't provide stops the theme from loading, with a message naming it.
