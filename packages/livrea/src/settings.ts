/**
 * A theme's settings: what the people running the app may change without
 * code (an accent colour, a welcome text, whether a clock shows). The theme
 * declares each one with a field, as plain data, so an app's admin can read
 * the definitions as JSON (`livrea pack` writes them to settings.json) and
 * build its form from them: one kind of input per kind of field.
 *
 *   export const settings = defineSettings({
 *     accent: field.color({ label: { en: 'Accent' }, default: '#c9a96e' }),
 *     showClock: field.toggle({ label: { en: 'Show the clock' }, default: true })
 *   });
 *
 * The app sends the chosen values in its store, under `settings`; theme code
 * reads them as `this.settings.accent`, always valid: a value that's missing
 * or doesn't fit its field reads as the default.
 */

/** Text in each of the app's languages, by the codes the app uses ("en", "IT"…). */
export type LocalizedText = Readonly<Record<string, string>>;

interface FieldBase<K extends string, V> {
  readonly kind: K;
  readonly label: LocalizedText;
  /** One line under the input. */
  readonly help?: LocalizedText;
  readonly default: V;
}

/** A colour, as #rrggbb. Also a CSS variable: --setting-<name>. */
export interface ColorField extends FieldBase<'color', string> {}

/** Text, the same in every language. */
export interface TextField extends FieldBase<'text', string> {
  readonly multiline?: boolean;
  readonly maxLength?: number;
}

/** Text in each language; languages left empty read as the default's. */
export interface LocalizedTextField extends FieldBase<'localizedText', LocalizedText> {
  readonly multiline?: boolean;
  readonly maxLength?: number;
}

/** One of a few choices. */
export interface SelectField<V extends string = string> extends FieldBase<'select', V> {
  readonly options: readonly { readonly value: V; readonly label: LocalizedText }[];
}

export interface ToggleField extends FieldBase<'toggle', boolean> {}

/** A number between `min` and `max`. Also a CSS variable, with its unit. */
export interface RangeField extends FieldBase<'range', number> {
  readonly min: number;
  readonly max: number;
  readonly step: number;
  /** For the CSS variable: "px", "rem", "%"…; none for a plain number. */
  readonly unit?: string;
}

/** An image the app stores (uploaded in its admin); the value is its address, or null for none. */
export interface ImageField extends FieldBase<'image', string | null> {}

/** Any of the seven scalar setting fields. */
export type ScalarField = ColorField | TextField | LocalizedTextField | SelectField | ToggleField | RangeField | ImageField;

/** One block instance inside a slot's block tree. */
export interface BlockNode {
  readonly block: string;
  readonly props?: Readonly<Record<string, unknown>>;
  readonly slots?: Readonly<Record<string, readonly BlockNode[]>>;
}

/** A slot's block tree: which blocks sit in it, their field values, and their inner slots. */
export interface BlocksField extends FieldBase<'blocks', readonly BlockNode[]> {
  /** Which block ids may be placed at the root of this slot; any known block if omitted. */
  readonly allowed?: readonly string[];
}

/** A block's schema in settings.json: its label, its own fields, and its inner slot names. */
export interface BlockSchema {
  readonly label: LocalizedText;
  readonly fields?: Readonly<Record<string, ScalarField>>;
  readonly slots?: readonly string[];
}

/** A pre-assembled tree of blocks that unpacks into a slot. */
export interface PatternDefinition {
  readonly id: string;
  readonly label: LocalizedText;
  /** The `blocks` setting or slot name this pattern is meant for. */
  readonly for?: string;
  /** Alias for `for`. */
  readonly targetSlot?: string;
  readonly tree: readonly BlockNode[];
}

export type Field = ScalarField | BlocksField;

export type SettingsSchema = Readonly<Record<string, Field>>;

/** The values a schema's fields hold. */
export type SettingsValues<S extends SettingsSchema> = { readonly [K in keyof S]: S[K]['default'] };

type Options<F extends Field> = Omit<F, 'kind'>;

/** The fields a setting can be. */
export const field = {
  color: (options: Options<ColorField>): ColorField => ({ kind: 'color', ...options }),
  text: (options: Omit<Options<TextField>, 'default'> & { default?: string }): TextField => ({ kind: 'text', default: '', ...options }),
  localizedText: (options: Omit<Options<LocalizedTextField>, 'default'> & { default?: LocalizedText }): LocalizedTextField => ({
    kind: 'localizedText',
    default: {},
    ...options
  }),
  select: <const V extends string>(options: Options<SelectField<V>>): SelectField<V> => ({ kind: 'select', ...options }),
  toggle: (options: Omit<Options<ToggleField>, 'default'> & { default?: boolean }): ToggleField => ({ kind: 'toggle', default: false, ...options }),
  range: (options: Options<RangeField>): RangeField => ({ kind: 'range', ...options }),
  image: (options: Omit<Options<ImageField>, 'default'> & { default?: string | null }): ImageField => ({ kind: 'image', default: null, ...options }),
  blocks: (options: Omit<Options<BlocksField>, 'default'> & { default?: readonly BlockNode[] }): BlocksField => ({
    kind: 'blocks',
    default: [],
    ...options
  })
};

