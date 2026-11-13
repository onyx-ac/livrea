# `@livrea/docs`

The official documentation site for Livrea, built with [Docusaurus 3](https://docusaurus.io/).

It covers the core architecture, class-based theme engine, sandboxing runtime, CLI packaging (`livrea pack`), and visual editor components (`@livrea/ui`).

## Local Development

From the workspace root:

```bash
npm run docs          # Starts the local development server at http://localhost:3000/livrea/
npm run docs:build    # Creates an optimized production build in packages/docs/build
```

Or within the `packages/docs` directory:

```bash
npm run start         # Local dev server
npm run build         # Production build
npm run serve         # Locally serve the production build
npm run clear         # Clears Docusaurus caches
```

## Planned Adoption: Pterodocs Sync to WordPress

The documentation source of truth remains version-controlled Markdown/MDX within this repository. 

A planned integration with [**Pterodocs**](https://github.com/onyx-ac/pterodocs) (`@pterodocs/core` and `@pterodocs/wordpress`) will automate publishing the documentation tree directly to the **Onyx AC** WordPress website:

> [!NOTE]
> **Planned Pterodocs Integration**:
> - **Git-Driven Authoring**: Docs continue to be written and reviewed in `packages/docs/docs` as Markdown and MDX.
> - **Native Gutenberg Pages**: Pterodocs syncs the sidebar and category hierarchy into WordPress parent/child pages via the WordPress REST API.
> - **Asset Management**: Images and static media are deduplicated and synchronized using content hashes.
> - **Unified Web Presence**: Keeps the live documentation seamlessly integrated into `onyx.ac` without maintaining a disjointed subdomain or manually copying content.

