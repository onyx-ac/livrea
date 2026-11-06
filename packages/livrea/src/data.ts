/**
 * The data a theme reads from the store: what the app must provide for its lists and values to have anything in them
 * (settings say how a list looks; this is what's in it). The theme declares each one with its shape and a sample, as
 * plain data, so `livrea pack` can write them to settings.json for an app or a builder to read.
 *
 *   export const data = defineData({
 *     articles: dataField.list({
 *       label: { en: 'Articles' },
 *       item: { id: 'string', title: 'string', minutes: 'number?' },
 *       sample: [{ id: 'a1', title: 'Hello', minutes: 3 }]
 *     })
 *   });
 *
 * Apps provide the data in their store, as always: declaring it fetches nothing. Samples are for previews, and only a
 * builder's `withSampleData` uses them: a running app with nothing to show shows nothing, never a sample as if it were real.
 */
import type { LocalizedText } from './settings.js';

/** A value's type; with `?`, it may be left out. `any` is for what's nested: it's only checked for being there. */
export type DataType = 'string' | 'number' | 'boolean' | 'any' | 'string?' | 'number?' | 'boolean?' | 'any?';
export type DataShape = Readonly<Record<string, DataType>>;

interface DataFieldBase<K extends string, S> {
  readonly kind: K;
  readonly label: LocalizedText;
  /** What it is, and where an app might get it. */
  readonly help?: LocalizedText;
  /** What a preview shows until the app provides it. */
  readonly sample: S;
}

type Plain<T extends DataType> = T extends `string${string}`
  ? string
  : T extends `number${string}`
    ? number
    : T extends `boolean${string}`
      ? boolean
      : unknown;
type Optional<S extends DataShape> = { [K in keyof S]: S[K] extends `${string}?` ? K : never }[keyof S];

/** One item's values, from its shape. */
export type DataItem<S extends DataShape> = { readonly [K in Exclude<keyof S, Optional<S>>]: Plain<S[K]> } & {
  readonly [K in Optional<S>]?: Plain<S[K]>;
};

/** A list of items of one shape: articles, products, rooms. */
export interface DataList<S extends DataShape = DataShape> extends DataFieldBase<'list', readonly DataItem<S>[]> {
  readonly item: S;
}

/** One item: the hotel, the signed-in user's name and language. */
export interface DataRecord<S extends DataShape = DataShape> extends DataFieldBase<'record', DataItem<S>> {
  readonly fields: S;
}

/** One value: a tagline, a count. */
export interface DataValue<T extends DataType = DataType> extends DataFieldBase<'value', Plain<T>> {
  readonly type: T;
}

export type DataField = DataList | DataRecord | DataValue;
export type DataSchema = Readonly<Record<string, DataField>>;

/** The store's values a schema declares, for `interface ThemeStore extends DataValues<typeof data>`. */
export type DataValues<D extends DataSchema> = { readonly [K in keyof D]: D[K]['sample'] };

export const dataField = {
  list: <const S extends DataShape>(options: Omit<DataList<S>, 'kind'>): DataList<S> => ({ kind: 'list', ...options }),
  record: <const S extends DataShape>(options: Omit<DataRecord<S>, 'kind'>): DataRecord<S> => ({ kind: 'record', ...options }),
  value: <const T extends DataType>(options: Omit<DataValue<T>, 'kind'>): DataValue<T> => ({ kind: 'value', ...options })
};

const NAME = /^[a-zA-Z][a-zA-Z0-9]*$/;
/** The store's keys that aren't the app's to fill with data. */
const RESERVED = new Set(['settings']);
/** Samples travel in settings.json: a few items, not a catalogue. */
const MAX_SAMPLE_BYTES = 256 * 1024;

const isName = (name: string) => NAME.test(name) && !RESERVED.has(name);

