/** Default stylesheet for `@livrea/ui`, themeable via `--livrea-ui-*` CSS variables. */
export const BUILDER_STYLES = `
:root {
  --livrea-ui-bg: #111318;
  --livrea-ui-panel-bg: #181b22;
  --livrea-ui-surface: #222631;
  --livrea-ui-border: #2e3340;
  --livrea-ui-text: #f3f4f6;
  --livrea-ui-muted: #9ca3af;
  --livrea-ui-accent: #c9a96e;
  --livrea-ui-danger: #ef4444;
  --livrea-ui-radius: 6px;
  --livrea-ui-font: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.livrea-ui-builder {
  display: grid;
  grid-template-columns: 300px 1fr 320px;
  min-height: 600px;
  background: var(--livrea-ui-bg);
  color: var(--livrea-ui-text);
  font-family: var(--livrea-ui-font);
  font-size: 13px;
  border: 1px solid var(--livrea-ui-border);
  border-radius: var(--livrea-ui-radius);
  overflow: hidden;
}

.livrea-ui-pane {
  background: var(--livrea-ui-panel-bg);
  padding: 12px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.livrea-ui-pane-left {
  border-right: 1px solid var(--livrea-ui-border);
}

.livrea-ui-pane-right {
  border-left: 1px solid var(--livrea-ui-border);
}

.livrea-ui-section-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--livrea-ui-muted);
  margin: 0 0 8px 0;
}

.livrea-ui-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.livrea-ui-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.livrea-ui-label {
  font-weight: 500;
  color: var(--livrea-ui-text);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.livrea-ui-help {
  font-size: 11px;
  color: var(--livrea-ui-muted);
}

.livrea-ui-input,
.livrea-ui-select,
.livrea-ui-textarea,
.livrea-ui-button {
  background: var(--livrea-ui-surface);
  color: var(--livrea-ui-text);
  border: 1px solid var(--livrea-ui-border);
  border-radius: var(--livrea-ui-radius);
  padding: 6px 8px;
  font-size: 13px;
  font-family: inherit;
}

.livrea-ui-button {
  cursor: pointer;
}

.livrea-ui-button-active {
  border-color: var(--livrea-ui-accent);
  color: var(--livrea-ui-accent);
}

.livrea-ui-tree-node {
  border: 1px solid var(--livrea-ui-border);
  border-radius: var(--livrea-ui-radius);
  padding: 8px;
  margin-bottom: 6px;
  background: var(--livrea-ui-surface);
}

.livrea-ui-tree-node-selected {
  border-color: var(--livrea-ui-accent);
}

.livrea-ui-tree-slot {
  margin-top: 6px;
  padding-left: 10px;
  border-left: 2px solid var(--livrea-ui-border);
}

.livrea-ui-canvas {
  display: flex;
  flex-direction: column;
  background: var(--livrea-ui-bg);
  overflow: hidden;
}

.livrea-ui-canvas-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--livrea-ui-panel-bg);
  border-bottom: 1px solid var(--livrea-ui-border);
}

.livrea-ui-canvas-stage {
  flex: 1;
  padding: 16px;
  overflow: auto;
  display: flex;
  justify-content: center;
  align-items: flex-start;
}
`;

