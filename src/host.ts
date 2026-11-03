/**
 * The app's side: what it receives from the theme runtime is checked here
 * before anything renders, because theme code is not trusted. The sandbox
 * keeps a theme from reaching anything; these checks keep what it sends back
 * to elements, attributes, addresses and styles the app allows.
 */
import type { EventInfo } from './events.js';
import type { AppMessage, Out, OutProps, TreeOp } from './protocol.js';
import type { Patch } from './store.js';
import { isRecord } from './store.js';
import type { EventCatalog, EventName } from './types.js';
export type { EventInfo } from './events.js';
export type { AppMessage, FunctionRef, Out, OutElement, OutHost, OutProps, OutUnit, ThemeMessage, TreeOp } from './protocol.js';
export type { Patch } from './store.js';

export interface HostPolicy {
  /** The elements themes may use. */
  readonly tags: ReadonlySet<string>;
  /** The app components themes may place. */
  readonly hosts: ReadonlySet<string>;
  /** Whether an address may be used, in an image's `src` or in CSS `url()`. */
  url(address: string, where: 'src' | 'css'): boolean;
}

export const SAFE_TAGS: ReadonlySet<string> = new Set([
  'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'section', 'header', 'footer', 'main', 'article', 'aside',
  'nav', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'img', 'figure', 'figcaption', 'strong', 'em', 'b', 'i', 'small', 'mark',
  'sup', 'sub', 'br', 'hr', 'time', 'blockquote', 'table', 'thead', 'tbody', 'tr', 'th', 'td'
]);

