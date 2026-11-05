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
  display: flex;
  flex-direction: row;
  align-items: stretch;
  height: var(--livrea-ui-builder-height, calc(100vh - 160px));
  min-height: 600px;
  max-height: calc(100vh - 80px);
  background: var(--livrea-ui-bg);
  color: var(--livrea-ui-text);
  font-family: var(--livrea-ui-font);
  font-size: 13px;
  border: 1px solid var(--livrea-ui-border);
  border-radius: var(--livrea-ui-radius);
  overflow: hidden;
  position: relative;
  box-sizing: border-box;
}

.livrea-ui-pane-resizable {
  display: flex !important;
  flex-direction: column !important;
  height: 100% !important;
  min-height: 0 !important;
  max-height: 100% !important;
  position: relative;
  flex-shrink: 0;
  box-sizing: border-box;
}

.livrea-ui-pane-left-resizable {
  border-right: 1px solid var(--livrea-ui-border);
}

.livrea-ui-pane-right-resizable {
  border-left: 1px solid var(--livrea-ui-border);
}

.livrea-ui-pane {
  background: var(--livrea-ui-panel-bg);
  padding: 12px;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1 1 0%;
  min-height: 0;
  max-height: 100%;
  box-sizing: border-box;
}

.livrea-ui-pane-left {
  /* Inner content inherits panel layout */
}

.livrea-ui-pane-right {
  /* Inner content inherits panel layout */
}

.livrea-ui-resize-handle {
  z-index: 10;
  transition: background-color 0.15s ease;
}

.livrea-ui-resize-handle:hover,
.livrea-ui-resize-handle:active {
  background-color: var(--livrea-ui-accent);
  opacity: 0.6;
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

.livrea-ui-button:disabled {
  opacity: 0.35;
  cursor: not-allowed;
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
  flex: 1 1 0%;
  min-width: 0;
  min-height: 0;
  height: 100%;
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
  flex-shrink: 0;
}

.livrea-ui-canvas-stage {
  flex: 1 1 0%;
  padding: 16px;
  overflow: auto;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  min-height: 0;
  box-sizing: border-box;
}

.livrea-ui-canvas-frame {
  background: var(--livrea-ui-surface);
  overflow: auto;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
  box-sizing: border-box;
}

.livrea-ui-canvas-frame-resizable {
  box-sizing: border-box;
  display: flex !important;
  flex-direction: column !important;
}

.livrea-ui-canvas-frame-resizable > div[class*="handle-"] {
  z-index: 10;
}
`;

