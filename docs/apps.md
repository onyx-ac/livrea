# Integrating Livrea into an App

An application integrates Livrea by defining the boundary between its own code and untrusted theme code.

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

2. **Base classes** for its pages, with named slots and `static defaults`. They are the app's own pages, and themes extend them:

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

3. **App components**: `hostComponent<Props>('Avatar')` declares something only the app renders (interactive controls, media players, hardware integrations). Themes place it in JSX; functions in its props are serialised as `{ $fn: id }` references that the app invokes via callback messages.

4. **The two ends of the channel**:
   - **In the sandbox** (`livrea/runtime`): `createRuntime({ pages, layout, events, state, helpers, post })` runs the theme. It receives `state`, `page`, `event`, and `invoke` messages, and posts `tree`, `answer`, `action`, `track`, and `error` messages (`src/protocol.ts`).
   - **In the app** (`livrea/host`): `new ThemeClient({ connect, policy, events, onAction, onTrack, answerTimeoutMs, maxRedirects })` is the app's end:
     - It checks everything the runtime sends (`sanitizeOps`, `sanitizeCss`). Only the elements (`SAFE_TAGS`), attributes, image addresses, CSS rules, and app components the `HostPolicy` allows reach the `HostTree` it maintains, unit by unit.
     - It sends the app's state, pages, and events, and waits briefly (`answerTimeoutMs`, 100 ms by default) for answers to cancellable events so a slow or broken theme can never stall the host app.
     - It hands the theme's actions to `onAction`, which validates their untrusted arguments before acting.
     - `connect` is the transport link: a direct call to `createRuntime` in the same thread (`connectInThread`), or a Worker's message channel.

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

### Key Behaviours

- **Unit-granular rendering**: Rendering is split into independent units—the layout, the page outlet, and each slot and component instance. Each unit runs in its own reactive effect in the runtime and subscribes independently via `useSyncExternalStore` on the host (`ThemeUnit`), so a change re-renders and transmits only the affected unit.
- **Fault isolation**:
  - If an overridden slot throws, the runtime automatically falls back to its `.Base` slot and reports the error.
  - If a page fails to load or render, `ThemePage` renders its `fallback` prop instead, and recovers automatically when navigating to a working page.
- **Checking untrusted props (`read`)**: App components receive the theme's props as plain data, with `{ $fn: id }` function references turned into safe callbacks (which strip DOM events or non-plain objects before invoking the theme). Use `read.text()`, `read.optionalText()`, `read.flag()`, `read.number()`, `read.oneOf()`, and `read.callback()` to validate each prop with a fallback.
- **Imperative events**: Events that aren't a change of state (e.g. a guest's first touch or idle timeout) go through `useTheme().emit(name, payload)`.
- **Redirect loop protection**: A listener on a cancellable event (such as `before:navigate`) may redirect once by calling `e.preventDefault()` and triggering an action (`this.action('navigate', …)`). Any further redirect in the same chain exceeds `maxRedirects` (1 by default) and is dropped.
- **Lower-level control**: Apps that construct and manage their own `ThemeClient` instance directly can render it with `<ThemeClientProvider client={client} components={components}>`.