const ELEMENT_PROPS = new Set(['className', 'style', 'id', 'role', 'title', 'alt', 'src', 'lang', 'dir']);
const ARIA = /^aria-[a-z]+(?:-[a-z]+)*$/;
const CSS_PROPERTY = /^-{0,2}[a-zA-Z][a-zA-Z0-9-]*$/;
const CSS_COMMENTS = /\/\*[\s\S]*?(?:\*\/|$)/g;
const CSS_ESCAPE = /\\(?:([0-9a-fA-F]{1,6})\s?|([^\r\n]))/g;
const CSS_URL = /url\s*\(([^)]*)(\)|$)/gi;
const CSS_IMPORT = /@import[^;{}]*;?/gi;
const CSS_SCRIPT = /(?:expression\s*\(|javascript:|behavior\s*:|-moz-binding)[^;{}]*/gi;
const CSS_FORBIDDEN = /expression\s*\(|javascript:|@import|behavior\s*:|-moz-binding/i;
const MAX_DEPTH = 64;

export type Problem = (message: string) => void;

/** Keeps the updates and the parts of them the policy allows; reports the rest. */
export function sanitizeOps(input: unknown, policy: HostPolicy, problem: Problem): TreeOp[] {
  if (!Array.isArray(input)) {
    problem('A tree update that is not a list was dropped.');
    return [];
  }
  const ops: TreeOp[] = [];
  for (const op of input) {
    if (!isRecord(op) || typeof op.id !== 'string') {
      problem('A tree update without an id was dropped.');
      continue;
    }
    switch (op.op) {
      case 'root':
      case 'outlet':
      case 'drop':
        ops.push({ op: op.op, id: op.id });
        break;
      case 'set':
        ops.push({ op: 'set', id: op.id, tree: sanitizeList(op.tree, policy, problem, 0) });
        break;
      case 'styles':
        if (typeof op.css === 'string') ops.push({ op: 'styles', id: op.id, css: sanitizeCss(op.css, policy, problem) });
        break;
      default:
        problem(`An unknown tree update (${String(op.op)}) was dropped.`);
    }
  }
  return ops;
}

function sanitizeList(list: unknown, policy: HostPolicy, problem: Problem, depth: number): Out[] {
  if (!Array.isArray(list)) return [];
  if (depth > MAX_DEPTH) {
    problem('Elements nested too deeply were dropped.');
    return [];
  }
  const out: Out[] = [];
  for (const node of list) {
    const clean = sanitizeNode(node, policy, problem, depth);
    if (clean !== null) out.push(clean);
  }
  return out;
}

function sanitizeNode(node: unknown, policy: HostPolicy, problem: Problem, depth: number): Out | null {
  if (typeof node === 'string') return node;
  if (!isRecord(node)) {
    problem('Something that is not a node was dropped.');
    return null;
  }
  switch (node.t) {
    case 'u':
      return typeof node.id === 'string' ? { t: 'u', id: node.id } : null;
    case 'e':
      if (typeof node.tag !== 'string' || !policy.tags.has(node.tag)) {
        problem(`The element <${String(node.tag)}> isn't allowed.`);
        return null;
      }
      return { t: 'e', tag: node.tag, props: elementProps(node.props, policy, problem), c: sanitizeList(node.c, policy, problem, depth + 1), ...key(node.k) };
    case 'h':
      if (typeof node.name !== 'string' || !policy.hosts.has(node.name)) {
        problem(`The app component ${String(node.name)} isn't available.`);
        return null;
      }
      return { t: 'h', name: node.name, props: hostProps(node.props, problem), c: sanitizeList(node.c, policy, problem, depth + 1), ...key(node.k) };
    default:
      problem('An unknown kind of node was dropped.');
      return null;
  }
}

function key(value: unknown): { k?: string | number } {
  if (typeof value === 'string' && value.length <= 200) return { k: value };
  if (typeof value === 'number' && Number.isFinite(value)) return { k: value };
  return {};
}

function elementProps(props: unknown, policy: HostPolicy, problem: Problem): OutProps {
  const out: Record<string, unknown> = {};
  if (!isRecord(props)) return out;
  for (const [key, value] of Object.entries(props)) {
    if (!ELEMENT_PROPS.has(key) && !ARIA.test(key)) {
      problem(`The attribute ${key} isn't allowed.`);
      continue;
    }
    if (key === 'style') {
      const style = sanitizeStyle(value, policy, problem);
      if (style) out.style = style;
      continue;
    }
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
      problem(`The attribute ${key} must be text, a number or true/false.`);
      continue;
    }
    if (key === 'src' && (typeof value !== 'string' || !policy.url(value, 'src'))) {
      problem(`The image address ${String(value)} isn't allowed.`);
      continue;
    }
    out[key] = value;
  }
  return out;
}

function sanitizeStyle(value: unknown, policy: HostPolicy, problem: Problem): Record<string, string | number> | null {
  if (!isRecord(value)) return null;
  const out: Record<string, string | number> = {};
  for (const [property, declared] of Object.entries(value)) {
    if (!CSS_PROPERTY.test(property)) continue;
    if (typeof declared === 'number' && Number.isFinite(declared)) {
      out[property] = declared;
      continue;
    }
    if (typeof declared !== 'string' || !cssValueAllowed(declared, policy)) {
      problem(`The style ${property} was dropped.`);
      continue;
    }
    out[property] = declared;
  }
  return out;
}

function cssValueAllowed(value: string, policy: HostPolicy): boolean {
  const normalized = normalizeCss(value);
  if (CSS_FORBIDDEN.test(normalized)) return false;
  for (const match of normalized.matchAll(CSS_URL)) {
    const address = match[2] === ')' ? parseCssUrl(match[1] ?? '') : null;
    if (address === null || !policy.url(address, 'css')) return false;
  }
  return true;
}

/** A theme's CSS, without comments, escapes that hide keywords, imports, script-like values or addresses the policy refuses. */
export function sanitizeCss(css: string, policy: HostPolicy, problem: Problem): string {
  let clean = normalizeCss(css);
  // Loop until neither pattern matches, so stripping one part can't stitch another together.
  for (;;) {
    const previous = clean;
    clean = clean
      .replace(CSS_IMPORT, () => {
        problem('An @import was removed from the styles.');
        return '';
      })
      .replace(CSS_SCRIPT, () => {
        problem('A script-like value was removed from the styles.');
        return '';
      });
    if (clean === previous) break;
  }
  return clean.replace(CSS_URL, (whole, raw: string, close: string) => {
    const address = close === ')' ? parseCssUrl(raw) : null;
    if (address !== null && policy.url(address, 'css')) return whole;
    problem(`The address ${address ?? raw.trim()} was removed from the styles.`);
    return 'none';
  });
}

/** Strips CSS comments and decodes backslash escapes so obfuscated keywords and URLs are checked as the browser sees them. */
function normalizeCss(css: string): string {
  return css.replace(CSS_COMMENTS, '').replace(CSS_ESCAPE, (_, hex: string | undefined, literal: string | undefined) => {
    if (literal !== undefined) return literal;
    const code = Number.parseInt(hex!, 16);
    return code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff) ? '\ufffd' : String.fromCodePoint(code);
  });
}

function parseCssUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    const inner = trimmed.slice(1, -1).trim();
    return /['"\s()]/.test(inner) ? null : inner;
  }
  return /['"\s()]/.test(trimmed) ? null : trimmed;
}

/** An app component's props: plain data, and function references the app calls back. */
function hostProps(props: unknown, problem: Problem): OutProps {
  const out: Record<string, unknown> = {};
  if (!isRecord(props)) return out;
  for (const [key, value] of Object.entries(props)) {
    const clean = plainData(value, 0);
    if (clean === undefined) problem(`The value of ${key} was dropped.`);
    else out[key] = clean;
  }
  return out;
}

function plainData(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) return undefined;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (Array.isArray(value)) {
    const items = value.map((item) => plainData(item, depth + 1));
    return items.includes(undefined) ? undefined : items;
  }
  if (!isRecord(value)) return undefined;
  if ('$fn' in value) return Number.isSafeInteger(value.$fn) && Object.keys(value).length === 1 ? { $fn: value.$fn } : undefined;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    const clean = plainData(item, depth + 1);
    if (clean === undefined) return undefined;
    out[key] = clean;
  }
  return out;
}

/** The rendered tree on the app's side: units by id, and the theme's styles. Renderers subscribe to it. */
export class HostTree {
  #root: string | null = null;
  #outlet: string | null = null;
  readonly #units = new Map<string, readonly Out[]>();
  #styles: ReadonlyMap<string, string> = new Map();
  readonly #listeners = new Set<() => void>();