function typeProblem(type: unknown, value: unknown, where: string): string | null {
  if (typeof type !== 'string') return null;
  const optional = type.endsWith('?');
  if (value === undefined || value === null) return optional ? null : `${where} is missing.`;
  const expected = optional ? type.slice(0, -1) : type;
  if (expected === 'any') return null;
  if (expected === 'number' ? typeof value === 'number' && Number.isFinite(value) : typeof value === expected) return null;
  return `${where} should be a ${expected}, and is ${Array.isArray(value) ? 'a list' : `a ${typeof value}`}.`;
}

function shapeProblem(shape: unknown, value: unknown, where: string): string | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return `${where} should be an item.`;
  if (shape === null || typeof shape !== 'object') return null;
  for (const [key, type] of Object.entries(shape)) {
    const problem = typeProblem(type, (value as Record<string, unknown>)[key], `${where}.${key}`);
    if (problem) return problem;
  }
  return null;
}

/** What's wrong with a value for its declaration, in a line a person can act on; null when it fits. */
function valueProblem(definition: DataField, value: unknown, name: string): string | null {
  switch (definition.kind) {
    case 'list': {
      if (!Array.isArray(value)) return `${name} should be a list.`;
      for (let i = 0; i < value.length; i++) {
        const problem = shapeProblem(definition.item, value[i], `${name}[${i}]`);
        if (problem) return problem;
      }
      return null;
    }
    case 'record':
      return shapeProblem(definition.fields, value, name);
    case 'value':
      return typeProblem(definition.type, value, name);
    default:
      // From a newer format than this reader's: that it's there is all that can be said.
      return null;
  }
}

/** Checks a theme's declarations as it's defined, so a mistake shows while writing it, not in someone's preview. */
export function defineData<const D extends DataSchema>(schema: D): D {
  for (const [name, definition] of Object.entries(schema)) {
    const where = `The data "${name}"`;
    if (!isName(name)) throw new Error(`${where} needs a name of letters and digits, starting with a letter, other than "settings".`);
    if (!definition.label || !Object.keys(definition.label).length) throw new Error(`${where} needs a label.`);
    const problem = valueProblem(definition, definition.sample, 'its sample');
    if (problem) throw new Error(`${where} has a sample that doesn't fit: ${problem}`);
    if (new TextEncoder().encode(JSON.stringify(definition.sample)).length > MAX_SAMPLE_BYTES) {
      throw new Error(`${where} has a sample over ${MAX_SAMPLE_BYTES / 1024} KB: samples travel with the theme, so keep them to a few items.`);
    }
  }
  return schema;
}

export interface DataCheck {
  readonly name: string;
  /** Whether the store has it: `invalid` has it in the wrong shape. */
  readonly status: 'provided' | 'missing' | 'invalid';
  readonly problem?: string;
}

/**
 * How a store's state compares with what a theme declares: for an app's upload step ("this theme needs products,
 * and you don't provide them"), or a builder. It reads only; `data` may come from an uploaded settings.json.
 */
export function checkThemeData(data: DataSchema | undefined, state: Readonly<Record<string, unknown>>): readonly DataCheck[] {
  return Object.entries(data ?? {})
    .filter(([name]) => isName(name))
    .map(([name, definition]) => {
      if (!Object.hasOwn(state, name) || state[name] === undefined) return { name, status: 'missing' as const };
      const problem = valueProblem(definition, state[name], name);
      return problem ? { name, status: 'invalid' as const, problem } : { name, status: 'provided' as const };
    });
}

/**
 * The state for a builder's preview: the app's data where it has some, the theme's samples elsewhere. For previews
 * only: the engine never does this by itself.
 */
export function withSampleData<S extends object>(data: DataSchema | undefined, state: S): S & Record<string, unknown> {
  const out = { ...state } as Record<string, unknown>;
  for (const [name, definition] of Object.entries(data ?? {})) {
    if (isName(name) && out[name] === undefined && definition?.sample !== undefined) out[name] = definition.sample;
  }
  return out as S & Record<string, unknown>;
}
