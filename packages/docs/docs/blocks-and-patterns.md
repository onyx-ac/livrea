---
title: Blocks, Patterns & Visual Builder
---

# Blocks, Patterns & Visual Builder

Livrea is designed to streamline two workflows that usually pull in opposite directions:

1. **Developers and AI Agents**, who build base pages, reactive data selectors, event handlers, and reusable UI components in strictly typed **TSX**.
2. **Designers and Non-Technical Users**, who assemble layouts, swap sections, and tune appearance visually on a live canvas without touching code.

A Gutenberg-style **Slot → Block → Pattern** architecture bridges both audiences without introducing a second rendering engine or splitting themes into incompatible formats.

---

## Why One Layered Model Beats Two Competing Formats

A common trap in visual theme builders is allowing pages to be authored *either* as code templates *or* as arbitrary JSON DOM trees (`{ "tag": "div", "children": [...] }`):
- **Two sources of truth:** If a developer updates `Home.tsx` while a designer edits `home-layout.json`, the two conflict.
- **A dead-end for logic:** The moment a JSON block tree needs a single reactive filter (`s.isOnNow(dish)`) or event listener (`on('rail:press', …)`), raw JSON hits a wall.
- **Poor fit for AI agents:** Coding agents excel at writing 25-line TypeScript classes where `tsc` validates every slot, store path, and event payload; they struggle with deeply nested proprietary JSON ASTs.

Livrea avoids this by separating **capability definition (TSX)** from **visual composition (JSON)**:
- **TSX** is the single language for **Page Classes** and **Blocks** (where `select()`, `on()`, `this.store`, and `hostComponent`s live).
- **JSON** only describes **which Blocks sit in which Slots**, their **`field.*` values**, and **Patterns** (saved trees of Blocks).

---

## The 3-Layer Hierarchy: Slots → Blocks → Patterns

If visual customisation only offered top-level page or slot variants (`minimal` | `hero` | `split`), a designer would hit a wall the moment they wanted to customise *inside* a variant (for example, keeping a split hero layout but moving a button or adding a weather card inside the right column).

Infinite customisation depth comes from making **Slots** and **Blocks** recursive, and treating **Patterns** as starter trees that unpack into blocks:

```text
Page Class (HomePage)
├── Slot: Header
└── Slot: Stage
    └── Block: SplitColumns (ratio = "1:2")
        ├── Slot: Left
        │   └── Block: HostAvatar (size = "large")
        └── Slot: Right
            └── Block: Card (tone = "gold", padding = 24)
                ├── Slot: Body
                │   └── Block: DailyMenu (course = "mains")
                └── Slot: Footer
                    └── Block: ActionButton (target = "calendar")
```

| Concept | Gutenberg Counterpart | Role in Livrea |
|---|---|---|
| **Slot** | Block Area / InnerBlocks | A named drop zone. Pages have root slots (`Header`, `Stage`, `Rail`), and container Blocks expose inner slots (`Left`, `Right`, `Body`, `Footer`). |
| **Block** | Block | A reusable Livrea component with a [`field.*`](./settings.md) schema for the visual Inspector and optional inner `slots`. |
| **Pattern** | Block Pattern | A pre-assembled tree of nested Blocks and preset `field` values. Dropping a Pattern into a Slot unpacks its blocks so every child can be inspected, reordered, or edited at any depth. |

---

## 1. Blocks: Code + `field.*` Schema + Inner Slots

A Block is written in TSX by a developer or AI agent. It combines Livrea's existing [`field.*`](./settings.md#the-fields) definitions (`color`, `text`, `localizedText`, `select`, `toggle`, `range`, `image`) with optional inner slots and a `render()` method:

```tsx
/** @jsxImportSource livrea */
import { defineBlock, field } from 'livrea';

export const Card = defineBlock({
  id: 'card',
  label: { en: 'Card', it: 'Scheda' },
  fields: {
    tone: field.select({
      label: { en: 'Style' },
      options: [
        { value: 'glass', label: { en: 'Glass' } },
        { value: 'gold', label: { en: 'Gold' } }
      ],
      default: 'glass'
    }),
    padding: field.range({
      label: { en: 'Padding' },
      min: 8,
      max: 48,
      step: 4,
      unit: 'px',
      default: 24
    })
  },
  slots: ['Header', 'Body', 'Footer'],
  render({ tone, padding }, slots) {
    return (
      <article className={`card card-${tone}`} style={{ padding }}>
        <slots.Header />
        <slots.Body />
        <slots.Footer />
      </article>
    );
  }
});
```

