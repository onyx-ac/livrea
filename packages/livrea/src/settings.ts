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

export type Field = ColorField | TextField | LocalizedTextField | SelectField | ToggleField | RangeField | ImageField;

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
  image: (options: Omit<Options<ImageField>, 'default'> & { default?: string | null }): ImageField => ({ kind: 'image', default: null, ...options })
};

const NAME = /^[a-zA-Z][a-zA-Z0-9]*$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;

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
    if (!fits(definition, definition.default)) throw new Error(`${where} has a default that doesn't fit its field.`);
  }
  return schema;
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
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
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
  }
}

/** One field's value: the app's if it fits, else the default. A localized text keeps the default's languages the app left empty. */
export function resolveSetting(definition: Field, value: unknown): unknown {
  if (!fits(definition, value)) return definition.default;
  if (definition.kind === 'localizedText') {
    const given = Object.fromEntries(Object.entries(value as LocalizedText).filter(([, text]) => text !== ''));
    return { ...definition.default, ...given };
  }
  return value;
}

/** Every field's value, from what the app sent. */
export function resolveSettings<S extends SettingsSchema>(schema: S, values: unknown): SettingsValues<S> {
  const given = values !== null && typeof values === 'object' ? (values as Record<string, unknown>) : {};
  return Object.fromEntries(Object.entries(schema).map(([name, definition]) => [name, resolveSetting(definition, given[name])])) as SettingsValues<S>;
}

/** The version of settings.json's format. */
export const SETTINGS_FORMAT = 1;

/** What `livrea pack` writes to settings.json, for an admin to build its form from. */
export function settingsJson(schema: SettingsSchema): { format: number; fields: SettingsSchema } {
  return { format: SETTINGS_FORMAT, fields: schema };
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
