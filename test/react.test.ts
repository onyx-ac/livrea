// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { Component, css } from '../src/index.js';
import { ThemeClient } from '../src/host.js';
import { createContext, useContext, useState } from 'react';
import { createThemeApp, hostNames, read, ThemeClientProvider, ThemePage, type HostComponents } from '../src/react.js';
import { on } from '../src/index.js';
import { createRuntime, type ComponentClass } from '../src/runtime.js';
import { HomePage } from './base.js';
import { createKeyed } from './keyed.js';
import { EVENTS, POLICY, STATE } from './harness.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const renders: string[] = [];

/** The app's components: a real button, which reports how often it renders. */
const components: HostComponents = {
  Button: ({ label, onPress }) => {
    renders.push(String(label));
    return createElement('button', { type: 'button', onClick: (event: unknown) => (onPress as (e: unknown) => void)(event) }, String(label));
  },
  Avatar: () => createElement('div', { className: 'avatar' })
};

function mount(pages: Record<string, ComponentClass>, page: ReactNode | ((client: ThemeClient) => ReactNode)) {
  const actions: unknown[][] = [];
  let runtime!: ReturnType<typeof createRuntime>;
  const client = new ThemeClient({
    connect: (deliver) => {
      runtime = createRuntime({ pages, events: EVENTS, state: STATE, post: deliver });
      return { send: (message) => runtime.receive(message) };
    },
    policy: { ...POLICY, hosts: hostNames(components) },
    events: EVENTS!,
    onAction: (name, args) => actions.push([name, ...args])
  });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(createElement(ThemeClientProvider, { client, components }, typeof page === 'function' ? page(client) : page)));
  return { container, root, client, actions, runtime: () => runtime };
}

afterEach(() => {
  renders.length = 0;
  document.body.innerHTML = '';
});

describe('rendering a theme in React', () => {
  it('renders the page with the app’s components, and calls the theme back with plain data only', async () => {
    const app = mount({ home: HomePage }, createElement(ThemePage, { page: 'home' }));
    expect(app.container.innerHTML).toBe(
      '<main><h1>Grand</h1><nav><button type="button">Spa</button><button type="button">Events</button></nav></main>'
    );
    await act(async () => app.container.querySelector('button')!.click());
    // The DOM event stayed on the app's side; the default ran in the theme.
    expect(app.actions).toEqual([['navigate', { category: 'spa' }]]);
  });

  it('re-renders only the units the theme sent again', () => {
    const app = mount({ home: HomePage }, createElement(ThemePage, { page: 'home' }));
    renders.length = 0;
    act(() => app.runtime().receive({ kind: 'state', patches: [{ path: ['site', 'name'], value: 'Grand View' }] }));
    expect(app.container.querySelector('h1')!.textContent).toBe('Grand View');
    expect(renders).toEqual([]);
  });

  it('updates the page for new parameters, and renders a new element for a new key', () => {
    class Topic extends Component {
      render() {
        return createKeyed(String(this.params.id));
      }
    }
    const pageWith = (id: string) => createElement(ThemePage, { page: 'topic', params: { id } });
    const app = mount({ topic: Topic }, pageWith('spa'));
    const first = app.container.querySelector('p');
    act(() => app.root.render(createElement(ThemeClientProvider, { client: app.client, components }, pageWith('dining'))));
    const second = app.container.querySelector('p');
    expect(second!.textContent).toBe('dining');
    expect(second).not.toBe(first);
  });

  it('shows no page once unmounted', () => {
    const app = mount({ home: HomePage }, createElement(ThemePage, { page: 'home' }));
    act(() => app.root.render(createElement(ThemeClientProvider, { client: app.client, components }, null)));
    expect(app.client.tree.unit(app.client.tree.root!)).toEqual([]);
  });

  it('shows the fallback when the page fails, and recovers when switching to a working page', () => {
    class Broken extends Component {
      render(): never {
        throw new Error('broken');
      }
    }
    const fallback = createElement('p', null, 'the old view');
    const app = mount({ broken: Broken, home: HomePage }, createElement(ThemePage, { page: 'broken', fallback }));
    expect(app.container.innerHTML).toBe('<p>the old view</p>');

    act(() => app.root.render(createElement(ThemeClientProvider, { client: app.client, components }, createElement(ThemePage, { page: 'home', fallback }))));
    expect(app.container.querySelector('h1')!.textContent).toBe('Grand');
  });

  it('adds the theme’s styles', () => {
    class Styled extends Component {
      styles = css`.card { color: red; }`;
      render() {
        return null;
      }
    }
    const app = mount({ styled: Styled }, createElement(ThemePage, { page: 'styled' }));
    expect(app.container.querySelector('style')!.textContent).toBe('.card { color: red; }');
  });
});

