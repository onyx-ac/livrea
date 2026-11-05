import { Button, Selector, Slider, Switch, TextArea, TextInput } from '@astryxdesign/core';
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
 * `select`, `toggle`, `range`, `image`) from `settings.json` using Astryx components.
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    id={`livrea-field-${name}`}
                    type="color"
                    aria-label={label}
                    value={colorValue}
                    onChange={(event) => setField(name, event.target.value)}
                    style={{
                      width: 28,
                      height: 28,
                      padding: 0,
                      border: 'none',
                      borderRadius: 4,
                      cursor: 'pointer',
                      background: 'transparent'
                    }}
                  />
                  <TextInput
                    label={label}
                    description={help}
                    value={colorValue}
                    onChange={(val) => setField(name, val)}
                    size="sm"
                    width="100%"
                  />
                </div>
              </div>
            );
          }

          case 'text': {
            const textValue = typeof raw === 'string' ? raw : definition.default;
            return (
              <div key={name} className="livrea-ui-field">
                {definition.multiline ? (
                  <TextArea
                    label={label}
                    description={help}
                    maxLength={definition.maxLength}
                    value={textValue}
                    onChange={(val) => setField(name, val)}
                    size="sm"
                    width="100%"
                  />
                ) : (
                  <TextInput
                    label={label}
                    description={help}
                    value={textValue}
                    onChange={(val) =>
                      setField(name, definition.maxLength ? val.slice(0, definition.maxLength) : val)
                    }
                    size="sm"
                    width="100%"
                  />
                )}
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
              <fieldset key={name} className="livrea-ui-field" style={{ border: 'none', padding: 0, margin: 0 }}>
                <legend className="livrea-ui-label">{label}</legend>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {codes.map((code) => (
                    <TextInput
                      key={code}
                      label={`${label} (${code.toUpperCase()})`}
                      value={mapValue[code] ?? ''}
                      onChange={(val) =>
                        setField(name, {
                          ...mapValue,
                          [code]: definition.maxLength ? val.slice(0, definition.maxLength) : val
                        })
                      }
                      size="sm"
                      width="100%"
                    />
                  ))}
                </div>
                {help ? <span className="livrea-ui-help">{help}</span> : null}
              </fieldset>
            );
          }

          case 'select': {
            const selected = typeof raw === 'string' ? raw : definition.default;
            return (
              <div key={name} className="livrea-ui-field">
                <Selector
                  label={label}
                  description={help}
                  options={definition.options.map((option) => ({
                    value: option.value,
                    label: localize(option.label, locale, option.value)
                  }))}
                  value={selected}
                  onChange={(val) => setField(name, val)}
                  size="sm"
                  width="100%"
                />
              </div>
            );
          }

          case 'toggle': {
            const checked = typeof raw === 'boolean' ? raw : definition.default;
            return (
              <div key={name} className="livrea-ui-field">
                <Switch
                  label={label}
                  description={help}
                  value={checked}
                  onChange={(val) => setField(name, val)}
                  size="sm"
                />
              </div>
            );
          }

          case 'range': {
            const numberValue = typeof raw === 'number' && Number.isFinite(raw) ? raw : definition.default;
            return (
              <div key={name} className="livrea-ui-field">
                <Slider
                  label={label}
                  description={help ? `${help} (${numberValue}${definition.unit ?? ''})` : `${numberValue}${definition.unit ?? ''}`}
                  min={definition.min}
                  max={definition.max}
                  step={definition.step}
                  value={numberValue}
                  onChange={(val: number | [number, number]) => setField(name, typeof val === 'number' ? val : val[0])}
                  valueDisplay="text"
                  width="100%"
                />
              </div>
            );
          }

          case 'image': {
            const imageValue = typeof raw === 'string' ? raw : null;
            return (
              <div key={name} className="livrea-ui-field">
                <TextInput
                  label={label}
                  description={help}
                  placeholder="https://…"
                  value={imageValue ?? ''}
                  onChange={(val) => setField(name, val || null)}
                  size="sm"
                  width="100%"
                />
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  {onPickImage ? (
                    <Button
                      label="Browse"
                      variant="secondary"
                      size="sm"
                      onClick={async () => {
                        const picked = await onPickImage(imageValue, name);
                        if (picked !== undefined) setField(name, picked);
                      }}
                    />
                  ) : null}
                  {imageValue ? (
                    <Button
                      label="Clear"
                      variant="secondary"
                      size="sm"
                      onClick={() => setField(name, null)}
                    />
                  ) : null}
                </div>
              </div>
            );
          }
        }
      })}
    </div>
  );
}