  apply(ops: readonly TreeOp[]): void {
    for (const op of ops) {
      switch (op.op) {
        case 'root':
          this.#root = op.id;
          break;
        case 'outlet':
          this.#outlet = op.id;
          break;
        case 'set':
          this.#units.set(op.id, op.tree);
          break;
        case 'drop':
          this.#units.delete(op.id);
          break;
        case 'styles':
          // A new map, so renderers see the change.
          this.#styles = new Map(this.#styles).set(op.id, op.css);
          break;
      }
    }
    for (const listener of [...this.#listeners]) listener();
  }

  get root(): string | null {
    return this.#root;
  }

  /** The unit where pages show. */
  get outlet(): string | null {
    return this.#outlet;
  }

  unit(id: string): readonly Out[] | undefined {
    return this.#units.get(id);
  }

  get styles(): ReadonlyMap<string, string> {
    return this.#styles;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
}

/** The link to the theme runtime: a function call in the same thread, or a worker's messages. */
export interface ThemeConnection {
  send(message: AppMessage): void;
  close?(): void;
}

/** Opens the connection; `deliver` receives every message the runtime sends. */
export type Connect = (deliver: (message: unknown) => void) => ThemeConnection;

export interface ThemeError {
  readonly where: string;
  readonly message: string;
}

export interface ThemeClientOptions {
  connect: Connect;
  policy: HostPolicy;
  /** The app's event catalog: the client waits for an answer only to events that can be cancelled. */
  events: Readonly<Record<string, EventInfo>>;
  /** What the theme asks the app to do. Its arguments are the theme's: check them before acting. A returned promise's failure is reported. */
  onAction(name: string, args: readonly unknown[]): unknown;
  onTrack?(name: string): void;
  /** How long to wait for a cancellable event's answer before going ahead; 100 ms by default. */
  answerTimeoutMs?: number;
  /**
   * An action a listener sends while the app waits for its answer to a
   * cancellable event is a redirect (preventDefault, then navigate elsewhere).
   * This many levels are allowed, 1 by default, so themes can't bounce the app
   * between two pages forever.
   */
  maxRedirects?: number;
}

const MAX_TEXT = 2000;

/**
 * The app's end of a running theme: it keeps the checked tree, sends the
 * app's state, pages and events, and hands the theme's actions to the app.
 * Everything the runtime sends is treated as untrusted.
 */
export class ThemeClient {
  readonly tree = new HostTree();
  readonly #options: ThemeClientOptions;
  /** Cancellable events waiting for their answer, with how deep in a chain of redirects each was sent. */
  readonly #answers = new Map<number, { readonly settle: (prevented: boolean) => void; readonly depth: number }>();
  /** The redirect depth of the action being handled, while its handler starts. */
  #depth = 0;
  readonly #errorListeners = new Set<(error: ThemeError) => void>();
  readonly #connection: ThemeConnection;
  #nextAnswer = 1;
  readonly #failed = new Set<string>();

  constructor(options: ThemeClientOptions) {
    this.#options = options;
    this.#connection = options.connect((message) => this.#receive(message));
  }

  /** For useSyncExternalStore and the like; bound, so it can be passed around. */
  readonly subscribe = (listener: () => void): (() => void) => this.tree.subscribe(listener);

  setState(value: object): void {
    this.#connection.send({ kind: 'state', value });
  }

  patchState(patches: readonly Patch[]): void {
    this.#connection.send({ kind: 'state', patches });
  }

  /** Shows a page of the theme, or none. */
  showPage(name: string | null, params?: Readonly<Record<string, unknown>>): void {
    this.#connection.send({ kind: 'page', name, params });
  }

  /** Calls back a function the theme put in an app component's props. */
  invoke(fn: number, args: readonly unknown[]): void {
    this.#connection.send({ kind: 'invoke', fn, args });
  }

  /** Sends an event of the catalog; resolves with whether a listener prevented it (always false for events that can't be). */
  emit<K extends EventName>(name: K, payload: EventCatalog[K]): Promise<boolean> {
    if (!this.#options.events[name]?.cancellable) {
      this.#connection.send({ kind: 'event', name, payload });
      return Promise.resolve(false);
    }
    const id = this.#nextAnswer++;
    return new Promise<boolean>((resolve) => {
      const settle = (prevented: boolean) => {
        clearTimeout(timer);
        this.#answers.delete(id);
        resolve(prevented);
      };
      // A slow or broken theme can't hold the app back.
      const timer = setTimeout(() => settle(false), this.#options.answerTimeoutMs ?? 100);
      this.#answers.set(id, { settle, depth: this.#depth });
      this.#connection.send({ kind: 'event', id, name, payload });
    });
  }

  /** Whether this part of the theme (`layout`, `page`…) has reported an error, even before anyone listened. */
  hasFailed(where: string): boolean {
    return this.#failed.has(where);
  }

  onError(listener: (error: ThemeError) => void): () => void {
    this.#errorListeners.add(listener);
    return () => this.#errorListeners.delete(listener);
  }

  close(): void {
    for (const answer of this.#answers.values()) answer.settle(false);
    this.#connection.close?.();
  }

  #receive(message: unknown): void {
    if (!isRecord(message)) return;
    switch (message.kind) {
      case 'tree':
        this.tree.apply(sanitizeOps(message.ops, this.#options.policy, (problem) => this.#error({ where: 'tree', message: problem })));
        return;
      case 'answer':
        if (typeof message.id === 'number') this.#answers.get(message.id)?.settle(message.prevented === true);
        return;
      case 'action': {
        if (typeof message.name !== 'string' || !Array.isArray(message.args)) return;
        const name = message.name;
        const args = message.args as unknown[];
        // Sent while a cancellable event waits for its answer: a listener of it is redirecting.
        const depth = this.#answers.size ? Math.max(...[...this.#answers.values()].map((answer) => answer.depth)) + 1 : 0;
        if (depth > (this.#options.maxRedirects ?? 1)) {
          this.#error({ where: 'action', message: `${name} was dropped: too many redirects in a row.` });
          return;
        }
        // Later, as a worker's message would be: never while the runtime is still handling the message that caused it.
        queueMicrotask(() => {
          this.#depth = depth;
          try {
            const done = this.#options.onAction(name, args);
            if (done instanceof Promise) done.catch((error: unknown) => this.#error({ where: `action ${name}`, message: String(error) }));
          } catch (error) {
            this.#error({ where: `action ${name}`, message: String(error) });
          } finally {
            this.#depth = 0;
          }
        });
        return;
      }
      case 'track':
        if (typeof message.name === 'string') this.#options.onTrack?.(message.name.slice(0, MAX_TEXT));
        return;
      case 'error':
        this.#error({ where: String(message.where).slice(0, MAX_TEXT), message: String(message.message).slice(0, MAX_TEXT) });
        return;
    }
  }

  #error(error: ThemeError): void {
    this.#failed.add(error.where);
    for (const listener of [...this.#errorListeners]) listener(error);
  }
}
