// @vitest-environment jsdom
import { act, createElement, StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Component, css } from '../src/index.js';
import { ThemeClient, type Connect } from '../src/host.js';
import { createContext, useContext, useState } from 'react';
import { connectInThread, createThemeApp, hostNames, type RuntimeSetup, read, ThemeClientProvider, ThemePage, ThemeRoot, type HostComponents } from '../src/react.js';
import { AvatarFrame, Broken, BrokenFrame, Frame, One, Two } from './frame.js';
import { on } from '../src/index.js';
import { createRuntime, type ComponentClass } from '../src/runtime.js';
import { HomePage } from './base.js';
import { createKeyed } from './keyed.js';
import { EVENTS, POLICY, STATE } from './harness.js';
import type { AppMessage } from '../src/protocol.js';

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

  it('keeps the theme running through StrictMode’s unmount and mount in development', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    await act(async () =>
      createRoot(container).render(
        createElement(StrictMode, null, createElement(AppState, null, createElement(kiosk.ThemeProvider, null, createElement(ThemePage, { page: 'home' }))))
      )
    );
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(container.querySelector('h1')!.textContent).toBe('Grand');
    act(() => app.rename('Grand View'));
    expect(container.querySelector('h1')!.textContent).toBe('Grand View');
  });

  it('closes the theme connection when ThemeProvider unmounts', async () => {
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
    // A tick later: a mount in between (StrictMode) would have kept it.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(closed).toBe(true);
  });
});

describe('createThemeApp across a worker’s boundary', () => {
  it('sends only what changed, so a list the app builds again each render isn’t rendered again', () => {
    let rename!: (name: string) => void;
    function App({ children }: { children: ReactNode }) {
      const [name, setName] = useState('Grand');
      rename = setName;
      return createElement(AppContext.Provider, { value: name }, children);
    }
    const AppContext = createContext('');
    // Messages are copied both ways, as a worker's are: nothing keeps its identity across.
    const copied = (setup: RuntimeSetup): Connect => (deliver, { state }) => {
      const runtime = createRuntime({ pages: setup.theme.pages, events: setup.events, state: structuredClone(state), post: (m) => deliver(structuredClone(m)) });
      return { send: (message: AppMessage) => runtime.receive(structuredClone(message)) };
    };
    const app = createThemeApp({
      theme: { pages: { home: HomePage } },
      events: EVENTS!,
      components,
      useApp: () => useContext(AppContext),
      // A new array of new objects on every render.
      store: (name) => ({ site: { name }, categories: STATE.categories.map((category) => ({ ...category })), menu: STATE.menu }),
      connect: copied
    });
    const container = document.createElement('div');
    document.body.append(container);
    act(() => createRoot(container).render(createElement(App, null, createElement(app.ThemeProvider, null, createElement(ThemePage, { page: 'home' })))));
    expect(renders).toEqual(['Spa', 'Events']);
    renders.length = 0;
    act(() => rename('Grand View'));
    expect(container.querySelector('h1')!.textContent).toBe('Grand View');
    expect(renders).toEqual([]);
  });
});

