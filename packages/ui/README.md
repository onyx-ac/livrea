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
- `<BlockTree />` — Gutenberg-style recursive tree editor for a `field.blocks()` slot, supporting selection, reordering, deletion, and block/pattern insertion at any depth.
- `<PatternPicker />` — Visual gallery of `patterns` from `settings.json` filtered by target slot, unpacking into a mutable `BlockNode[]` tree.
- `<SettingsForm />` — Renders inputs for the 7 scalar `field.*` kinds (`color`, `text`, `localizedText`, `select`, `toggle`, `range`, `image`).

## Astryx UI Components & Planned Ejection

`@livrea/ui` currently utilizes components from Meta's `@astryxdesign/core` (including `Button`, `CommandPalette`, `Selector`, `TextInput`, `TextArea`, `Switch`, `Slider`, `Kbd`) to provide an accessible, high-fidelity visual builder UX.

> [!NOTE]
> **Planned Ejection**: An ejection of the used Astryx component primitives directly into the `@livrea/ui` source tree is planned once the overall design and UX are finalized. This will emit and integrate the component source directly into the package, eliminating the external `@astryxdesign/core` dependency and maintaining Livrea's commitment to a self-contained, low-footprint UI layer.


