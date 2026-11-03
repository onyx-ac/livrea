import { describe, expect, it, vi } from 'vitest';
import { Component, on } from '../src/index.js';
import { ThemeClient, type Connect } from '../src/host.js';
import { createRuntime, type ComponentClass } from '../src/runtime.js';
import { HomePage } from './base.js';
import { EVENTS, POLICY, STATE } from './harness.js';

/** The runtime in this thread, as an app runs it before the worker sandbox. */
const inThread =
  (pages: Record<string, ComponentClass>): Connect =>
  (deliver) => {
    const runtime = createRuntime({ pages, events: EVENTS, state: STATE, post: deliver });
    return { send: (message) => runtime.receive(message) };
  };

function client(pages: Record<string, ComponentClass>, overrides: Partial<ConstructorParameters<typeof ThemeClient>[0]> = {}) {
  const actions: unknown[][] = [];
  const instance = new ThemeClient({
    connect: inThread(pages),
    policy: POLICY,
    events: EVENTS!,
    onAction: (name, args) => actions.push([name, ...args]),
    ...overrides
  });
  return { client: instance, actions };
}

describe('the theme client', () => {
  it('keeps the checked tree, and hands actions over after the message that caused them', async () => {
    const { client: theme, actions } = client({ home: HomePage });
    theme.showPage('home');
    const rail = theme.tree.unit(theme.tree.root!);
    expect(rail).toBeDefined();
    const button = JSON.stringify([...collectHosts(theme)]);
    expect(button).toContain('"label":"Spa"');

    const fn = [...collectHosts(theme)].find((h) => h.props.label === 'Spa')!.props.onPress as { $fn: number };
    theme.invoke(fn.$fn, []);
    expect(actions).toEqual([]);
    await Promise.resolve();
    expect(actions).toEqual([['navigate', { category: 'spa' }]]);
  });

  it('waits for the answer to a cancellable event, and not to others', async () => {
    class Home extends Component {
      listeners = { stay: on('before:navigate', (e) => e.preventDefault()) };
    }
    const { client: theme } = client({ home: Home });
    theme.showPage('home');
    await expect(theme.emit('before:navigate', { to: 'spa' })).resolves.toBe(true);
    await expect(theme.emit('session:start', {})).resolves.toBe(false);
  });

  it('goes ahead when the theme doesn’t answer in time', async () => {
    vi.useFakeTimers();
    try {
      const silent: Connect = () => ({ send: () => {} });
      const { client: theme } = client({}, { connect: silent, answerTimeoutMs: 50 });
      const answer = theme.emit('before:navigate', { to: 'spa' });
      vi.advanceTimersByTime(50);
      await expect(answer).resolves.toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports errors and drops what the policy refuses, whatever the runtime sends', () => {
    let deliver: (message: unknown) => void = () => {};
    const errors: string[] = [];
    const theme = new ThemeClient({
      connect: (d) => {
        deliver = d;
        return { send: () => {} };
      },
      policy: POLICY,
      events: {},
      onAction: () => {}
    });
    theme.onError((error) => errors.push(`${error.where}: ${error.message}`));
    deliver('garbage');
    deliver({ kind: 'tree', ops: [{ op: 'root', id: 'u1' }, { op: 'set', id: 'u1', tree: [{ t: 'e', tag: 'script', props: {}, c: [] }] }] });
    deliver({ kind: 'error', where: 'slot Header', message: 'broken' });
    expect(theme.tree.unit('u1')).toEqual([]);
    expect(errors).toEqual(["tree: The element <script> isn't allowed.", 'slot Header: broken']);
  });

  it('settles pending cancellable events and closes the connection when closed', async () => {
    const close = vi.fn();
    const silent: Connect = () => ({ send: () => {}, close });
    const { client: theme } = client({}, { connect: silent, answerTimeoutMs: 10_000 });
    const pending = theme.emit('before:navigate', { to: 'spa' });
    theme.close();
    await expect(pending).resolves.toBe(false);
    expect(close).toHaveBeenCalledTimes(1);
  });
});

function* collectHosts(theme: ThemeClient, id = theme.tree.root): Generator<{ name: string; props: Record<string, unknown> }> {
  for (const node of (id && theme.tree.unit(id)) || []) yield* walk(theme, node);
}

function* walk(theme: ThemeClient, node: unknown): Generator<{ name: string; props: Record<string, unknown> }> {
  if (!node || typeof node !== 'object') return;
  const n = node as { t: string; id?: string; name?: string; props?: Record<string, unknown>; c?: unknown[] };
  if (n.t === 'u') yield* collectHosts(theme, n.id!);
  if (n.t === 'h') yield { name: n.name!, props: n.props! };
  for (const child of n.c ?? []) yield* walk(theme, child);
}

describe('redirects', () => {
  it('allows one, and drops the next, so themes can’t bounce the app forever', async () => {
    // A theme that redirects every navigation.
    class Restless extends Component {
      listeners = {
        bounce: on('before:navigate', (e) => {
          e.preventDefault();
          this.action('navigate', `${e.to}+`);
        })
      };
    }
    const navigations: string[] = [];
    const errors: string[] = [];
    const theme: ThemeClient = new ThemeClient({
      connect: inThread({ home: Restless }),
      policy: POLICY,
      events: EVENTS!,
      // The app asks the theme first, then goes where it was told unless prevented.
      onAction: async (_name, [to]) => {
        navigations.push(String(to));
        if (!(await theme.emit('before:navigate', { to: String(to) }))) navigations.push(`went to ${String(to)}`);
      }
    });
    theme.onError((error) => errors.push(error.message));
    theme.showPage('home');
    await theme.emit('before:navigate', { to: 'spa' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(navigations).toEqual(['spa+']);
    expect(errors).toEqual(['navigate was dropped: too many redirects in a row.']);
  });
});
