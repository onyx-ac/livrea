# Integrating Livrea into an App

An application integrates Livrea by defining the contract and security boundary between its own trusted code and untrusted theme code.

## What an App Provides

An app provides four things:

1. **Its types**, by augmenting `ThemeStore` (what selectors read) and `EventCatalog` (its events and their payloads):

   ```ts
   declare module 'livrea' {
     interface ThemeStore {
       site: { name: string };
     }
     interface EventCatalog {
       'rail:press': { category: { id: string; name: string } };
     }
   }
   ```

2. **Base classes** for its pages, with named slots and `static defaults`. These are the app's own default views turned into classes, so nothing of the existing app is thrown away and an empty subclass renders the default view as it is:

   ```tsx
   /** @jsxImportSource livrea */
   import { Component, hostComponent, slot, type Child, type Defaults } from 'livrea';

   export const Button = hostComponent<{ label: string; onPress: () => void }>('Button');

   export class HomePage extends Component {
     Header = slot(() => <h1>{this.store.site.name}</h1>);

     RailButton = slot(({ category }: { category: Category }) => (
       <Button label={category.name} onPress={() => this.raise('rail:press', { category })} />
     ));

     Rail = slot(({ children }: { children?: (categories: readonly Category[]) => Child }) => {
       const categories = this.store.categories;
       return <nav>{children ? children(categories) : categories.map((c) => <this.RailButton key={c.id} category={c} />)}</nav>;
     });

     static defaults: Defaults<HomePage> = {
       'rail:press': (page, event) => page.action('navigate', { category: event.category.id })
     };

     render() {
       return (
         <main>
           <this.Header />
           <this.Rail />
         </main>
       );
     }
   }
   ```

3. **App components (`hostComponent`)**: `hostComponent<Props>('Avatar')` declares an opaque component that only the host app can run (interactive buttons, media players, hardware controls, 3D avatars, QR generators). Themes place it in JSX and pass options; functions in its props are serialised as `{ $fn: id }` references that the host invokes via callback messages.

4. **The two ends of the channel**:
   - **In the sandbox** (`livrea/runtime`): `createRuntime({ pages, layout, events, state, helpers, post })` runs the theme. It receives `state`, `page`, `event`, and `invoke` messages, and posts `tree`, `answer`, `action`, `track`, and `error` messages (`src/protocol.ts`).
   - **In the app** (`livrea/host`): `new ThemeClient({ connect, policy, events, onAction, onTrack, answerTimeoutMs, maxRedirects })` is the app's end:
     - It checks everything the runtime sends (`sanitizeOps`, `sanitizeCss`). Only the elements (`SAFE_TAGS`), attributes, image addresses, CSS rules, and app components the `HostPolicy` allows reach the `HostTree` it maintains, unit by unit.
     - It sends the app's state, pages, and events, and waits briefly (`answerTimeoutMs`, 100 ms by default) for answers to cancellable events so a slow or broken theme can never stall the host app.
     - It hands the theme's actions to `onAction`, which validates their untrusted arguments before acting.
     - `connect` is the transport link: a direct call to `createRuntime` in the same thread (`connectInThread`), or a Web Worker's message channel.

---

## React Integration (`livrea/react`)

In React, `createThemeApp(config)` wires up the runtime, client, policy, store synchronisation, and event dispatching, returning a `ThemeProvider` and a `useTheme` hook.

One rule holds throughout: **`useApp()` is the only hook to write**, and everything else (`store`, `changes`, `actions`) is a plain function of what it returns.

```tsx
import { createThemeApp, read, ThemePage } from 'livrea/react';

export const { ThemeProvider, useTheme } = createThemeApp({
  theme: { pages: { home: HomePage } },
  events,                                     // the catalog: how each event behaves
  components: {                               // the app components, by name
    Button: ({ label, onPress }) => (
      <button type="button" onClick={read.callback(onPress)}>
        {read.text(label)}
      </button>
    )
  },
  allowUrl: (address) => address.startsWith('/'),

  // What the theme needs from the app, read with the app's hooks.
  useApp: () => ({ language: useLanguage(), navigate: useNavigate() }),

  // The store themes read. Plain data: the engine works out what changed.
  store: (app) => ({ session: { language: app.language } }),

  // Which changes of the app are events: return a payload to send one.
  changes: {
    language: (app, before) => (app.language !== before.language ? { language: app.language } : undefined)
  },

  // What themes may ask for; their arguments aren't trusted.
  actions: {
    async navigate(app, [target], theme) {
      const to = checkTarget(target);
      if (!(await theme.emit('before:navigate', { to }))) app.navigate(to);
    }
  }
});

// In your router or screen view:
<ThemeProvider>
  <ThemePage page="home" fallback={<OldHomeView />} />
</ThemeProvider>
```

