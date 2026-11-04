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
4. **Zero dependencies:** One lightweight package (`livrea`, `livrea/runtime`, `livrea/host`, `livrea/worker`, `livrea/react`), with React as an optional peer dependency.

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

### Running themes in a worker

Themes from other authors run in a dedicated Worker: no DOM, nothing of your app's to call, and a frozen theme can't freeze your app. Two small files:

```ts
// theme.worker.ts: loads the theme after blocking what you don't want themes to have
import { serveRuntime } from 'livrea/worker';

serveRuntime({
  theme: async () => (await import('./themes/lacquer')).LACQUER,
  block: { storage: true }   // network, storage, workers: nothing is blocked by default
});
```

```ts
// in createThemeApp's config
connect: connectWorker(() => new Worker(new URL('./theme.worker.ts', import.meta.url), { type: 'module' })),
```

- **Early start:** `connectWorker` starts the worker when your module loads, so the theme loads while your app renders.
- **Startup:** `<ThemeRoot pending={<Splash />}>` shows `pending` until the first tree. A theme that doesn't start within `startTimeoutMs` (5 s) shows the fallbacks.
- **Watchdog and restarts:** a worker that doesn't answer for 3 s, or crashes while starting, is restarted with the state and page as they are then. The old screen stays until the new tree replaces it. The layout comes back with the same unit ids, so your components in it (an avatar) keep their state. Taps meanwhile, and callbacks from the old run, do nothing. After `restarts.max` (3 a minute), the theme has failed and the fallbacks show.
- **Only what changed crosses:** the provider diffs the store and sends patches, so the theme keeps everything else as it was and nothing that reads it renders again.
- **Your CSP** decides where `import()` may load from: it can't be blocked from inside the worker.

---

## Documentation

The documentation site is in [`packages/docs`](https://github.com/onyx-ac/livrea/tree/main/packages/docs/docs): writing themes, settings, packaging with [`@livrea/cli`](https://github.com/onyx-ac/livrea/tree/main/packages/cli), integrating an app, and running themes in a sandbox.

---

## Package Entry Points

Livrea ships as a single zero-dependency package with tree-shakeable subpath exports:

| Entry point | Purpose |
|---|---|
| `livrea` | Authoring themes and base page classes (`Component`, `Layout`, `Outlet`, `slot`, `select`, `on`, `hostComponent`, `css`), and settings (`defineSettings`, `field`). |
| `livrea/jsx-runtime` | Lightweight JSX factory (`/** @jsxImportSource livrea */`) that builds plain serialisable nodes without touching a DOM. |
| `livrea/runtime` | Runs theme classes inside the sandbox (`createRuntime`, `Store`) and communicates via structured-clonable messages. |
| `livrea/host` | Host-side client (`ThemeClient`, `HostTree`, `sanitizeOps`, `sanitizeCss`) that validates every update against your `HostPolicy`, and `connectWorker`. |
| `livrea/worker` | The theme's side of the worker sandbox (`serveRuntime`, `block`, `importTheme` for packed themes). |
| `livrea/react` | React bindings (`createThemeApp`, `ThemePage`, `ThemeRoot`, `ThemeClientProvider`, `read`). |

---

## Licence

Licensed under [Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)](LICENSE).
