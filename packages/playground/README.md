# `@livrea/demo`

Interactive browser playground for [`livrea`](../livrea) and [`@livrea/ui`](../ui).

It runs a complete website sample theme (**Meridian Studio** — editorial articles, featured services, and contact form) inside `<ThemeBuilder />`, letting you:
- Exercise reactive **list processing** with `ArticleFeed` (filtering articles by category, featured status, reading time, and item limit) and `ServicesGrid` (filtering by service tier and column layout).
- Interact with host components like `ContactForm` (`contact-block`) and `ActionButton` across multiple pages (`home`, `articles`, `contact`).
- Rearrange **Blocks** inside **Slots** (`homeStage`, `articlesStage`, `contactStage`) and nested container slots (`Left`, `Right`, `Header`, `Body`, `Footer`).
- Unpack starter **Patterns** (`EditorialSplitPattern`, `AgencyLandingPattern`, `MagazineIndexPattern`, `SplitContactPattern`) and customize their nested blocks at any depth.
- **Upload a starting theme** (`.livrea` package, `.zip` theme archive, or `settings.json` schema) to test customizability schemas and presets.
- **Download Theme (.zip)** to export a complete, ready-to-pack theme folder (`theme.json`, `settings.json`, `preset-settings.json`, `src/index.tsx`, `src/settings.ts`).

## Running Locally

From the workspace root:

```bash
npm run demo         # starts the interactive playground at http://localhost:3001
npm run demo:build   # builds the static playground into packages/demo/dist and packages/docs/static/demo
```
