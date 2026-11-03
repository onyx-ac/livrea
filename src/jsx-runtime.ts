/**
 * The JSX runtime themes compile against (`"jsxImportSource": "livrea"`).
 * JSX builds plain nodes; the theme runtime turns them into the tree the app
 * displays. Nothing here touches a DOM.
 */

export type Key = string | number;

export interface ElementNode {
  readonly kind: 'element';
  readonly tag: string;
  readonly props: Readonly<Record<string, unknown>>;
  readonly children: readonly Child[];
  readonly key: Key | undefined;
}

export interface ComponentNode {
  readonly kind: 'component';
  readonly type: Function;
  readonly props: Readonly<Record<string, unknown>>;
  readonly key: Key | undefined;
}

export interface FragmentNode {
  readonly kind: 'fragment';
  readonly children: readonly Child[];
  readonly key: Key | undefined;
}

export type Node = ElementNode | ComponentNode | FragmentNode;
export type Child = Node | string | number | boolean | null | undefined | readonly Child[];

export function Fragment(props: { children?: Child }): Node {
  return { kind: 'fragment', children: toChildren(props.children), key: undefined };
}

export function jsx(type: unknown, props: Record<string, unknown> | null, key?: Key): Node {
  const all = props ?? {};
  if (type === Fragment) return { kind: 'fragment', children: toChildren(all.children), key };
  if (typeof type === 'string') {
    const { children, ...rest } = all;
    return { kind: 'element', tag: type, props: rest, children: toChildren(children), key };
  }
  // Slots, app components, component classes and plain functions keep their children in props.
  if (typeof type === 'function') return { kind: 'component', type, props: all, key };
  throw new TypeError(`JSX can't render ${String(type)}.`);
}

export const jsxs = jsx;

export function jsxDEV(type: unknown, props: Record<string, unknown> | null, key?: Key): Node {
  return jsx(type, props, key);
}

function toChildren(children: unknown): Child[] {
  if (children === undefined) return [];
  return Array.isArray(children) ? children : [children as Child];
}

type AriaProps = { [K in `aria-${string}`]?: string | number | boolean };

/** What an element may carry. The app checks it again: what a theme sends is never trusted. */
export interface ElementProps extends AriaProps {
  className?: string;
  style?: Readonly<Record<string, string | number>>;
  id?: string;
  role?: string;
  title?: string;
  alt?: string;
  src?: string;
  lang?: string;
  dir?: 'ltr' | 'rtl' | 'auto';
  children?: Child;
  key?: Key;
}

export declare namespace JSX {
  type Element = Node;
  type ElementType = string | ((props: any) => Child) | (new () => ElementClass);
  interface ElementClass {
    render(): Child;
  }
  interface ElementAttributesProperty {
    props: {};
  }
  interface ElementChildrenAttribute {
    children: {};
  }
  interface IntrinsicAttributes {
    key?: Key;
  }
  interface IntrinsicElements {
    div: ElementProps;
    span: ElementProps;
    p: ElementProps;
    h1: ElementProps;
    h2: ElementProps;
    h3: ElementProps;
    h4: ElementProps;
    h5: ElementProps;
    h6: ElementProps;
    section: ElementProps;
    header: ElementProps;
    footer: ElementProps;
    main: ElementProps;
    article: ElementProps;
    aside: ElementProps;
    nav: ElementProps;
    ul: ElementProps;
    ol: ElementProps;
    li: ElementProps;
    dl: ElementProps;
    dt: ElementProps;
    dd: ElementProps;
    img: ElementProps;
    figure: ElementProps;
    figcaption: ElementProps;
    strong: ElementProps;
    em: ElementProps;
    b: ElementProps;
    i: ElementProps;
    small: ElementProps;
    mark: ElementProps;
    sup: ElementProps;
    sub: ElementProps;
    br: ElementProps;
    hr: ElementProps;
    time: ElementProps;
    blockquote: ElementProps;
    table: ElementProps;
    thead: ElementProps;
    tbody: ElementProps;
    tr: ElementProps;
    th: ElementProps;
    td: ElementProps;
  }
}
