import { useRef, useState } from 'react';
import { Button, TextArea } from '@astryxdesign/core';
import { checkThemeData, type DataField, type DataSchema } from 'livrea';
import { localize } from './tree-ops.js';

const LONG_LIST = 24;
const STATUS = { provided: 'From the app', missing: 'Sample data', invalid: 'Wrong shape' } as const;

/** A long version of a list, for seeing how a theme copes: its items again, with ids that stay different. */
function longList(sample: readonly unknown[]): unknown[] {
  return Array.from({ length: LONG_LIST }, (_, i) => {
    const item = sample[i % sample.length];
    if (item === null || typeof item !== 'object' || !('id' in item)) return item;
    return { ...item, id: i < sample.length ? item.id : `${String(item.id)}-${i}` };
  });
}

/**
 * What the theme reads from the store, and whether the preview shows the app's data or the theme's samples. With
 * `onChange`, samples can be edited, to see the theme with an empty list, a long one, or one of the wrong shape.
 */
export function DataSection({
  schema,
  original,
  provided,
  locale,
  onChange
}: {
  readonly schema: DataSchema | undefined;
  /** The samples as the theme came, for Reset. */
  readonly original: DataSchema | undefined;
  readonly provided: Readonly<Record<string, unknown>>;
  readonly locale: string;
  readonly onChange?: (next: DataSchema) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);
  const appChecks = checkThemeData(schema, provided);
  if (!schema || !appChecks.length) return null;

  const setSample = (name: string, sample: unknown) => {
    onChange?.({ ...schema, [name]: { ...schema[name], sample } as DataField });
  };

  const openEditor = (name: string) => {
    setEditing(name);
    setText(JSON.stringify(schema[name]!.sample, null, 2));
  };

  let parsed: { value: unknown } | null = null;
  let editorProblem: string | undefined;
  if (editing) {
    try {
      parsed = { value: JSON.parse(text) };
      editorProblem = checkThemeData({ [editing]: schema[editing]! }, { [editing]: parsed.value })[0]?.problem;
    } catch {
      editorProblem = "That isn't valid JSON.";
    }
  }

  return (
    <div role="group" aria-label="Data" style={{ marginTop: 16 }}>
      <h3 className="livrea-ui-section-title">Data</h3>
      <p className="livrea-ui-help" style={{ marginBottom: 8 }}>
        What this theme reads from the app. Samples only show in this preview: the app has to provide the real data.
      </p>
      <ul className="livrea-ui-data-list">
        {appChecks.map(({ name, status: appStatus, problem: appProblem }) => {
          const definition = schema[name]!;
          const fromApp = appStatus !== 'missing';
          const sampleProblem = fromApp ? undefined : checkThemeData({ [name]: definition }, { [name]: definition.sample })[0]?.problem;
          const status = fromApp ? appStatus : sampleProblem ? 'invalid' : 'missing';
          const problem = appProblem ?? sampleProblem;
          const shown = appStatus === 'provided' ? provided[name] : definition.sample;
          const count = definition.kind === 'list' && Array.isArray(shown) ? shown.length : null;
          const isEdited = !fromApp && original?.[name] !== undefined && original[name]!.sample !== definition.sample;
          const canEdit = onChange !== undefined && !fromApp;
          return (
            <li key={name} className="livrea-ui-data-item" data-status={status}>
              <div className="livrea-ui-data-row">
                <span title={name}>{localize(definition.label, locale, name)}</span>
                <span className="livrea-ui-data-status">
                  {STATUS[status]}
                  {count !== null ? ` · ${count}` : ''}
                  {isEdited ? ' · edited' : ''}
                </span>
              </div>
              {problem ? <p className="livrea-ui-help">{problem}</p> : definition.help ? <p className="livrea-ui-help">{localize(definition.help, locale)}</p> : null}
              {canEdit && editing !== name ? (
                <div className="livrea-ui-data-actions">
                  <Button label="Edit" aria-label={`Edit ${name}`} variant="ghost" size="sm" onClick={() => openEditor(name)} />
                  {definition.kind === 'list' ? (
                    <>
                      <Button label="Empty" aria-label={`Empty ${name}`} variant="ghost" size="sm" isDisabled={count === 0} onClick={() => setSample(name, [])} />
                      <Button
                        label="Long"
                        aria-label={`Long ${name}`}
                        variant="ghost"
                        size="sm"
                        isDisabled={!Array.isArray(shown) || shown.length === 0 || shown.length >= LONG_LIST}
                        onClick={() => setSample(name, longList(shown as readonly unknown[]))}
                      />
                    </>
                  ) : null}
                  {isEdited ? <Button label="Reset" aria-label={`Reset ${name}`} variant="ghost" size="sm" onClick={() => setSample(name, original![name]!.sample)} /> : null}
                </div>
              ) : null}
              {editing === name ? (
                <div className="livrea-ui-data-editor">
                  <TextArea label={`Sample for ${name}, as JSON`} isLabelHidden value={text} onChange={setText} size="sm" width="100%" />
                  {editorProblem ? (
                    <p role="alert" className="livrea-ui-help" data-problem="">
                      {editorProblem}
                    </p>
                  ) : null}
                  <div className="livrea-ui-data-actions">
                    <Button
                      label={editorProblem && parsed ? 'Apply anyway' : 'Apply'}
                      variant="secondary"
                      size="sm"
                      isDisabled={!parsed}
                      onClick={() => {
                        if (!parsed) return;
                        setSample(name, parsed.value);
                        setEditing(null);
                      }}
                    />
                    <Button label="Load file" variant="ghost" size="sm" onClick={() => fileRef.current?.click()} />
                    <Button label="Cancel" variant="ghost" size="sm" onClick={() => setEditing(null)} />
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".json,application/json"
                    aria-label={`Load a JSON file for ${name}`}
                    hidden
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = '';
                      if (file) void file.text().then(setText);
                    }}
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