describe('ThemeRoot', () => {
  function frame(layout: ComponentClass, pages: Record<string, ComponentClass>) {
    const client = new ThemeClient({
      connect: (deliver) => {
        const runtime = createRuntime({ pages, layout, events: EVENTS, state: STATE, post: deliver });
        return { send: (message) => runtime.receive(message) };
      },
      policy: { ...POLICY, hosts: hostNames(components) },
      events: EVENTS!,
      onAction: () => {}
    });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const show = (page: ReactNode) =>
      act(() =>
        root.render(
          createElement(
            ThemeClientProvider,
            { client, components },
            createElement(ThemeRoot, { fallback: (pages: ReactNode) => createElement('section', null, pages) }, page)
          )
        )
      );
    return { container, show };
  }

  it('keeps the layout while pages come and go', () => {
    const app = frame(Frame, { one: One, two: Two });
    app.show(createElement(ThemePage, { key: 'one', page: 'one' }));
    expect(app.container.innerHTML).toBe('<div class="frame"><p>one</p></div>');
    const layout = app.container.firstElementChild;
    app.show(createElement(ThemePage, { key: 'two', page: 'two' }));
    expect(app.container.innerHTML).toBe('<div class="frame"><p>two</p></div>');
    expect(app.container.firstElementChild).toBe(layout);
  });

  it('shows a failing page’s fallback inside the layout', () => {
    const app = frame(Frame, { broken: Broken });
    app.show(createElement(ThemePage, { page: 'broken', fallback: createElement('p', null, 'old page') }));
    expect(app.container.innerHTML).toBe('<div class="frame"><p>old page</p></div>');
  });

  it('shows a page without the layout when there is no ThemeRoot', () => {
    const client = new ThemeClient({
      connect: (deliver) => {
        const runtime = createRuntime({ pages: { one: One }, layout: Frame, events: EVENTS, state: STATE, post: deliver });
        return { send: (message) => runtime.receive(message) };
      },
      policy: { ...POLICY, hosts: hostNames(components) },
      events: EVENTS!,
      onAction: () => {}
    });
    const container = document.createElement('div');
    document.body.append(container);
    act(() => createRoot(container).render(createElement(ThemeClientProvider, { client, components }, createElement(ThemePage, { page: 'one' }))));
    expect(container.innerHTML).toBe('<p>one</p>');
  });

  it('shows its own fallback if the layout fails, and the pages show theirs', () => {
    const app = frame(BrokenFrame, { one: One });
    app.show(createElement(ThemePage, { page: 'one', fallback: createElement('p', null, 'old page') }));
    expect(app.container.innerHTML).toBe('<section><p>old page</p></section>');
  });

  /** The theme in this thread, behind a connection the test controls: it delivers when told to, and can be lost. */
  function controlled(layout: ComponentClass, pages: Record<string, ComponentClass>, options: { held?: boolean; startTimeoutMs?: number } = {}) {
    const link = { lose: (_reason: string) => {}, release: () => {}, connections: 0, holdNext: false };
    const client = new ThemeClient({
      connect: (deliver, setup) => {
        link.connections++;
        link.lose = setup.lost;
        const held: unknown[] = [];
        let holding = link.connections === 1 ? (options.held ?? false) : link.holdNext;
        link.release = () => {
          holding = false;
          held.splice(0).forEach(deliver);
        };
        return connectInThread({ theme: { pages, layout }, events: EVENTS! })((message) => (holding ? held.push(message) : deliver(message)), setup);
      },
      state: STATE,
      startTimeoutMs: options.startTimeoutMs,
      policy: { ...POLICY, hosts: hostNames(components) },
      events: EVENTS!,
      onAction: () => {}
    });
    client.onError(() => {});
    const container = document.createElement('div');
    document.body.append(container);
    const page = createElement(ThemePage, { page: 'one', fallback: createElement('p', null, 'old page') });
    act(() =>
      createRoot(container).render(
        createElement(
          ThemeClientProvider,
          { client, components },
          createElement(ThemeRoot, { fallback: (pages: ReactNode) => createElement('section', null, pages), pending: createElement('p', null, 'splash') }, page)
        )
      )
    );
    return { container, link, client };
  }

  it('shows `pending` until the theme’s first tree, then the theme', () => {
    const app = controlled(Frame, { one: One }, { held: true });
    expect(app.container.innerHTML).toBe('<p>splash</p>');
    act(() => app.link.release());
    expect(app.container.innerHTML).toBe('<div class="frame"><p>one</p></div>');
  });

  it('shows the fallbacks when the theme doesn’t start in time', async () => {
    vi.useFakeTimers();
    try {
      const app = controlled(Frame, { one: One }, { held: true, startTimeoutMs: 50 });
      await act(async () => vi.advanceTimersByTime(50));
      expect(app.container.innerHTML).toBe('<section><p>old page</p></section>');
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the screen, and the app’s components in the layout, through a restart', () => {
    const app = controlled(AvatarFrame, { one: One });
    const avatar = app.container.querySelector('.avatar');
    expect(app.container.innerHTML).toBe('<div class="frame"><div class="avatar"></div><p>one</p></div>');
    // The new run's first tree is held, as a worker's takes a while: meanwhile the old screen stays.
    app.link.holdNext = true;
    act(() => app.link.lose('it stopped answering'));
    expect(app.link.connections).toBe(2);
    expect(app.container.innerHTML).toBe('<div class="frame"><div class="avatar"></div><p>one</p></div>');
    act(() => app.link.release());
    expect(app.container.innerHTML).toBe('<div class="frame"><div class="avatar"></div><p>one</p></div>');
    expect(app.container.querySelector('.avatar')).toBe(avatar);
  });

  it('shows the fallbacks once the theme has been restarted too often', () => {
    const app = controlled(Frame, { one: One });
    for (let i = 0; i < 4; i++) act(() => app.link.lose('it crashed'));
    expect(app.client.hasFailed('runtime')).toBe(true);
    expect(app.container.innerHTML).toBe('<section><p>old page</p></section>');
  });
});