const NAME = /^[a-zA-Z][a-zA-Z0-9]*$/;
const BLOCK_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;

/** Checks a pattern definition at build time. */
export function definePattern(pattern: PatternDefinition): PatternDefinition {
  if (!BLOCK_ID.test(pattern.id)) {
    throw new Error(`The pattern "${pattern.id}" needs an id of lowercase letters, digits and dashes, e.g. "welcome-split".`);
  }
  if (!pattern.label || !Object.keys(pattern.label).length) {
    throw new Error(`The pattern "${pattern.id}" needs a label.`);
  }
  if (!isBlockNodeList(pattern.tree)) {
    throw new Error(`The pattern "${pattern.id}" has an invalid block tree.`);
  }
  const target = pattern.for ?? pattern.targetSlot;
  return target ? { ...pattern, for: target } : pattern;
}

/** A theme's settings. Checks the definitions themselves, so a mistake shows when the theme is built, not in the admin. */
export function defineSettings<const S extends SettingsSchema>(schema: S): S {
  for (const [name, definition] of Object.entries(schema)) {
    const where = `The setting "${name}"`;
    if (!NAME.test(name)) throw new Error(`${where} needs a name of letters and digits, starting with a letter.`);
    if (!definition.label || !Object.keys(definition.label).length) throw new Error(`${where} needs a label.`);
    if (definition.kind === 'select' && !definition.options.some((option) => option.value === definition.default)) {
      throw new Error(`${where} defaults to "${definition.default}", which isn't one of its options.`);
    }
    if (definition.kind === 'range' && !(definition.min <= definition.default && definition.default <= definition.max && definition.step > 0)) {
      throw new Error(`${where} needs min ≤ default ≤ max and a step above 0.`);
    }
    if (definition.kind === 'blocks' && definition.allowed && !definition.allowed.every((id) => BLOCK_ID.test(id))) {
      throw new Error(`${where} has an invalid block id in allowed.`);
    }
    if (!fits(definition, definition.default)) throw new Error(`${where} has a default that doesn't fit its field.`);
  }
  return schema;
}

function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isBlockNodeList(value: unknown, allowed?: readonly string[], depth = 0): value is readonly BlockNode[] {
  if (depth > 32 || !Array.isArray(value)) return false;
  return value.every((item) => {
    if (!isPlainObject(item)) return false;
    if (typeof item.block !== 'string' || !BLOCK_ID.test(item.block)) return false;
    if (allowed && !allowed.includes(item.block)) return false;
    if (item.props !== undefined && !isPlainObject(item.props)) return false;
    if (item.slots !== undefined) {
      if (!isPlainObject(item.slots)) return false;
      for (const [slotName, children] of Object.entries(item.slots)) {
        if (!NAME.test(slotName) || !isBlockNodeList(children, undefined, depth + 1)) return false;
      }
    }
    return true;
  });
}

/** Whether a value can stand for this field. */
export function fits(definition: Field, value: unknown): boolean {
  switch (definition.kind) {
    case 'color':
      return typeof value === 'string' && COLOR.test(value);
    case 'text':
      return typeof value === 'string' && value.length <= (definition.maxLength ?? Infinity);
    case 'localizedText':
      return (
        isPlainObject(value) &&
        Object.values(value).every((text) => typeof text === 'string' && text.length <= (definition.maxLength ?? Infinity))
      );
    case 'select':
      return definition.options.some((option) => option.value === value);
    case 'toggle':
      return typeof value === 'boolean';
    case 'range':
      return typeof value === 'number' && Number.isFinite(value) && value >= definition.min && value <= definition.max;
    case 'image':
      return value === null || (typeof value === 'string' && value.length > 0);
    case 'blocks':
      return isBlockNodeList(value, definition.allowed);
  }
}

function resolveBlockTree(
  nodes: readonly BlockNode[],
  blocks: Readonly<Record<string, BlockSchema>> | undefined,
  allowed: readonly string[] | undefined,
  depth = 0
): readonly BlockNode[] {
  if (depth > 32) return [];
  const out: BlockNode[] = [];
  for (const node of nodes) {
    if (allowed && !allowed.includes(node.block)) continue;
    if (blocks && !Object.hasOwn(blocks, node.block)) continue;
    const schema = blocks?.[node.block];
    const props = schema?.fields ? resolveSettings(schema.fields, node.props) : (node.props ?? {});
    let slots: Record<string, readonly BlockNode[]> | undefined;
    if (schema?.slots?.length) {
      slots = {};
      for (const slotName of schema.slots) {
        const rawChildren = node.slots?.[slotName];
        slots[slotName] = Array.isArray(rawChildren) && isBlockNodeList(rawChildren, undefined, depth + 1)
          ? resolveBlockTree(rawChildren, blocks, undefined, depth + 1)
          : [];
      }
    } else if (!schema && node.slots) {
      slots = {};
      for (const [slotName, rawChildren] of Object.entries(node.slots)) {
        slots[slotName] = resolveBlockTree(rawChildren, blocks, undefined, depth + 1);
      }
    }
    out.push(slots ? { block: node.block, props, slots } : { block: node.block, props });
  }
  return out;
}

