---
slug: /
title: Introduction
sidebar_position: 1
---

# Livrea

**Bespoke customer UIs and workflows for React, kiosk, and screen apps—without forking your codebase.**

*Livrea* is Italian for *livery*: the colours and marks a company puts on its whole fleet. Livrea does that for software: it dresses the same application in each customer's look, and lets each one reshape its layout and behaviour, while your core product stays a single codebase.

---

## Why Livrea?

Every B2B, kiosk, hospitality, or fleet application eventually hits the customisation wall:
- **CSS variables and config flags aren't enough** when a customer wants to reorder a screen, combine two steps, or route a category button to a custom calendar view.
- **Static templates (Liquid, Mustache, JSON schemas) trap behaviour in the app**—they can arrange markup, but every new interaction requires a new hook from your core team, and customising a page means copying the whole template and losing upstream updates.
- **Forking per customer doesn't scale**—every new feature or security fix becomes an $N$-way merge across customer branches.
- **Traditional plugin APIs are fragile and unsafe**, exposing internal React trees or allowing broken third-party code to white-screen a production terminal.

**Livrea takes a different approach: object-oriented page inheritance across a zero-trust sandbox boundary.**

| Capability | Static Templates (Liquid / JSON) | Livrea Page Classes |
|---|---|---|
| **Layout** | Full markup replacement | Overridable **slots** (`<this.Header />`) or full `render()` |
| **Default look & updates** | Copy and edit the whole template | **Inherited:** an empty subclass *is* the app's page; override only what changes |
| **Behaviour** | Fixed in the app (`data-action` only) | In the theme: `listeners`, typed events, and replaceable `static defaults` |
| **Authoring experience** | Syntax checks only | Full TypeScript autocomplete for slots, store paths, event payloads, and props |
| **Safety** | No code execution | Sandboxed execution (`remote-dom` pattern) with automatic slot & page fallbacks |

### Key Pillars

1. **Three-level inheritance:** *App Base Classes → Parent Theme → Child Theme.* Your app ships base classes for its pages (`HomePage`, `MenuPage`, `CheckoutPage`). A parent theme defines a brand or layout family; a customer's child theme overrides only a couple of slots or files and automatically inherits updates to the rest.
2. **Fine-grained reactivity by default:** Theme data comes from a read-only store via path-tracked selectors (`select()`), and behaviour from Ext JS-style listeners (`on()`) and a typed event catalog. Only the exact unit (layout, page, slot, or component) that read a changed path re-renders and crosses the wire.
3. **Built for untrusted code—or fast first-party themes:** Themes never touch the DOM or your app's internals. They emit a serialisable tree of elements and opaque host component placeholders (`remote-dom` style). Run them in a dedicated Worker (`connectWorker` + `serveRuntime`) for third-party authors, or in the main thread (`connectInThread`) for first-party themes with zero code changes.
4. **Zero dependencies:** One lightweight package (`livrea`, `livrea/runtime`, `livrea/host`, `livrea/worker`, `livrea/react`), with React as an optional peer dependency. Themes are packed with [`@livrea/cli`](./packaging.md).

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

Themes from other authors run in a dedicated Worker: see [Running themes in a sandbox](./sandbox.md).


## Where to Next

- **[Interactive Visual Builder Playground](pathname:///livrea/demo/index.html)**: try `@livrea/ui` live in your browser, unpack patterns, edit blocks, and download a ready-to-pack `.zip` theme folder ([source in `packages/playground`](https://github.com/onyx-ac/livrea/tree/develop/packages/playground)).
- [Writing themes](./writing-themes.md): page classes, slots, `select()`, `on()`, events and defaults.
- [Settings](./settings.md): what the people running the app may change without code.
- [Blocks, Patterns & Visual Builder](./blocks-and-patterns.md): combining TSX blocks with Gutenberg-style visual assembly at any depth.
- [Packaging](./packaging.md): `livrea pack`, from a theme's folder to the package an app installs.
- [Integrating an app](./apps.md) and [running themes in a sandbox](./sandbox.md).
