# Livrea

**Class-based theming engine and visual builder to customize and extend React applications.**

*Livrea* is Italian for *livery*: the colours and marks a company puts on its whole fleet. Livrea does that for software: it dresses the same application in each customer's look, and lets each one reshape its layout and behaviour, while your core product stays a single codebase.

Themes are TypeScript classes that extend an app's base pages: an empty subclass *is* the app's page, and a theme overrides only the slots, behaviour and settings it changes. They run in a sandbox, and the app checks everything they send back.

## Packages

| Package | |
|---|---|
| [`livrea`](packages/livrea) | The engine: authoring themes, the runtime, the app's side, the worker sandbox, React bindings |
| [`@livrea/cli`](packages/cli) | `livrea pack`: a theme's folder into the package an app's admin installs |
| [`@livrea/ui`](packages/ui) | Low-footprint visual theme builder (`<ThemeBuilder />`, `<ThemeCanvas />`, `<BlockTree />`, `<PatternPicker />`, `<SettingsForm />`) |
| [`@livrea/playground`](packages/playground) | Private interactive playground & downloadable starter theme (`npm run playground` or `/livrea/demo/` on the docs site) |
| [`@livrea/docs`](packages/docs) | The documentation site (Docusaurus) |

## Documentation & Live Playground

- Start with the [introduction](packages/docs/docs/intro.md) and [Blocks, Patterns & Visual Builder](packages/docs/docs/blocks-and-patterns.md).
- Run the interactive visual builder playground locally with `npm run playground` (or open `/livrea/demo/` inside `npm run docs`) to edit blocks, unpack patterns, and download a ready-to-pack `.zip` theme folder.

## Development

```bash
npm install          # the whole workspace; .npmrc sets legacy-peer-deps, for an npm 10 bug with Vitest 4
npm run build        # livrea, @livrea/cli, @livrea/ui, and @livrea/playground
npm test
npm run typecheck
npm run playground   # the interactive @livrea/ui playground, at http://localhost:3001
npm run docs         # the documentation site + /livrea/demo/, at http://localhost:3000/livrea/
npm run docs:build
```

## Releases

`livrea` and `@livrea/cli` are published separately, at the same version. Creating the `@livrea` organisation on npm before the first public release reserves the scope for `@livrea/cli` and future tooling.

## Licence

Licensed under [Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)](LICENSE).