Because a Block runs inside the Livrea runtime:
- **In TSX:** Developers and agents can use `<Card tone="gold" Body={() => <DailyMenu />} />` directly inside any page class.
- **In the Visual Builder:** The editor reads `fields` to build the right-hand Inspector controls and reads `slots` (`Header`, `Body`, `Footer`) to expose nested drop zones on the canvas.
- **Validation for free:** Just like `this.settings`, every block prop is validated through `fits()` and `resolveSettings()`, falling back to the field's default if an invalid value is passed.

---

## 2. Slots: Recursive Drop Zones

Every Slot on a Page (`<this.Stage />`) or inside a Block (`<slots.Body />`) is an isolated reactive unit (`OutUnit`) with a default rendering.

When a designer customises a Slot visually, the builder stores a serialisable `BlockNode[]` tree for that slot:

```json
{
  "Stage": [
    {
      "block": "split-columns",
      "props": { "ratio": "1:2" },
      "slots": {
        "Left": [
          { "block": "host-avatar", "props": { "size": "large" } }
        ],
        "Right": [
          {
            "block": "card",
            "props": { "tone": "gold", "padding": 24 },
            "slots": {
              "Body": [{ "block": "daily-menu", "props": { "course": "mains" } }],
              "Footer": [{ "block": "action-button", "props": { "target": "calendar" } }]
            }
          }
        ]
      }
    }
  ]
}
```

If a slot is left untouched in the builder, it renders the base class's default slot as-is.

---

## 3. Patterns: One-Click Starting Points That Unpack

A **Pattern** is not a rigid black-box component; it is a named preset containing a `BlockNode[]` subtree (and optional theme setting overrides):

```ts
export const WelcomeSplitPattern = definePattern({
  id: 'welcome-split',
  label: { en: 'Welcome Split with Daily Menu' },
  targetSlot: 'Stage',
  tree: [
    // The nested BlockNode[] tree above
  ]
});
```

1. **One-click insertion:** In the visual builder, a non-technical user clicks the `Stage` slot and picks *"Welcome Split with Daily Menu"* from the Pattern gallery.
2. **Deep customisation:** The pattern unpacks into `SplitColumns` → `Card` → `DailyMenu` + `ActionButton`. The user can then click the inner `Card` to change `tone` from `"gold"` to `"glass"`, drag a `WeatherBadge` block into `Card`'s `Header` slot, or delete `ActionButton`.

---

## Integration with `settings.json` and `store.settings`

Blocks, Slots, and Patterns integrate directly into [`settings.json`](./settings.md) and `store.settings` without requiring a second file in the `.livrea` archive, a second database column on the server, or a second message type in the protocol.

### 1. A Slot's Block Tree as a Field Kind: `field.blocks()`

Alongside the 7 scalar field kinds (`color`, `text`, `localizedText`, `select`, `toggle`, `range`, `image`), **`field.blocks()`** declares a visual slot's block tree as a first-class setting in `src/settings.ts`:

```ts
import { defineSettings, field } from 'livrea';

export const settings = defineSettings({
  // Scalar theme settings
  accent: field.color({ label: { en: 'Accent colour' }, default: '#c9a96e' }),
  corners: field.range({ label: { en: 'Corner radius' }, min: 0, max: 32, step: 2, unit: 'px', default: 16 }),

  // A visual block tree for the Home page's Stage slot
  homeStage: field.blocks({
    label: { en: 'Home — Stage' },
    allowed: ['split-columns', 'card', 'daily-menu', 'host-avatar', 'action-button'],
    default: [
      { block: 'host-avatar', props: { size: 'large' } }
    ]
  })
});
```

### 2. What `livrea pack` Writes to `settings.json`

When `livrea pack` evaluates `src/settings.ts`, `settings.json` remains the **single schema file** the admin reads from the `.livrea` package (without ever executing theme code):

