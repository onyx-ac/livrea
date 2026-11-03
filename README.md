# Livrea

**Bespoke customer UIs and workflows for React, kiosk, and screen apps—without forking your codebase.**

*Livrea* is Italian for *livery*: the colours and marks a company puts on its whole fleet. Livrea does that for software: it dresses the same application in each customer's look, and lets each one reshape its layout and behaviour, while your core product stays a single codebase.

---

## Why Livrea?

Every B2B, kiosk, hospitality, or fleet application eventually hits the customisation wall:
- **CSS variables and config flags aren't enough** when a customer wants to reorder a screen, combine two steps, or route a category button to a custom calendar view.
- **Forking per customer doesn't scale**—every new feature or security fix becomes an $N$-way merge across customer branches.
- **Traditional plugin APIs are fragile and unsafe**, exposing internal React trees or allowing broken third-party code to white-screen a production terminal.

**Livrea takes a different approach: object-oriented page inheritance across a zero-trust sandbox boundary.**

1. **Extend, don't rewrite:** Your app ships base classes for its pages (`HomePage`, `MenuPage`, `CheckoutPage`). An empty subclass *is* your default page. A customer theme overrides only the specific **slots** and **events** it wants to change, and wraps or falls back to your original UI with `<this.Header.Base />`.
2. **Fine-grained reactivity by default:** Theme data comes from a read-only store via path-tracked selectors (`select()`), and behaviour from Ext JS-style listeners (`on()`) and a typed event catalog. Only the exact unit (layout, page, slot, or component) that read a changed path re-renders and crosses the wire.
3. **Built for untrusted code:** Themes never touch the DOM or your app's internals. They emit a serialisable tree of elements and host component placeholders. The host sanitises every tag, attribute, URL, style, and prop, times out stalled event handlers in 100 ms, prevents infinite redirect loops, and automatically falls back to your base slot—or fallback page—if theme code throws.
4. **Zero dependencies:** One lightweight package (`livrea`, `livrea/runtime`, `livrea/host`, `livrea/react`), with React as an optional peer dependency.

---

## A Theme in 30 Lines

```tsx
/** @jsxImportSource livrea */
import { on, select, slot } from 'livrea';
import { HomePage } from 'your-app/theme-base';

export default class Home extends HomePage {
  state = { course: 'all' };

  // Re-runs only when the store paths it read change, and notifies only when the result differs.
  data = {
    menu: select((s) => s.items('daily-menu').filter((dish) => s.isOnNow(dish)))
  };

  // React to a value, or intercept an event from the app's typed catalog.
  listeners = {
    fresh: on('session:start', () => this.set({ course: 'all' })),
    eventsRail: on('rail:press', (e) => {
      if (e.category.id !== 'events') return;
      e.preventDefault(); // skip the base class's default (opening the category)
      this.action('navigate', { page: 'calendar' });
    })
  };

  // Override one region; render the original inside it with <this.Header.Base />.
  Header = slot(() => (
    <header className="hero">
      <this.Header.Base />
      <p>{this.data.menu.length} dishes today</p>
    </header>
  ));
}
```

---

## Connecting Your React App

With `createThemeApp(config)` from `livrea/react`, your app describes what themes may read, which state changes emit catalog events, and which actions themes may request.

One rule keeps integration clean: **`useApp()` is the only hook you write**—everything else is a plain function of what it returns.

```tsx
import { createThemeApp, ThemePage } from 'livrea/react';

export const { ThemeProvider, useTheme } = createThemeApp({
  theme: { pages: { home: HomePage } },
  events,                                     // the catalog: how each event behaves
  components,                                 // app components (Button, Avatar, Video…)
  allowUrl: (address) => address.startsWith('/'),

  // Read what the theme needs from your app with your app's hooks.
  useApp: () => ({ language: useLanguage(), navigate: useNavigate() }),

  // The read-only store themes select from.
  store: (app) => ({ session: { language: app.language } }),

  // Which app transitions raise catalog events.
  changes: {
    language: (app, before) => (app.language !== before.language ? { language: app.language } : undefined)
  },

  // What themes may ask for; arguments are untrusted and checked before acting.
  actions: {
    async navigate(app, [target], theme) {
      const to = checkTarget(target);
      if (!(await theme.emit('before:navigate', { to }))) app.navigate(to);
    }
  }
});

// Render a themed page anywhere in your tree, with automatic fallback:
<ThemeProvider>
  <ThemePage page="home" fallback={<OldHomeView />} />
</ThemeProvider>
```