/** One field's value: the app's if it fits, else the default. A localized text keeps the default's languages the app left empty. */
export function resolveSetting(definition: Field, value: unknown, blocks?: Readonly<Record<string, BlockSchema>>): unknown {
  if (definition.kind === 'blocks') {
    const source = fits(definition, value) ? (value as readonly BlockNode[]) : definition.default;
    return resolveBlockTree(source, blocks, definition.allowed);
  }
  if (!fits(definition, value)) return definition.default;
  if (definition.kind === 'localizedText') {
    const given = Object.fromEntries(Object.entries(value as LocalizedText).filter(([, text]) => text !== ''));
    return { ...definition.default, ...given };
  }
  return value;
}

/** Every field's value, from what the app sent. */
export function resolveSettings<S extends SettingsSchema>(
  schema: S,
  values: unknown,
  blocks?: Readonly<Record<string, BlockSchema>>
): SettingsValues<S> {
  const given = values !== null && typeof values === 'object' ? (values as Record<string, unknown>) : {};
  return Object.fromEntries(
    Object.entries(schema).map(([name, definition]) => [name, resolveSetting(definition, given[name], blocks)])
  ) as SettingsValues<S>;
}

/** The version of settings.json's format. */
export const SETTINGS_FORMAT = 1;

/** The JSON schema emitted to settings.json by `livrea pack` and consumed by `@livrea/ui`. */
export interface SettingsJson {
  readonly format: number;
  readonly fields: SettingsSchema;
  readonly blocks?: Readonly<Record<string, BlockSchema>>;
  readonly patterns?: Readonly<Record<string, PatternDefinition>>;
}

export interface SettingsJsonOptions {
  readonly blocks?:
    | Readonly<Record<string, BlockSchema | { readonly id?: string; readonly schema: BlockSchema }>>
    | readonly { readonly id: string; readonly schema: BlockSchema }[];
  readonly patterns?: Readonly<Record<string, PatternDefinition>> | readonly PatternDefinition[];
}

export function normalizeBlockSchemas(
  input: SettingsJsonOptions['blocks']
): Readonly<Record<string, BlockSchema>> | undefined {
  if (!input) return undefined;
  const out: Record<string, BlockSchema> = {};
  if (Array.isArray(input)) {
    for (const item of input) out[item.id] = item.schema;
  } else {
    for (const [key, item] of Object.entries(input)) {
      if ('schema' in item && item.schema && typeof item.schema === 'object' && 'label' in item.schema) {
        const id = typeof item.id === 'string' ? item.id : key;
        out[id] = item.schema;
      } else {
        out[key] = item as BlockSchema;
      }
    }
  }
  return Object.keys(out).length ? out : undefined;
}

export function normalizePatterns(
  input: SettingsJsonOptions['patterns']
): Readonly<Record<string, PatternDefinition>> | undefined {
  if (!input) return undefined;
  const out: Record<string, PatternDefinition> = {};
  if (Array.isArray(input)) {
    for (const item of input) out[item.id] = definePattern(item);
  } else {
    for (const [key, item] of Object.entries(input)) {
      const normalized = definePattern(item);
      out[normalized.id || key] = normalized;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

/** What `livrea pack` writes to settings.json, for an admin or `@livrea/ui` to build its editor from. */
export function settingsJson(schema: SettingsSchema, options: SettingsJsonOptions = {}): SettingsJson {
  const blocks = normalizeBlockSchemas(options.blocks);
  const patterns = normalizePatterns(options.patterns);
  return {
    format: SETTINGS_FORMAT,
    fields: schema,
    ...(blocks ? { blocks } : {}),
    ...(patterns ? { patterns } : {})
  };
}

/** The CSS variables of the colour and range settings: `--setting-accent: #c9a96e;`. */
export function settingsCss(schema: SettingsSchema, values: Readonly<Record<string, unknown>>): string {
  const lines = Object.entries(schema).flatMap(([name, definition]) => {
    const variable = `--setting-${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
    const value = values[name];
    if (definition.kind === 'color') return [`  ${variable}: ${String(value)};`];
    if (definition.kind === 'range') return [`  ${variable}: ${String(value)}${definition.unit ?? ''};`];
    return [];
  });
  return lines.length ? `:root {\n${lines.join('\n')}\n}` : '';
}