```json
{
  "format": 1,
  "fields": {
    "accent": { "kind": "color", "label": { "en": "Accent colour" }, "default": "#c9a96e" },
    "homeStage": {
      "kind": "blocks",
      "label": { "en": "Home — Stage" },
      "allowed": ["split-columns", "card", "daily-menu", "host-avatar", "action-button"],
      "default": [{ "block": "host-avatar", "props": { "size": "large" } }]
    }
  },
  "blocks": {
    "card": {
      "label": { "en": "Card" },
      "fields": {
        "tone": {
          "kind": "select",
          "label": { "en": "Style" },
          "options": [
            { "value": "glass", "label": { "en": "Glass" } },
            { "value": "gold", "label": { "en": "Gold" } }
          ],
          "default": "glass"
        },
        "padding": { "kind": "range", "label": { "en": "Padding" }, "min": 8, "max": 48, "step": 4, "unit": "px", "default": 24 }
      },
      "slots": ["Header", "Body", "Footer"]
    }
  },
  "patterns": {
    "welcome-split": {
      "label": { "en": "Welcome Split with Daily Menu" },
      "for": "homeStage",
      "tree": [
        {
          "block": "split-columns",
          "props": { "ratio": "1:2" },
          "slots": {
            "Left": [{ "block": "host-avatar", "props": { "size": "large" } }],
            "Right": [{ "block": "card", "props": { "tone": "gold", "padding": 24 } }]
          }
        }
      ]
    }
  }
}
```

- **`fields`**: Top-level scalar settings alongside any `kind: "blocks"` slot trees.
- **`blocks`**: Each block's own `fields` (using the exact same `color`, `range`, `select`, `localizedText` definitions) and inner `slots` names.
- **`patterns`**: Starter `BlockNode[]` trees that can be inserted into a `blocks` field or inner slot.

### 3. Why This Keeps the Server, Admin, and Runtime Simple

1. **Zero Server or Protocol Changes:**
   The app server already stores a single JSON object of setting values per preset and sends it to the client in `store.settings`. Whether a key in `store.settings` is `"accent": "#123456"` or `"homeStage": [{ "block": "card", ... }]`, it lives in the same JSON blob, travels over the same `state` / `patches` messages, and is tracked by path in the `Store`.
2. **Recursive Validation with `resolveSetting()`:**
   - For scalar fields, `resolveSetting()` checks `fits(definition, value)` and falls back to `definition.default`.
   - For a `blocks` field, `resolveSetting()` recursively walks the `BlockNode[]` tree:
     - Drops any unknown or disallowed `block` id (or falls back to `default` if the root is malformed).
     - Calls `resolveSettings(blockDef.fields, node.props)` on every block's props—so missing props, out-of-range numbers, or empty language strings in `localizedText` get the **exact same default fallback** as top-level settings.
     - Recursively resolves each inner slot in `node.slots`.
3. **Reuse of Every Admin Input Control:**
   The admin UI already has 7 input components for `color`, `text`, `localizedText`, `select`, `toggle`, `range`, and `image` to render the `settings.json` form. When a designer clicks a Block on the visual canvas, the right-hand Inspector renders **those exact same 7 input components** for `blocks[id].fields`.
4. **Progressive Adoption:**
   - A theme with only scalar `fields` shows a simple Appearance form in the admin.
   - A theme that adds `field.blocks()`, `blocks`, and `patterns` unlocks the visual canvas builder for those slots.

---

## The Three-Tier Customisation Spectrum

This architecture establishes a continuous customisation spectrum where each tier feeds the next:

| Tier | Who | Medium | What It Controls |
|---|---|---|---|
| **1. Visual Disposition & Content** | Designers, agencies, site staff | **Visual Builder** (`settings.json` / `store.settings`) | Rearranging **Blocks** inside **Slots**, inserting **Patterns**, and tuning `field.*` properties (`color`, `range`, `localizedText`, `select`, `toggle`, `image`). |
| **2. Template & Behaviour Extension** | AI Agents (with a Livrea Design Skill) or Theme Devs | **TSX** (`slot`, `defineBlock`, `select`, `on`) | Custom reactive data derivations (`select()`), custom event workflows (`on()` + `e.preventDefault()`), slot overrides, and authoring new Blocks & Patterns. |
| **3. Core App Contract** | App Engineers | **TSX + Host Policy** (`livrea`, `livrea/host`, `livrea/react`) | Base page classes (`HomePage`), the `ThemeStore`, the `EventCatalog`, and opaque `hostComponent`s (`Avatar`, `Video`, `Mic`). |