---

## Documentation

- **[Writing Themes (`docs/themes.md`)](docs/themes.md)** — Slots, `.Base` fallbacks, function children, `select()` path tracking, `on()` listeners, `static defaults`, class inheritance rules, and styling.
- **[App Integration (`docs/apps.md`)](docs/apps.md)** — Type augmentation (`ThemeStore`, `EventCatalog`), base page classes, `hostComponent()`, the runtime/host protocol, `HostPolicy` sanitisation, and React integration.

---

## Package Entry Points

Livrea ships as a single zero-dependency package with tree-shakeable subpath exports:

| Entry point | Purpose |
|---|---|
| `livrea` | Authoring themes and base page classes (`Component`, `Layout`, `Outlet`, `slot`, `select`, `on`, `hostComponent`, `css`). |
| `livrea/jsx-runtime` | Lightweight JSX factory (`/** @jsxImportSource livrea */`) that builds plain serialisable nodes without touching a DOM. |
| `livrea/runtime` | Runs theme classes inside the sandbox (`createRuntime`, `Store`) and communicates via structured-clonable messages. |
| `livrea/host` | Host-side client (`ThemeClient`, `HostTree`, `sanitizeOps`, `sanitizeCss`) that validates every update against your `HostPolicy`. |
| `livrea/react` | React bindings (`createThemeApp`, `ThemePage`, `ThemeClientProvider`, `read`). |

---

## Roadmap & Packaging Strategy

**Current status:** `0.1.0` (early). The core reactive engine, class inheritance model, slot fallback chain, protocol, host sanitiser, and React integration are complete and tested.

### Upcoming Milestones

- **Sandbox loader:** A Web Worker with a Hardened JavaScript (SES) compartment that evaluates compiled theme modules in strict isolation.
- **The `pack` tool (`@livrea/cli`):** Checks, compiles, and bundles a theme into a verifiable package.
- **CSS scoping per class:** Automatic per-class selector scoping so theme styles never bleed across components.
- **Clock events:** Built-in declarative time triggers (`every:15m`, `at:07:00`) for kiosks and digital signage (e.g. switching from breakfast to lunch menus automatically).

### Monorepo & Workspace Strategy

**Do we need a workspace today?** Not yet. Right now, `livrea` is a single package with **zero runtime dependencies**: `livrea`, `livrea/runtime`, `livrea/host`, and `livrea/react` (with React optional). Apps install one package and get nothing they don't use.

A workspace becomes worth it with the first piece that carries external dependencies of its own:
1. **The `pack` tool**, which depends on TypeScript and `esbuild`.
2. **The sandbox loader**, which depends on a JavaScript-hardening library (`ses`).

At that point, the repository will split into `packages/livrea` and `packages/cli`—following the same pattern as Vite or Astro, where the core package remains unscoped (`livrea`) and tooling/helpers live under a scope (`@livrea/cli`). We will make that transition when building the CLI.

### npm Organisation & First Release

- **npm organisation (`@livrea`):** Publishing `livrea` itself does not require an organisation, as unscoped packages are free. However, creating the `@livrea` organisation on npm before the first public release is recommended: it is free for public packages and reserves the `@livrea/*` scope for `@livrea/cli` and future tooling so nobody else can claim it.
- **Publishing:** With the licence set to **CC BY-SA 4.0**, `livrea` is ready for its initial `0.1.0` publication once `"private": true` is removed from `package.json`, locking in the unscoped package name on the npm registry.

---

## Development

```bash
npm install          # .npmrc sets legacy-peer-deps, for an npm 10 bug with Vitest 4
npm test
npm run typecheck
npm run build        # dist/
```

---

## Licence

Licensed under [Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)](LICENSE).
