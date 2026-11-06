# `@livrea/playground`

Interactive browser playground for [`livrea`](../livrea) and [`@livrea/ui`](../ui).

It runs a complete website sample theme (**Meridian Studio** — editorial articles, featured services, and contact form) inside `<ThemeBuilder />`, letting you:
- Exercise reactive **list processing** with `ArticleFeed` (filtering articles by category, featured status, reading time, and item limit) and `ServicesGrid` (filtering by service tier and column layout).
- Interact with host components like `ContactForm` (`contact-block`) and `ActionButton` across multiple pages (`home`, `articles`, `contact`).
- Rearrange **Blocks** inside **Slots** (`homeStage`, `articlesStage`, `contactStage`) and nested container slots (`Left`, `Right`, `Header`, `Body`, `Footer`).
- Unpack starter **Patterns** (`EditorialSplitPattern`, `AgencyLandingPattern`, `MagazineIndexPattern`, `SplitContactPattern`) and customize their nested blocks at any depth.
- **Edit on the preview**: click, drag between slots, add to empty slots and remove blocks directly on the canvas, or switch it to **Preview** to use the page. Undo and redo cover all of it.
- See **what data the theme reads** in the Inspector's Data section. Articles and services are its samples (`DEMO_DATA` in `src/theme.tsx`), passed through `withSampleData`: nothing is fetched.
- **Upload a starting theme** (`.livrea` package, `.zip` theme archive, or `settings.json` schema) to test customizability schemas and presets.
- **Download Theme (.zip)** to export a complete, ready-to-pack theme folder (`theme.json`, `settings.json`, `preset-settings.json`, `src/index.tsx`, `src/settings.ts`).

## Astryx UI Integration & Planned Component Ejection

The playground and builder currently leverage `@astryxdesign/core` and `@astryxdesign/theme-neutral` for their controls, shell layout, and interactive dialogs.

> [!NOTE]
> **Planned Ejection**: An ejection of the required Astryx components directly into the codebase (integrating the source primitives directly into `@livrea/ui` and `@livrea/playground`) is planned once the overall UX is approved, removing the external library dependency while preserving the accessible design system.

## Running Locally

From the workspace root:

```bash
npm run playground         # starts the interactive playground at http://localhost:3001
npm run playground:build   # builds the static playground into packages/playground/dist and packages/docs/static/demo
# or via the `demo` alias:
npm run demo
```
