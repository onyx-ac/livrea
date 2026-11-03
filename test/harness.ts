/** Runs a theme like an app would, keeping what the runtime sends, and prints the tree as markup. */
import { HostTree, sanitizeOps, SAFE_TAGS, type HostPolicy } from '../src/host.js';
import type { Out, ThemeMessage, TreeOp } from '../src/protocol.js';
import { createRuntime, type RuntimeOptions } from '../src/runtime.js';

export const EVENTS: RuntimeOptions['events'] = {
  'rail:press': { source: 'component', cancellable: true, bubbles: true },
  'session:start': { source: 'app', cancellable: false, bubbles: false },
  'before:navigate': { source: 'app', cancellable: true, bubbles: true },
  'promo:seen': { source: 'theme', cancellable: false, bubbles: true }
};

export const POLICY: HostPolicy = {
  tags: SAFE_TAGS,
  hosts: new Set(['Button', 'Avatar']),
  url: (address) => address.startsWith('/media/')
};

export const STATE = {
  site: { name: 'Grand' },
  categories: [
    { id: 'spa', name: 'Spa' },
    { id: 'events', name: 'Events' }
  ],
  menu: [
    { id: 1, title: 'Risotto', course: 'mains' },
    { id: 2, title: 'Tiramisù', course: 'desserts' }
  ]
};

export function run(options: Omit<RuntimeOptions, 'post'>) {
  const messages: ThemeMessage[] = [];
  const problems: string[] = [];
  const tree = new HostTree();
  const runtime = createRuntime({
    events: EVENTS,
    state: STATE,
    ...options,
    post: (message) => {
      messages.push(message);
      if (message.kind === 'tree') tree.apply(sanitizeOps(message.ops, POLICY, (problem) => problems.push(problem)));
    }
  });
  const of = <K extends ThemeMessage['kind']>(kind: K) => messages.filter((m): m is Extract<ThemeMessage, { kind: K }> => m.kind === kind);
  return {
    runtime,
    tree,
    problems,
    messages,
    /** The screen, as markup. */
    view: () => markup(tree, tree.root),
    actions: () => of('action').map(({ name, args }) => [name, ...args]),
    errors: () => of('error').map(({ where, message }) => `${where}: ${message}`),
    /** The tree updates sent since the last call. */
    updates: (() => {
      let seen = 0;
      return (): TreeOp[] => {
        const ops = of('tree').slice(seen).flatMap((m) => m.ops);
        seen = of('tree').length;
        return ops;
      };
    })(),
    /** Calls the callback a host component received, as the app does when it's used. */
    press: (name: string, label: string, prop = 'onPress') => {
      const fn = findCallback(tree, tree.root, name, label, prop);
      if (fn === undefined) throw new Error(`No ${name} labelled ${label}.`);
      runtime.receive({ kind: 'invoke', fn, args: [] });
    }
  };
}

function markup(tree: HostTree, id: string | null): string {
  if (!id) return '';
  return (tree.unit(id) ?? []).map((node) => print(tree, node)).join('');
}

function print(tree: HostTree, node: Out): string {
  if (typeof node === 'string') return node;
  if (node.t === 'u') return markup(tree, node.id);
  const name = node.t === 'e' ? node.tag : node.name;
  const attributes = Object.entries(node.props)
    .map(([key, value]) => {
      const attribute = key === 'className' ? 'class' : key;
      if (typeof value === 'string') return ` ${attribute}="${value}"`;
      if (value && typeof value === 'object' && '$fn' in value) return ` ${attribute}={fn}`;
      return ` ${attribute}={${JSON.stringify(value)}}`;
    })
    .join('');
  const children = node.c.map((child) => print(tree, child)).join('');
  return children ? `<${name}${attributes}>${children}</${name}>` : `<${name}${attributes}/>`;
}

function findCallback(tree: HostTree, id: string | null, name: string, label: string, prop: string): number | undefined {
  for (const node of (id && tree.unit(id)) || []) {
    const found = search(tree, node, name, label, prop);
    if (found !== undefined) return found;
  }
  return undefined;
}

function search(tree: HostTree, node: Out, name: string, label: string, prop: string): number | undefined {
  if (typeof node === 'string') return undefined;
  if (node.t === 'u') return findCallback(tree, node.id, name, label, prop);
  if (node.t === 'h' && node.name === name && node.props.label === label) {
    const ref = node.props[prop] as { $fn: number } | undefined;
    return ref?.$fn;
  }
  for (const child of node.c) {
    const found = search(tree, child, name, label, prop);
    if (found !== undefined) return found;
  }
  return undefined;
}
