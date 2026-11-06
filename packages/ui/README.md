# `@livrea/ui`

Livrea's low-footprint visual theme builder for React host apps (`livrea` and `react` as peer dependencies, zero external UI framework dependencies).

```tsx
import { ThemeBuilder } from '@livrea/ui';

<ThemeBuilder
  schema={settingsJson}
  values={presetSettings}
  onChange={setPresetSettings}
  client={themeClient}
  components={previewHostComponents}
  pages={['home', 'guide', 'category']}
/>
```

## Components

- `<ThemeBuilder />` — Full 3-pane studio: Document Outline & Pattern Inserter on the left, `<ThemeCanvas />` in the center, and `<SettingsForm />` Inspector on the right.
- `<ThemeCanvas />` — Live preview (`ThemeRoot` / `ThemePage`) with page switcher, viewport presets, and event simulator buttons.
- `<VisualEditor />` — Visual editing on the preview itself, which `<ThemeBuilder />` turns on: select a block by clicking it, drag it within its slot or into another, add to empty slots, and remove it. The panels stay an alternative way to do all of it, on the same selection.
- `<BlockTree />` — Gutenberg-style recursive tree editor for a `field.blocks()` slot, supporting selection, reordering, deletion, and block/pattern insertion at any depth.
- `<PatternPicker />` — Visual gallery of `patterns` from `settings.json` filtered by target slot, unpacking into a mutable `BlockNode[]` tree.
- `<SettingsForm />` — Renders inputs for the 7 scalar `field.*` kinds (`color`, `text`, `localizedText`, `select`, `toggle`, `range`, `image`).

## Visual editing

Start the preview's runtime with `editing`, and let its policy accept the markers:

```tsx
new ThemeClient({
  connect: connectInThread({ theme, events, editing: true }),
  policy: { tags: SAFE_TAGS, hosts: new Set([...hostNames(components), ...EDITOR_HOST_NAMES]), url },
  // ...
});
```

With `editing`, the engine puts a marker around each block and slot rendered from a `field.blocks()` setting, saying where it is in the tree. Off, which is the default and how every app runs, the output is unchanged. Blocks a theme writes in its own TSX have no markers, and can't be edited. A runtime without `editing` gets a plain, interactive preview.

Markers use `display: contents`, so they add no boxes, but they are elements: a theme's `.parent > .child` selector stops matching across one while editing. Empty slots get room while editing: 56px in an empty block, and a 12px line with a small `+` beside slots that hold blocks, so a filled block looks like itself. A filled slot takes no room: a line with a `+` shows at its end, over the layout, while a block in that slot is hovered or selected. **Preview**, in the canvas toolbar, shows the theme as it will be and lets its buttons and forms work.

Every change can be undone, from the toolbar or with `Ctrl+Z` and `Ctrl+Shift+Z` (`Cmd` on a Mac), and undoing brings back the page and selection it happened on. In a text field those keys undo the field's own typing. Quick changes to one field count as one step. The history covers this session of the builder, and starts over when the app replaces the values itself, as on loading another theme.

Keyboard, with the canvas focused: `Delete` removes the selected block, `Alt+↑/↓` moves it, and `Esc` cancels a drag or clears the selection. A mouse drags from anywhere on a block; a finger scrolls the page and drags from the toolbar's grip. Dragging a container whose inside is full of blocks also starts from the grip, after selecting it (click its edge, or `↑` on a block inside it).

## Data

A theme can declare what it reads from the store, with `defineData` beside its settings; `livrea pack` writes it to `settings.json`. The builder's Inspector then lists it, each item as **Sample data**, **From the app**, or **Wrong shape** with what's wrong. Pass what your app really has as `<ThemeBuilder data={...} />`, and start the preview with samples for the rest. With `onDataChange`, samples can be edited there to see the theme with an empty list, a long one or the wrong shape, and undo covers it:

```tsx
state: withSampleData(schema.data, { ...yourState, settings: values });
```

Declare data in `src/data.ts`, with its samples in `src/samples.json`, importing them by that name. Only the packer reads that module, so samples go into `settings.json` and not into the code an app loads.

Samples are for previews. In a running app the engine never adds them; use `checkThemeData(schema.data, state)` to tell someone a theme needs data the app doesn't provide.

## Astryx UI Components & Planned Ejection

`@livrea/ui` currently utilizes components from Meta's `@astryxdesign/core` (including `Button`, `CommandPalette`, `Selector`, `TextInput`, `TextArea`, `Switch`, `Slider`, `Kbd`) to provide an accessible, high-fidelity visual builder UX.

> [!NOTE]
> **Planned Ejection**: An ejection of the used Astryx component primitives directly into the `@livrea/ui` source tree is planned once the overall design and UX are finalized. This will emit and integrate the component source directly into the package, eliminating the external `@astryxdesign/core` dependency and maintaining Livrea's commitment to a self-contained, low-footprint UI layer.