- **Batteries-included parent themes:** The richer a parent theme's catalog of Blocks (`Columns`, `Stack`, `Grid`, `Card`, `Hero`, `DailyMenu`, `Weather`) and Patterns is, the more a customer can reshape the entire app in **Tier 1** without touching TSX.
- **The Agent → Designer flywheel:** When a customer needs a brand-new capability in **Tier 2** (e.g. *"A shuttle ticker showing the next 3 departures"*), an AI agent guided by a **Livrea Design Skill** writes it as a `defineBlock()` with `field.*` controls and inner `slots`, verifies it with `npx livrea pack`, and hands it back to **Tier 1**—where the human designer can immediately drag, nest, and style it on the visual canvas.

---

## `@livrea/ui`: Drop-in Visual Builder for Apps

:::tip Try It Live
Open the **[Interactive Visual Builder Playground](pathname:///livrea/demo/index.html)** ([source in `packages/playground`](https://github.com/onyx-ac/livrea/tree/develop/packages/playground)) to rearrange blocks, unpack patterns, trigger catalog events, and download a ready-to-pack `.zip` theme archive with your customizations.
:::

Rather than every app team building their own `settings.json` form renderer and Gutenberg-style canvas editor from scratch, **`@livrea/ui`** provides a ready-to-embed visual builder with a minimal dependency footprint (`livrea` and `react` as peer dependencies, zero external UI framework bloat).

```tsx
import { ThemeBuilder } from '@livrea/ui';

<ThemeBuilder
  schema={settingsJsonFromPackage}       // settings.json from the .livrea archive
  values={presetSettings}                // current store.settings values
  onChange={setPresetSettings}           // called as the designer edits fields or block trees
  client={themeClient}                   // live ThemeClient running the preview
  components={previewHostComponents}     // host components (or stand-ins for hardware like Mic/Avatar)
  pages={['home', 'guide', 'category']}
  events={sampleCatalogEvents}           // optional event triggers to test session:start, offline, etc.
/>
```

### Composable Building Blocks in `@livrea/ui`

App engineers can mount the full 3-pane `<ThemeBuilder />` or compose its individual panels inside their existing admin layout:

| Component | Purpose |
|---|---|
| `<ThemeBuilder />` | Full 3-pane studio: Document Outline & Inserter on the left, live `<ThemeCanvas />` in the center, and `<Inspector />` on the right. |
| `<ThemeCanvas />` | Wraps `ThemeRoot` / `ThemePage` with interactive hover/click outlines for every `OutUnit` (slot and block), viewport size/orientation toggles, and a catalog event simulator bar. |
| `<BlockTree />` | Gutenberg-style tree outline showing the active page's slots and nested blocks, with keyboard/pointer reordering and a `+` Block & Pattern inserter popover. |
| `<PatternPicker />` | Visual gallery of `patterns` from `settings.json` filtered by target slot, unpacking the chosen `BlockNode[]` tree on selection. |
| `<SettingsForm />` | Renders the 7 scalar `field.*` controls (`color`, `text`, `localizedText`, `select`, `toggle`, `range`, `image`) for either top-level theme settings or the currently selected Block's `props`. |

### Visual Editing on the Preview

`<ThemeBuilder />` also edits on the preview itself: click a block to select it, drag it within its slot or into another, add blocks to empty slots, and remove them. It shares its selection with the outline and the Inspector, so both ways can be mixed. It needs a runtime started with `editing: true`, and `EDITOR_HOST_NAMES` in its policy: see the [`@livrea/ui` README](https://github.com/onyx-ac/livrea/tree/main/packages/ui#visual-editing). Only an editing runtime emits the markers this relies on; everywhere else, blocks render as they always have.

### Low-Footprint Design Principles

1. **Zero UI library dependencies:** Built with semantic HTML, accessible ARIA attributes, and native pointer events—only `livrea` and `react` are peer dependencies.
2. **Reads `settings.json` directly:** Operates purely on the JSON schema emitted by `livrea pack` and the live `ThemeClient`, so the admin never needs to bundle or execute theme source code to render the editor forms.
3. **Themeable via CSS variables:** Styled with a small stylesheet using `--livrea-ui-*` custom properties so it adapts cleanly to any host admin's light or dark mode.
4. **Custom Image Picker hook:** Passes `image` fields to an `onPickImage(currentValue)` callback prop so the host admin can open its own media library modal.
