# Writing Themes

Themes in Livrea are written as classes in TSX that extend the base page classes provided by the host application. An empty subclass renders the app's page as it is; a theme overrides only the regions and behaviours it wants to change.

```tsx
/** @jsxImportSource livrea */
import { css, on, select, slot } from 'livrea';
import { HomePage, Tabs } from 'your-app/theme-base';
import { onNow } from '../shared/selectors';

export default class Home extends HomePage {
  // The page's own state (useState)
  state = { course: 'all' };

  // Values derived from the store or other selectors (useSelector, useMemo)
  data = {
    menu: select((s) => onNow(s, 'daily-menu')),
    courses: select(() => [...new Set(this.data.menu.map((d) => d.course))]),
    shown: select(() =>
      this.state.course === 'all' ? this.data.menu : this.data.menu.filter((d) => d.course === this.state.course)
    )
  };

  // Reactions to values changing or catalog events (useEffect, Ext JS style)
  listeners = {
    courseGone: on(
      () => this.data.courses,
      (courses) => {
        if (this.state.course !== 'all' && !courses.includes(this.state.course)) this.set({ course: 'all' });
      }
    ),
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

  // Or define a new slot specific to this theme
  Menu = slot(() =>
    this.data.menu.length === 0 ? null : (
      <section className="menu">
        <Tabs value={this.state.course} options={['all', ...this.data.courses]} onChange={(course) => this.set({ course })} />
        {this.data.shown.map((d) => (
          <p key={d.id}>{d.title}</p>
        ))}
      </section>
    )
  );

  styles = css`
    .menu { display: grid; gap: 8px; }
  `;
}
```

---

## From React Hooks to Class Members

| React counterpart | Livrea Page / Component class |
|---|---|
| A component | A class extending `Component` (or a page base class), with its own slots, state, data, and listeners |
| Sub-components / regions | **Slots:** `Header = slot((props) => …)`, rendered as `<this.Header />` |
| The component's body | `render()` — arranges the slots and app components. Optional when extending a base page. |
| `useState` | `state = { … }` and `this.set({ … })` |
| `useSelector(fn, equalityFn)` | `data.x = select(fn, { equals })` |
| `useMemo(fn, deps)` | `data.x = select(fn, { deps })`, or a selector chaining over `this.data.*` and `this.state.*` |
| `useEffect(fn, deps)` | `listeners.x = on(() => value, fn)`, returning an optional cleanup function |
| `useEffect(fn, [])` | `listeners.x = on('mount', fn)` (and `on('leave', fn)`) |
| `useDispatch` | `this.action()`, `this.raise()`, `this.emit()`, `this.track()` |
| A custom hook | A plain selector function in `shared/`, imported where needed |

---

## Slots

- **Overriding a slot:** Assigning `Header = slot(…)` in a subclass replaces the parent class's `Header` wherever `<this.Header />` is rendered—even inside the base class's untouched `render()` method.
- **Wrapping the original (`.Base`):** Every overridden slot keeps the version it replaced on `.Base`. Rendering `<this.Header.Base />` inside your override wraps the original UI rather than replacing it from scratch.
- **Customising a single instance (function children):** A slot can pass its data to a `children` render function so a caller can customise one occurrence without overriding the slot globally:
  ```tsx
  <this.Rail>{(categories) => categories.map((c) => <this.RailButton key={c.id} category={c} />)}</this.Rail>
  ```
  - It is fully typed.
  - It knows which instance it belongs to, even when a slot appears many times in a list.
  - Only that slot unit re-renders when its data changes.
- **Automatic fault fallback:** If an overridden slot throws while rendering, the runtime reports the error and automatically renders `.Base` in its place. One broken region never takes down the page.

---

## The Store and `select()`

The store is the app's state, read-only (`this.store`, and `s` in selectors). Templates never fetch data directly; synced content, session state, settings, and feed status live in the store.

