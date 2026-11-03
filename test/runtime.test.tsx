import { describe, expect, it } from 'vitest';
import { Component, css, Layout, on, Outlet, select, slot, type Defaults, type Listeners, type State } from '../src/index.js';
import { Avatar, Button, HomePage } from './base.js';
import { run, STATE } from './harness.js';

describe('pages and slots', () => {
  it('renders the base page as it is', () => {
    const app = run({ pages: { home: HomePage } });
    app.runtime.receive({ kind: 'page', name: 'home' });
    expect(app.view()).toBe('<main><h1>Grand</h1><nav><Button label="Spa" onPress={fn}/><Button label="Events" onPress={fn}/></nav></main>');
    expect(app.errors()).toEqual([]);
  });

  it('lets a theme override one slot and render the one it replaced', () => {
    class Home extends HomePage {
      Header = slot(() => (
        <header className="hero">
          <this.Header.Base />
          <Avatar size="large" />
        </header>
      ));
    }
    const app = run({ pages: { home: Home } });
    app.runtime.receive({ kind: 'page', name: 'home' });
    expect(app.view()).toBe(
      '<main><header class="hero"><h1>Grand</h1><Avatar size="large"/></header><nav><Button label="Spa" onPress={fn}/><Button label="Events" onPress={fn}/></nav></main>'
    );
  });

  it('re-renders only the unit that read what changed', () => {
    class Home extends HomePage {
      Header = slot(() => (
        <header>
          <this.Header.Base />
        </header>
      ));
    }
    const app = run({ pages: { home: Home } });
    app.runtime.receive({ kind: 'page', name: 'home' });
    app.updates();
    app.runtime.receive({ kind: 'state', patches: [{ path: ['site', 'name'], value: 'Grand View' }] });
    const sets = app.updates().filter((op) => op.op === 'set');
    expect(sets).toHaveLength(1);
    expect(sets[0]).toMatchObject({ tree: [{ t: 'e', tag: 'h1', c: ['Grand View'] }] });
    expect(app.view()).toContain('<header><h1>Grand View</h1></header>');
  });

  it("customises one slot instance through its children function", () => {
    class Home extends HomePage {
      render() {
        return (
          <main>
            <this.Rail>{(categories) => categories.map((c) => <p key={c.id}>{c.name}</p>)}</this.Rail>
          </main>
        );
      }
    }
    const app = run({ pages: { home: Home } });
    app.runtime.receive({ kind: 'page', name: 'home' });
    expect(app.view()).toBe('<main><nav><p>Spa</p><p>Events</p></nav></main>');
  });

  it('falls back to the base slot when an override fails, and reports it', () => {
    class Home extends HomePage {
      Header = slot((): never => {
        throw new Error('broken');
      });
    }
    const app = run({ pages: { home: Home } });
    app.runtime.receive({ kind: 'page', name: 'home' });
    expect(app.view()).toContain('<h1>Grand</h1>');
    expect(app.errors()).toEqual(['slot Header: broken']);
  });

  it('keeps the units of keyed items when the list changes', () => {
    const app = run({ pages: { home: HomePage } });
    app.runtime.receive({ kind: 'page', name: 'home' });
    app.updates();
    app.runtime.receive({ kind: 'state', patches: [{ path: ['categories'], value: [...STATE.categories, { id: 'golf', name: 'Golf' }] }] });
    const ops = app.updates();
    // The rail and the new button render; the two buttons that were there already don't.
    expect(ops.filter((op) => op.op === 'set')).toHaveLength(2);
    expect(app.view()).toContain('<Button label="Golf" onPress={fn}/>');
  });
});

