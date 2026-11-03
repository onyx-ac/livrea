# Livrea

*Livrea* is Italian for livery: the colours and marks a company puts on its whole fleet. Livrea does that for apps: it dresses the same app in each customer's look, and lets each one change its layout and behaviour, without forking the app.

Themes for kiosk and screen apps, written as classes. Each page is a class that extends the app's base class for that page. An empty subclass is the app's page as it is; a theme overrides only the regions it changes. Data comes from tracked selectors, behaviour from listeners and a typed event catalog, and everything runs in a sandbox that can only send the app a tree of elements to display.

**Status:** early (0.1). The API can still change. The licence is to be chosen before the first public release.

```tsx
/** @jsxImportSource livrea */
import { on, select, slot } from 'livrea';
import { HomePage } from 'your-app/theme-base';

export default class Home extends HomePage {
  state = { course: 'all' };

  // useSelector: re-runs only when what it read changes, and counts as changed only when its result differs.
  data = {
    menu: select((s) => s.items('daily-menu').filter((dish) => s.isOnNow(dish)))
  };

  // useEffect, Ext JS style: react to a value, or to an event from the app's catalog.
  listeners = {
    fresh: on('session:start', () => this.set({ course: 'all' })),
    eventsRail: on('rail:press', (e) => {
      if (e.category.id !== 'events') return;
      e.preventDefault(); // the base class's default (open the category) doesn't run
      this.action('navigate', { page: 'calendar' });
    })
  };

  // Override one region; render the one it replaced with <this.Header.Base />.
  Header = slot(() => (
    <header className="hero">
      <this.Header.Base />
      <p>{this.data.menu.length} dishes today</p>
    </header>
  ));
}
```

## Concepts

| Member | What it is | React counterpart |
|---|---|---|
| Slots: `Header = slot((props) => …)` | A named, overridable region, rendered with `<this.Header />`. An override keeps the replaced version as `.Base`, and falls back to it if it throws. A function child (`<this.Rail>{(data) => …}</this.Rail>`) customises one instance. | A component |
| `render()` | Arranges the slots. The base class's is the app's page. | The component's body |
| `state`, `this.set()` | The component's own state | `useState` |
| `data` with `select(fn, { equals, deps })` | Values derived from the store. Reads are tracked path by path; `deps` makes the dependencies explicit. | `useSelector`, `useMemo` |
| `listeners` with `on(trigger, handler)` | Reactions to a value (`on(() => this.data.x, …)`) or an event (`on('mount', …)`). A handler may return a cleanup. | `useEffect` |
| `static defaults` | What the class does for an event when no listener prevents it. The most derived class's default wins. | — |
| `styles` with `css` | CSS for the class | — |
| `this.action()`, `this.raise()`, `this.emit()`, `this.track()` | Ask the app to do something; raise a catalog event; send the theme's own event; count an event | `useDispatch` |

**The store** is the app's state, read-only: `this.store`, and `s` in selectors. Objects are live views and arrays are frozen. A change re-runs only the selectors, slots and listeners that read the changed path.

**Events** come from a catalog the app declares, typed by augmentation. Each event says who raises it, whether it bubbles (slot → component → page → layout) and whether it can be cancelled. The app's `before:` events are answered with whether a listener prevented them.

**Inheriting members.** `state`, `data` and `listeners` merge along the class chain at run time. TypeScript checks a subclass's members against its parent's, so a class meant to be extended declares them with the open types, which let subclasses add their own:

```ts
class Parent extends Component {
  state: State<{ a: number }> = { a: 1 };
  listeners: Listeners = { first: on('mount', () => {}) };
}
class Child extends Parent {
  state: Parent['state'] & { b?: number } = { b: 2 };
  listeners = { second: on('mount', () => {}) };
}
```

## For apps

An app provides four things:

1. **Its types,** by augmenting `ThemeStore` (what selectors read) and `EventCatalog` (its events and their payloads):

   ```ts
   declare module 'livrea' {
     interface ThemeStore { site: { name: string } }
     interface EventCatalog { 'rail:press': { category: { id: string; name: string } } }
   }
   ```

2. **Base classes** for its pages, with named slots and `static defaults`. They're the app's own pages, and themes extend them.
3. **App components:** `hostComponent<Props>('Avatar')` declares something only the app renders. Themes place it; functions in its props come back to the theme as `{ $fn: id }` references the app invokes.
4. **The two ends of the channel:**
   - **In the sandbox:** `createRuntime({ pages, layout, events, state, post })` from `livrea/runtime` runs the theme. It receives `state`, `page`, `event` and `invoke` messages, and posts `tree`, `answer`, `action`, `track` and `error` messages (`protocol.ts`).
   - **In the app:** `new ThemeClient({ connect, policy, events, onAction })` from `livrea/host` is the app's end.
     - It checks everything the runtime sends. Only the elements, attributes, image addresses, CSS and app components the policy allows reach the tree it keeps, unit by unit.
     - It sends the app's state, pages and events, and waits briefly for answers to cancellable events.
     - It hands the theme's actions to `onAction`, which checks them before acting.
     - `connect` is the link: a direct call to `createRuntime` in the same thread, or a worker's messages later.

In React, `createThemeApp(config)` from `livrea/react` does all of that. The app describes its side, and gets a provider and a hook back. One rule throughout: `useApp()` is the only hook to write, and everything else is a plain function of what it returns.

```tsx
export const { ThemeProvider, useTheme } = createThemeApp({
  theme: { pages: { home: HomePage } },
  events,                                     // the catalog: how each event behaves
  components,                                 // the app components, by name
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

<ThemeProvider>
  <ThemePage page="home" fallback={<OldHomeView />} />
</ThemeProvider>
```

- **Rendering:** `ThemePage` shows a page while it's mounted, and `fallback` if the page fails. Each unit re-renders only when the theme sends it again.
- **App components** receive the theme's props as plain data, with function references turned into callbacks; `read.text()`, `read.oneOf()`, `read.callback()` and the like check each value.
- **Events that aren't a change of state** (a guest's first touch) go through `useTheme().emit()`.
- **Redirects:** a listener may redirect a navigation once (`preventDefault`, then an action); a further redirect in the same chain is dropped.
- **Lower level:** `ThemeClientProvider` takes a `ThemeClient` the app makes itself, for full control.

Rendering is split into units: the layout, the page, and each slot and component instance. Each re-renders on its own and sends only its own part of the tree.

## Not there yet

- The sandbox loader: a Worker with a Hardened JavaScript compartment that evaluates compiled theme modules.
- Clock events (`every:15m`, `at:07:00`).
- CSS scoping per class.
- The `pack` tool that checks and compiles a theme into a package.

## Development

```bash
npm install          # .npmrc sets legacy-peer-deps, for an npm 10 bug with Vitest 4
npm test
npm run typecheck
npm run build        # dist/
```