- **Path-level tracking (faster than React-Redux):** While a selector runs, the store records the exact property paths it touches through lightweight Proxy cursors. Reading `s.site.name` subscribes only to `site.name`, not to all of `site`. Whereas React-Redux runs every selector on every store update and compares results afterwards, Livrea only re-runs selectors whose read paths actually changed.
- **Structural equality by default:** A selector counts as changed only when its result differs (`structuralEqual` by default, or customisable via `{ equals }`). When a re-computation produces an equal array or object, the previous reference is kept and nothing downstream re-runs or re-renders.
- **Explicit dependencies (`deps`):** `select(fn, { deps: (s) => [s.items('spa')] })` tracks only the `deps` function and runs `fn` untracked whenever `deps` changes, just like `useMemo`'s dependency array.
- **Chaining & laziness:** A selector that reads `this.data.menu` or `this.state.course` automatically tracks them. Selectors compute lazily when first read and are disposed when their page or component leaves the screen.
- **Reusable selectors:** Shared selectors are ordinary functions (`export const onNow = (s: ThemeStore, type: string) => …`) imported across pages—the direct counterpart to custom React hooks.

---

## Listeners, Events, and Defaults

### `on()` — Values vs. Moments

```ts
on(() => this.data.courses, (courses, previous) => { … }) // a value: runs when it changes
on('session:start', (e) => { … })                         // an event: runs when it happens
```

- **Rule of thumb:** *A value is read with `select` and watched with `on(() => value)`. A moment is an event (`on('event', …)`).* Some concepts are naturally both: the current language in the store (`s.session.language`) and the `language` transition event.
- **Runs after render:** Render effects always flush before user effects, so value listeners run after the screen has already updated and receive `(nextValue, previousValue)`.
- **Mount & cleanup:** Value listeners do not run on initial mount unless `{ immediate: true }` is passed. Any listener (value or event, including `on('mount', …)`) may return a cleanup function, which runs before the next invocation and when the component leaves the screen.
- **Declarative descriptions:** `on()`, `select()`, and `slot()` return inert descriptions. Because subclass field initializers run after `super()`, the runtime reads and activates them once the instance is constructed—just like Ext JS reads its `listeners` config.

### Event Families

Events come from a typed `EventCatalog` augmented by the host app:

| Family | Examples | Raised by | Default behaviour | Cancelling |
|---|---|---|---|---|
| **App events** | `session:start`, `before:navigate`, `language` | The host app (`theme.emit()`) | In the host app | `before:*` events; the app waits up to 100 ms for the answer |
| **Component events** | `rail:press`, `item:open` | A base-class slot or component (`this.raise()`) | In the class's `static defaults` | `e.preventDefault()`, synchronously inside the runtime |
| **Theme events** | `promo:seen` | A theme component (`this.emit()`) | None (internal to theme) | `e.preventDefault()` / `e.stopPropagation()` |

### Bubbling and `static defaults`

Events travel up the rendered unit hierarchy: **slot → component → page → layout**.
- App events start at the active page; component and theme events start at the slot or component instance that raised them.
- `e.stopPropagation()` stops an event from bubbling further up (for example, preventing a page event from triggering a listener on the layout).
- Base classes define their out-of-the-box behaviour for component events in `static defaults`:

  ```tsx
  export class HomePage extends Component {
    RailButton = slot(({ category }: { category: Category }) => (
      <Button label={category.name} onPress={() => this.raise('rail:press', { category })} />
    ));

    static defaults: Defaults<HomePage> = {
      'rail:press': (page, e) => page.action('navigate', { category: e.category.id })
    };
  }
  ```

A theme can customise built-in behaviour in two ways:
1. **Per decision:** Add a listener in `listeners` and call `e.preventDefault()` when a condition is met.
2. **Across the whole page:** Declare `static defaults` on the subclass—the most derived class's default wins.

---

## Inheriting Members Across Class Hierarchies

Inheritance can span three levels: **App Base Class → Parent Theme → Child Theme**.

At run time, the `Component` constructor proxy automatically:
- Links overridden slots to their parent definition (`.Base`).
- Shallow-merges `state`, `data`, and `listeners` along the prototype chain.
- Concatenates `styles` strings along the class hierarchy.

Because TypeScript checks a subclass's property types against its parent's, any base or parent class meant to be extended declares `state` and `listeners` with the open helper types (`State<T>` and `Listeners`):

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