describe('events', () => {
  it('are typed by the catalog: unknown names fail to compile, payloads are typed', () => {
    // @ts-expect-error: not in the catalog
    on('rail:pres', () => {});
    const listener = on('rail:press', (e) => {
      const id: string = e.category.id;
      void id;
    });
    expect(listener).toBeDefined();
  });

  it("runs the base class's default when nobody prevents it", () => {
    const app = run({ pages: { home: HomePage } });
    app.runtime.receive({ kind: 'page', name: 'home' });
    app.press('Button', 'Spa');
    expect(app.actions()).toEqual([['navigate', { category: 'spa' }]]);
  });

  it('lets a listener prevent the default and do something else', () => {
    class Home extends HomePage {
      listeners = {
        eventsRail: on('rail:press', (e) => {
          if (e.category.id !== 'events') return;
          e.preventDefault();
          this.action('navigate', { page: 'calendar' });
        })
      };
    }
    const app = run({ pages: { home: Home } });
    app.runtime.receive({ kind: 'page', name: 'home' });
    app.press('Button', 'Events');
    app.press('Button', 'Spa');
    expect(app.actions()).toEqual([
      ['navigate', { page: 'calendar' }],
      ['navigate', { category: 'spa' }]
    ]);
  });

  it("uses the most derived class's defaults", () => {
    class Home extends HomePage {
      static defaults: Defaults<Home> = {
        'rail:press': (page, e) => page.action('open', e.category.id)
      };
    }
    const app = run({ pages: { home: Home } });
    app.runtime.receive({ kind: 'page', name: 'home' });
    app.press('Button', 'Spa');
    expect(app.actions()).toEqual([['open', 'spa']]);
  });

  it('bubbles from the page to the layout, unless stopped', () => {
    class Frame extends Layout {
      listeners = { count: on('rail:press', (e) => this.action('counted', e.category.id)) };
      render() {
        return (
          <div className="frame">
            <Outlet />
          </div>
        );
      }
    }
    class Home extends HomePage {
      listeners = {
        quiet: on('rail:press', (e) => {
          if (e.category.id === 'events') e.stopPropagation();
        })
      };
    }
    const app = run({ pages: { home: Home }, layout: Frame });
    app.runtime.receive({ kind: 'page', name: 'home' });
    expect(app.view()).toMatch(/^<div class="frame"><main>/);
    app.press('Button', 'Spa');
    app.press('Button', 'Events');
    expect(app.actions()).toEqual([
      ['counted', 'spa'],
      ['navigate', { category: 'spa' }],
      ['navigate', { category: 'events' }]
    ]);
  });

  it('answers cancellable app events with whether they were prevented', () => {
    class Home extends HomePage {
      listeners = {
        stay: on('before:navigate', (e) => {
          if (e.to === 'spa') e.preventDefault();
        })
      };
    }
    const app = run({ pages: { home: Home } });
    app.runtime.receive({ kind: 'page', name: 'home' });
    app.runtime.receive({ kind: 'event', id: 1, name: 'before:navigate', payload: { to: 'spa' } });
    app.runtime.receive({ kind: 'event', id: 2, name: 'before:navigate', payload: { to: 'guide' } });
    app.runtime.receive({ kind: 'event', id: 3, name: 'session:start' });
    expect(app.messages.filter((m) => m.kind === 'answer')).toEqual([
      { kind: 'answer', id: 1, prevented: true },
      { kind: 'answer', id: 2, prevented: false }
    ]);
  });

  it("delivers a theme's own events up through its components, never to the app", () => {
    class Promo extends Component<{ id: string }> {
      render() {
        return <Button label="Promo" onPress={() => this.emit('promo:seen', { id: this.props.id })} />;
      }
    }
    class Home extends HomePage {
      listeners = { seen: on('promo:seen', (e) => this.track(`promo ${e.id}`)) };
      render() {
        return <Promo id="spa-week" />;
      }
    }
    const app = run({ pages: { home: Home } });
    app.runtime.receive({ kind: 'page', name: 'home' });
    app.press('Button', 'Promo');
    expect(app.messages.filter((m) => m.kind === 'track')).toEqual([{ kind: 'track', name: 'promo spa-week' }]);
    expect(app.actions()).toEqual([]);
  });
});