describe('createThemeApp', () => {
  /** A small app: what the theme needs lives in its own React state. */
  interface AppData {
    name: string;
    guest: boolean;
    navigations: unknown[];
    rename(name: string): void;
    arrive(): void;
  }
  const AppContext = createContext<AppData | null>(null);
  let app!: AppData;

  function AppState({ children }: { children: ReactNode }) {
    const [name, rename] = useState('Grand');
    const [guest, setGuest] = useState(false);
    const [navigations] = useState<unknown[]>([]);
    app = { name, guest, navigations, rename, arrive: () => setGuest(true) };
    return createElement(AppContext.Provider, { value: app }, children);
  }

  class Home extends HomePage {
    listeners = { welcome: on('session:start', () => this.action('navigate', { page: 'welcome' })) };
  }

  const kiosk = createThemeApp({
    theme: { pages: { home: Home } },
    events: EVENTS!,
    components: {
      Button: ({ label, onPress }) => createElement('button', { type: 'button', onClick: read.callback(onPress) }, read.text(label)),
      Avatar: () => null
    },
    useApp: () => useContext(AppContext)!,
    store: (app) => ({ site: { name: app.name }, categories: STATE.categories, menu: STATE.menu }),
    changes: { 'session:start': (app, before) => (app.guest && !before.guest ? {} : undefined) },
    actions: { navigate: (app, [target]) => void app.navigations.push(target) }
  });

  let handle!: ReturnType<typeof kiosk.useTheme>;
  function Probe() {
    handle = kiosk.useTheme();
    return null;
  }

  function render() {
    const container = document.createElement('div');
    document.body.append(container);
    act(() =>
      createRoot(container).render(
        createElement(AppState, null, createElement(kiosk.ThemeProvider, null, createElement(ThemePage, { page: 'home' }), createElement(Probe)))
      )
    );
    return container;
  }

  it('renders the page from the store the app describes, and follows the app', () => {
    const container = render();
    expect(container.querySelector('h1')!.textContent).toBe('Grand');
    act(() => app.rename('Grand View'));
    expect(container.querySelector('h1')!.textContent).toBe('Grand View');
  });

  it('carries out actions with the app as it is now', async () => {
    const container = render();
    await act(async () => container.querySelector('button')!.click());
    expect(app.navigations).toEqual([{ category: 'spa' }]);
  });

  it('sends the app’s changes as events', async () => {
    render();
    await act(async () => app.arrive());
    expect(app.navigations).toEqual([{ page: 'welcome' }]);
  });

  it('lets the app’s own code send events', async () => {
    render();
    await act(async () => void handle.emit('session:start', {}));
    expect(app.navigations).toEqual([{ page: 'welcome' }]);
  });

  it('closes the theme connection when ThemeProvider unmounts', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    act(() =>
      root.render(
        createElement(AppState, null, createElement(kiosk.ThemeProvider, null, createElement(ThemePage, { page: 'home' }), createElement(Probe)))
      )
    );
    let closed = false;
    const originalClose = handle.client.close.bind(handle.client);
    handle.client.close = () => {
      closed = true;
      originalClose();
    };
    act(() => root.unmount());
    expect(closed).toBe(true);
  });
});