### Key Runtime Behaviours

- **Unit-granular rendering (`remote-dom` pattern)**: Rendering is split into independent units—the layout, the page outlet, and each slot and component instance. Each unit runs in its own reactive effect in the runtime and subscribes independently via `useSyncExternalStore` on the host (`ThemeUnit`), so a change re-renders and transmits only the affected unit.
- **Three-tier fault isolation**:
  1. **Slot failure:** If an overridden slot throws, the runtime automatically falls back to its `.Base` slot and reports the error.
  2. **Page failure:** If a page fails to load or render, `ThemePage` renders its `fallback` prop instead, and recovers automatically when navigating to a working page.
  3. **Unresponsive runtime:** Cancellable events time out after `answerTimeoutMs` (100 ms by default), so a hung theme can never freeze the host application.
- **Checking untrusted props (`read`)**: App components receive the theme's props as plain data, with `{ $fn: id }` function references turned into safe callbacks (which strip DOM events or non-plain objects before invoking the theme). Use `read.text()`, `read.optionalText()`, `read.flag()`, `read.number()`, `read.oneOf()`, and `read.callback()` to validate each prop with a fallback.
- **Imperative events**: Events that aren't a change of state (e.g. a guest's first touch or idle timeout) go through `useTheme().emit(name, payload)`.
- **Lower-level control**: Apps that construct and manage their own `ThemeClient` instance directly can render it with `<ThemeClientProvider client={client} components={components}>`.

---

## Security, Privacy & Capability Model

1. **Themes can narrow behaviour, never widen it:**
   Every action requested by a theme (`this.action('navigate', target)`) goes through the host's `actions` handlers. The host validates targets against user permissions, device roles, and allow-lists last. A theme can redirect a closed facility's button to an opening-hours page, but it can never navigate to a restricted route or bypass idle/session rules owned by the app.
2. **Redirect loop protection:**
   A listener on a cancellable event (such as `before:navigate`) may redirect once by calling `e.preventDefault()` and triggering an action (`this.action('navigate', …)`). Any further redirect in the same chain exceeds `maxRedirects` (1 by default) and is dropped.
3. **Privacy by opaque host components:**
   Events and store slices should carry states and IDs, never sensitive personal data, payment credentials, or raw user transcripts. When sensitive content must appear on screen (e.g. live voice captions or a checkout input), the app exposes an opaque `hostComponent` (`<Caption />`, `<PaymentTerminal />`): the theme controls where it sits in the layout without ever seeing the sensitive data inside it.
4. **Same code in-thread or in-sandbox:**
   When themes are written by third parties, the runtime runs inside a Web Worker with a Hardened JavaScript (SES) compartment with no network, storage, or DOM globals. When themes are written strictly in-house, `connectInThread` runs the exact same classes in the main thread with zero code changes.

---

## Headless Testing in Node

Because `livrea` and `livrea/runtime` never touch a DOM, themes and base pages can be tested in Node in milliseconds without spinning up a browser:

```ts
import { HostTree, SAFE_TAGS, sanitizeOps } from 'livrea/host';
import { createRuntime } from 'livrea/runtime';

const tree = new HostTree();
const runtime = createRuntime({
  pages: { home: MyHomeTheme },
  events: EVENTS,
  state: initialState,
  post: (msg) => {
    if (msg.kind === 'tree') tree.apply(sanitizeOps(msg.ops, policy, console.error));
  }
});

runtime.receive({ kind: 'page', name: 'home' });
runtime.receive({ kind: 'event', name: 'session:start', payload: {} });
```

Tests can send `page`, `state`, `event`, and `invoke` messages and assert directly on the resulting `HostTree` and emitted `action` messages (see [`test/harness.ts`](../test/harness.ts)).

---

## Theme Package Structure (`.livrea`)

In production ecosystems, a theme is organised as a self-contained folder and compiled by `@livrea/cli pack` into a single verifiable `<id>-<version>.livrea` archive:

```text
my-theme/
├── theme.json            id, name, version, engine version, optional parent theme, custom pages
├── settings.ts           typed schema for no-code appearance settings (colours, fonts, toggles)
├── layout.tsx            optional Layout subclass wrapping all pages
├── pages/                one class per page; any omitted page uses the app's base class as-is
│   ├── Home.tsx          extends HomePage
│   └── Calendar.tsx      extends Component (a custom page added by the theme)
├── components/           reusable Component classes with their own slots and listeners
├── shared/               reusable selector functions and helpers
├── assets/               fonts, images, theme.css
└── locales/              translation JSON files
```

When packed into a `.livrea` bundle, the archive contains `source/`, pre-compiled `build/` modules with scoped CSS, and a `manifest.json` with SHA-256 file hashes and verified catalog event names—so your server can validate and store theme versions as plain data without ever compiling TSX in production.
