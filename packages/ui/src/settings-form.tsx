import type { Field, LocalizedText, ScalarField } from 'livrea';
import { localize } from './tree-ops.js';

export interface SettingsFormProps {
  /** Scalar fields from `settings.json` (`schema.fields` or `schema.blocks[id].fields`). */
  readonly fields: Readonly<Record<string, Field>>;
  /** Current values for those fields. */
  readonly values: Readonly<Record<string, unknown>>;
  /** Called whenever a field value is edited. */
  readonly onChange: (nextValues: Record<string, unknown>) => void;
  /** UI language for labels and help text; `"en"` by default. */
  readonly locale?: string;
  /** Language codes to show inputs for in `localizedText` fields; derived from default keys and `locale` if omitted. */
  readonly languages?: readonly string[];
  /** Optional media library hook for `image` fields. */
  readonly onPickImage?: (
    currentValue: string | null,
    fieldName: string
  ) => Promise<string | null | undefined> | string | null | undefined;
}

/**
 * Renders the 7 scalar `field.*` input controls (`color`, `text`, `localizedText`,
 * `select`, `toggle`, `range`, `image`) from `settings.json`.
 */
export function SettingsForm({
  fields,
  values,
  onChange,
  locale = 'en',
  languages,
  onPickImage
}: SettingsFormProps) {
  const setField = (name: string, nextValue: unknown) => {
    onChange({ ...values, [name]: nextValue });
  };

  const scalarEntries = Object.entries(fields).filter(
    (entry): entry is [string, ScalarField] => entry[1].kind !== 'blocks'
  );
  if (!scalarEntries.length) {
    return <p className="livrea-ui-help">No configurable fields.</p>;
  }

  return (
    <div className="livrea-ui-form" role="form" aria-label="Settings">
      {scalarEntries.map(([name, definition]) => {
        const label = localize(definition.label, locale, name);
        const help = localize(definition.help, locale);
        const raw = values[name] !== undefined ? values[name] : definition.default;

        switch (definition.kind) {
          case 'color': {
            const colorValue = typeof raw === 'string' ? raw : definition.default;
            return (
              <div key={name} className="livrea-ui-field">
                <label className="livrea-ui-label" htmlFor={`livrea-field-${name}`}>
                  <span>{label}</span>
                  <code>{colorValue}</code>
                </label>
                <input
                  id={`livrea-field-${name}`}
                  className="livrea-ui-input"
                  type="color"
                  aria-label={label}
                  value={colorValue}
                  onChange={(event) => setField(name, event.target.value)}
                />
                {help ? <span className="livrea-ui-help">{help}</span> : null}
              </div>
            );
          }

          case 'text': {
            const textValue = typeof raw === 'string' ? raw : definition.default;
            return (
              <div key={name} className="livrea-ui-field">
                <label className="livrea-ui-label" htmlFor={`livrea-field-${name}`}>
                  {label}
                </label>
                {definition.multiline ? (
                  <textarea
                    id={`livrea-field-${name}`}
                    className="livrea-ui-textarea"
                    aria-label={label}
                    maxLength={definition.maxLength}
                    value={textValue}
                    onChange={(event) => setField(name, event.target.value)}
                  />
                ) : (
                  <input
                    id={`livrea-field-${name}`}
                    className="livrea-ui-input"
                    type="text"
                    aria-label={label}
                    maxLength={definition.maxLength}
                    value={textValue}
                    onChange={(event) => setField(name, event.target.value)}
                  />
                )}
                {help ? <span className="livrea-ui-help">{help}</span> : null}
              </div>
            );
          }

          case 'localizedText': {
            const mapValue: LocalizedText =
              raw !== null && typeof raw === 'object' && !Array.isArray(raw)
                ? { ...definition.default, ...(raw as LocalizedText) }
                : definition.default;
            const codes = languages?.length
              ? languages
              : Array.from(new Set([locale, ...Object.keys(definition.default), ...Object.keys(mapValue)]));
            return (
              <fieldset key={name} className="livrea-ui-field">
                <legend className="livrea-ui-label">{label}</legend>
                {codes.map((code) => (
                  <div key={code} className="livrea-ui-field">
                    <label className="livrea-ui-help" htmlFor={`livrea-field-${name}-${code}`}>
                      {code.toUpperCase()}
                    </label>
                    <input
                      id={`livrea-field-${name}-${code}`}
                      className="livrea-ui-input"
                      type="text"
                      aria-label={`${label} (${code})`}
                      maxLength={definition.maxLength}
                      value={mapValue[code] ?? ''}
                      onChange={(event) => setField(name, { ...mapValue, [code]: event.target.value })}
                    />
                  </div>
                ))}
                {help ? <span className="livrea-ui-help">{help}</span> : null}
              </fieldset>
            );
          }

          case 'select': {
            const selected = typeof raw === 'string' ? raw : definition.default;
            return (
              <div key={name} className="livrea-ui-field">
                <label className="livrea-ui-label" htmlFor={`livrea-field-${name}`}>
                  {label}
                </label>
                <select
                  id={`livrea-field-${name}`}
                  className="livrea-ui-select"
                  aria-label={label}
                  value={selected}
                  onChange={(event) => setField(name, event.target.value)}
                >
                  {definition.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {localize(option.label, locale, option.value)}
                    </option>
                  ))}
                </select>
                {help ? <span className="livrea-ui-help">{help}</span> : null}
              </div>
            );
          }

          case 'toggle': {
            const checked = typeof raw === 'boolean' ? raw : definition.default;
            return (
              <div key={name} className="livrea-ui-field">
                <label className="livrea-ui-label" htmlFor={`livrea-field-${name}`}>
                  <span>{label}</span>
                  <input
                    id={`livrea-field-${name}`}
                    type="checkbox"
                    aria-label={label}
                    checked={checked}
                    onChange={(event) => setField(name, event.target.checked)}
                  />
                </label>
                {help ? <span className="livrea-ui-help">{help}</span> : null}
              </div>
            );
          }

          case 'range': {
            const numberValue = typeof raw === 'number' && Number.isFinite(raw) ? raw : definition.default;
            return (
              <div key={name} className="livrea-ui-field">
                <label className="livrea-ui-label" htmlFor={`livrea-field-${name}`}>
                  <span>{label}</span>
                  <span>
                    {numberValue}
                    {definition.unit ?? ''}
                  </span>
                </label>
                <input
                  id={`livrea-field-${name}`}
                  type="range"
                  aria-label={label}
                  min={definition.min}
                  max={definition.max}
                  step={definition.step}
                  value={numberValue}
                  onChange={(event) => setField(name, Number(event.target.value))}
                />
                {help ? <span className="livrea-ui-help">{help}</span> : null}
              </div>
            );
          }

          case 'image': {
            const imageValue = typeof raw === 'string' ? raw : null;
            return (
              <div key={name} className="livrea-ui-field">
                <label className="livrea-ui-label" htmlFor={`livrea-field-${name}`}>
                  {label}
                </label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    id={`livrea-field-${name}`}
                    className="livrea-ui-input"
                    style={{ flex: 1 }}
                    type="text"
                    aria-label={label}
                    placeholder="https://…"
                    value={imageValue ?? ''}
                    onChange={(event) => setField(name, event.target.value || null)}
                  />
                  {onPickImage ? (
                    <button
                      type="button"
                      className="livrea-ui-button"
                      onClick={async () => {
                        const picked = await onPickImage(imageValue, name);
                        if (picked !== undefined) setField(name, picked);
                      }}
                    >
                      Browse
                    </button>
                  ) : null}
                  {imageValue ? (
                    <button type="button" className="livrea-ui-button" onClick={() => setField(name, null)}>
                      Clear
                    </button>
                  ) : null}
                </div>
                {help ? <span className="livrea-ui-help">{help}</span> : null}
              </div>
            );
          }
        }
      })}
    </div>
  );
}
