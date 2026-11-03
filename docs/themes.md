# Writing Themes

Themes in Livrea are written as classes that extend the base page classes provided by the host application. An empty subclass renders the app's page as it is; a theme overrides only the regions and behaviours it wants to change.

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

## The Store

The store is the app's state, read-only: `this.store`, and `s` in selectors.
- Objects are live views (cursors) and arrays are frozen.
- Reading `s.site.name` tracks only that path, not all of `s.site`.
- A change in the app's state re-runs only the selectors, slots, and listeners that read the changed path.
- Selectors compare their output with `structuralEqual` by default (customisable via `{ equals }`), stopping downstream updates when a derived array or object has the same contents.

## Events

Events come from a catalog the app declares, typed by module augmentation:
- Each event specifies who raises it (`app`, `component`, or `theme`), whether it bubbles (`slot → component → page → layout`), and whether it can be cancelled (`cancellable`).
- Payload properties are placed directly on the event object (`e.category.id`) as well as `e.payload`.
- Calling `e.preventDefault()` on a cancellable event stops the class's `static defaults` handler from running, and answers the app's `before:` events with `prevented: true`.
- Calling `e.stopPropagation()` stops a bubbling event from reaching parent units (such as the page or layout).
- Every component and page also receives `mount` and `leave` lifecycle events. Returning a function from an `on('mount', …)` (or any event/value listener) registers a cleanup function that runs before the next invocation and when the component leaves.

## Inheriting Members

`state`, `data`, and `listeners` merge along the class chain at run time, and `styles` concatenate. TypeScript checks a subclass's members against its parent's, so a class meant to be extended declares them with the open types (`State<T>` and `Listeners`), which let subclasses add their own:

```ts
import { Component, on, type Listeners, type State } from 'livrea';

class Parent extends Component {
  state: State<{ a: number }> = { a: 1 };
  listeners: Listeners = { first: on('mount', () => {}) };
}

class Child extends Parent {
  state: Parent['state'] & { b?: number } = { b: 2 };
  listeners = { second: on('mount', () => {}) };
}
```