describe('state, data and listeners', () => {
  class Menu extends Component {
    state = { course: 'all' };
    data = {
      courses: select((s) => [...new Set(s.menu.map((d) => d.course))]),
      shown: select((s) => (this.state.course === 'all' ? s.menu : s.menu.filter((d) => d.course === this.state.course)))
    };
    listeners = {
      courseGone: on(
        () => this.data.courses,
        (courses) => {
          if (this.state.course !== 'all' && !courses.includes(this.state.course)) this.set({ course: 'all' });
        }
      )
    };
    render() {
      return <section>{this.data.shown.map((d) => <Button key={d.id} label={d.title} onPress={() => this.set({ course: d.course })} />)}</section>;
    }
  }

  it('derives data from the store and the state, and reacts when it changes', () => {
    const app = run({ pages: { menu: Menu } });
    app.runtime.receive({ kind: 'page', name: 'menu' });
    expect(app.view()).toBe('<section><Button label="Risotto" onPress={fn}/><Button label="Tiramisù" onPress={fn}/></section>');
    app.press('Button', 'Risotto');
    expect(app.view()).toBe('<section><Button label="Risotto" onPress={fn}/></section>');
    // The mains are gone: the listener goes back to every course.
    app.runtime.receive({ kind: 'state', patches: [{ path: ['menu'], value: [{ id: 3, title: 'Gubana', course: 'desserts' }] }] });
    expect(app.view()).toBe('<section><Button label="Gubana" onPress={fn}/></section>');
  });

  it("doesn't let theme code write its state or data directly", () => {
    class Writer extends Component {
      state = { n: 1 };
      render() {
        return <Button label="Write" onPress={() => ((this.state as { n: number }).n = 2)} />;
      }
    }
    const app = run({ pages: { writer: Writer } });
    app.runtime.receive({ kind: 'page', name: 'writer' });
    app.press('Button', 'Write');
    expect(app.errors()).toEqual(['callback: Change state with this.set().']);
  });

  it('merges state and listeners along the class chain', () => {
    const log: string[] = [];
    // A class meant to be extended declares these members with the open types.
    class Parent extends Component {
      state: State<{ a: number }> = { a: 1 };
      listeners: Listeners = { first: on('session:start', () => void log.push('parent')) };
    }
    class Child extends Parent {
      state: Parent['state'] & { b?: number } = { b: 2 };
      listeners = { second: on('session:start', () => void log.push('child')) };
      render() {
        return <p>{(this.state.a ?? 0) + (this.state.b ?? 0)}</p>;
      }
    }
    const app = run({ pages: { child: Child } });
    app.runtime.receive({ kind: 'page', name: 'child' });
    app.runtime.receive({ kind: 'event', name: 'session:start' });
    expect(app.view()).toBe('<p>3</p>');
    expect(log).toEqual(['parent', 'child']);
  });

  it('mounts, leaves and cleans up when the page changes', () => {
    const log: string[] = [];
    class A extends Component {
      listeners = {
        mounted: on('mount', () => {
          log.push('mount A');
          return () => log.push('cleanup A');
        }),
        leaving: on('leave', () => void log.push('leave A')),
        name: on(
          () => this.store.site.name,
          (name) => void log.push(`name ${name}`)
        )
      };
      render() {
        return <p>A</p>;
      }
    }
    class B extends Component {
      render() {
        return <p>B {String((this as unknown as { params: { id: string } }).params.id)}</p>;
      }
    }
    const app = run({ pages: { a: A, b: B } });
    app.runtime.receive({ kind: 'page', name: 'a' });
    app.runtime.receive({ kind: 'state', patches: [{ path: ['site', 'name'], value: 'Two' }] });
    app.runtime.receive({ kind: 'page', name: 'b', params: { id: 'x' } });
    app.runtime.receive({ kind: 'state', patches: [{ path: ['site', 'name'], value: 'Three' }] });
    expect(log).toEqual(['mount A', 'name Two', 'leave A', 'cleanup A']);
    expect(app.view()).toBe('<p>B x</p>');
  });

  it('shows no page when the app asks for none, leaving the last one', () => {
    const log: string[] = [];
    class A extends Component {
      listeners = { leaving: on('leave', () => void log.push('leave A')) };
      render() {
        return <p>A</p>;
      }
    }
    const app = run({ pages: { a: A } });
    app.runtime.receive({ kind: 'page', name: 'a' });
    app.runtime.receive({ kind: 'page', name: null });
    expect(app.view()).toBe('');
    expect(log).toEqual(['leave A']);
    expect(app.errors()).toEqual([]);
  });

  it('updates a page’s parameters in place, without leaving it', () => {
    const log: string[] = [];
    class Category extends Component {
      listeners = {
        mounted: on('mount', () => void log.push('mount')),
        leaving: on('leave', () => void log.push('leave'))
      };
      render() {
        return <h2>{String(this.params.id)}</h2>;
      }
    }
    const app = run({ pages: { category: Category } });
    app.runtime.receive({ kind: 'page', name: 'category', params: { id: 'spa' } });
    app.runtime.receive({ kind: 'page', name: 'category', params: { id: 'dining' } });
    expect(app.view()).toBe('<h2>dining</h2>');
    expect(log).toEqual(['mount']);
  });

  it('sends keys with elements and app components', () => {
    class Keyed extends Component {
      render() {
        return (
          <div key="a">
            <Avatar key={2} />
          </div>
        );
      }
    }
    const app = run({ pages: { keyed: Keyed } });
    app.runtime.receive({ kind: 'page', name: 'keyed' });
    const tree = app.tree.unit(app.tree.root!)!;
    expect(tree).toEqual([{ t: 'e', tag: 'div', props: {}, c: [{ t: 'h', name: 'Avatar', props: {}, c: [], k: 2 }], k: 'a' }]);
  });

  it('gives components their props, and updates them', () => {
    class Card extends Component<{ title: string }> {
      render() {
        return <article>{this.props.title}</article>;
      }
    }
    class Home extends Component {
      render() {
        return <Card title={this.store.site.name} />;
      }
    }
    const app = run({ pages: { home: Home } });
    app.runtime.receive({ kind: 'page', name: 'home' });
    app.runtime.receive({ kind: 'state', patches: [{ path: ['site', 'name'], value: 'Grand View' }] });
    expect(app.view()).toBe('<article>Grand View</article>');
  });
});

describe('what reaches the app', () => {
  it('sends each class’s styles once', () => {
    class Styled extends Component {
      styles = css`.card { color: red; }`;
      render() {
        return <p className="card">x</p>;
      }
    }
    const app = run({ pages: { a: Styled, b: Styled } });
    app.runtime.receive({ kind: 'page', name: 'a' });
    app.runtime.receive({ kind: 'page', name: 'b' });
    expect(app.tree.styles.size).toBe(1);
    expect([...app.tree.styles.values()]).toEqual(['.card { color: red; }']);
  });

  it('reports a page the theme lacks', () => {
    const app = run({ pages: {} });
    app.runtime.receive({ kind: 'page', name: 'nowhere' });
    expect(app.errors()).toEqual(['page: The theme has no page "nowhere".']);
  });
});
