---
title: Settings
---

# Settings

Settings are what the people running an app may change in a theme without code: an accent colour, a welcome text, whether a clock shows. A theme declares each one as a field. The definitions are plain data, so an app's admin can read them as JSON and build its form from them, with one kind of input per kind of field. The values it saves reach the theme as `this.settings`.

## Declaring Settings

Settings live in a module of their own, `src/settings.ts`, so `livrea pack` can read them without running the theme:

```ts
import { defineSettings, field } from 'livrea';

export const settings = defineSettings({
  accent: field.color({ label: { en: 'Accent colour', it: 'Colore' }, default: '#c9a96e' }),
  welcome: field.localizedText({ label: { en: 'Welcome text' }, default: { en: 'Welcome', it: 'Benvenuti' } }),
  layout: field.select({
    label: { en: 'Layout' },
    options: [
      { value: 'stage', label: { en: 'Host in the middle' } },
      { value: 'split', label: { en: 'Host on the side' } }
    ],
    default: 'stage'
  }),
  showClock: field.toggle({ label: { en: 'Show the clock' }, default: true }),
  corners: field.range({ label: { en: 'Corner radius' }, min: 0, max: 32, step: 2, unit: 'px', default: 16 }),
  background: field.image({ label: { en: 'Background photo' }, help: { en: 'Shown behind the home page.' } })
});
```

The theme's default export carries them: `export default { pages, layout, settings }`. `defineSettings` checks the definitions when the theme is built: names of letters and digits, a select's default among its options, a range's default within it.

Labels and help texts are given in the app's languages, by the codes the app uses.

## The Fields

| Field | Value | The admin shows |
|---|---|---|
| `color` | `#rrggbb` | A colour picker |
| `text` | A string, at most `maxLength` | A text input, or a text area with `multiline` |
| `localizedText` | A text per language; languages left empty read as the default's | One input per language |
| `select` | One of `options` | A select or radio buttons |
| `toggle` | `true` or `false` | A switch |
| `range` | A number from `min` to `max`, by `step` | A slider |
| `image` | The image's address, or `null` | The app's image picker |

## Reading Settings

```tsx
class Home extends HomePage {
  // The language comes from the app's store.
  Heading = slot(() => <h1 className={this.settings.layout}>{this.settings.welcome[this.store.language]}</h1>);
}
```

`this.settings` is always valid: a value that's missing, or doesn't fit its field (a colour that isn't one, a number out of range), reads as the default. Every read is tracked, so what reads a setting renders again when the admin changes it.

To type `this.settings`, the theme declares its settings for Livrea:

```ts
declare module 'livrea' {
  interface ThemeSettings extends SettingsValues<typeof settings> {}
}
```

### In CSS

Colour and range settings are also CSS variables, `--setting-<name>` in kebab case, kept up to date:

```ts
styles = css`
  .card { border-color: var(--setting-accent); border-radius: var(--setting-corners); }
`;
```

## On the App's Side

The app sends the chosen values in its store, under `settings`. With `createThemeApp`, that's one more key in `store(app)`. An image's value is whatever address the app's policy allows, such as a cached file's.

The admin reads `settings.json` from the theme's package:

```json
{
  "format": 1,
  "fields": {
    "accent": { "kind": "color", "label": { "en": "Accent colour" }, "default": "#c9a96e" }
  }
}
```

It builds its form from `fields`, checks values with the same rules (`fits` and `resolveSettings` in `livrea` do it in TypeScript), and stores them. A value a later version of the theme no longer accepts does no harm: it reads as that version's default.

## Declaring the Data a Theme Reads

Settings say how a list looks; what's in it comes from the app, through the store. Declare what your theme reads next to its settings, and an app or builder can tell what it needs:

```ts
import { dataField, defineData, type DataValues } from 'livrea';

export const data = defineData({
  articles: dataField.list({
    label: { en: 'Articles' },
    item: { id: 'string', title: 'string', minutes: 'number?' },
    sample: [{ id: 'a1', title: 'Hello', minutes: 3 }]
  }),
  tagline: dataField.value({ label: { en: 'Tagline' }, type: 'string', sample: 'A journal' })
});

declare module 'livrea' {
  interface ThemeStore extends DataValues<typeof data> {}
}
```

`dataField` has `list`, `record` (one item) and `value`, with the types `string`, `number` and `boolean`, `any` for nested data (only checked for being there), and `?` for values that may be left out. A sample that doesn't fit its shape fails as the theme is defined. Put this in `src/data.ts`, with the samples in one `src/samples.json` (`import samples from './samples.json'`, and `resolveJsonModule` in `tsconfig.json`), and `livrea pack` writes them to `settings.json`, leaving them out of the code an app loads. `data` in `theme.json` names another module; `settingsJson(settings, { data })` does the same by hand.

In a builder, samples can be edited to see the theme with an empty list, a long one or the wrong shape; **Download theme** in the playground writes them back to `src/samples.json`.

Declaring fetches nothing: the app provides the data in its store, as always.

- **`checkThemeData(data, state)`** reports each entry as `provided`, `missing` or `invalid`, for an app's upload step.
- **`withSampleData(data, state)`** fills what's missing with the samples, for a builder's preview. The engine never does this by itself, so a running app can't show a sample as if it were real.

