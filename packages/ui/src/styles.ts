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

.livrea-ui-data-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.livrea-ui-data-item {
  padding: 6px 8px;
  border: 1px solid var(--livrea-ui-border);
  border-radius: var(--livrea-ui-radius);
}
.livrea-ui-data-item[data-status='invalid'] {
  border-color: var(--livrea-ui-danger);
}
.livrea-ui-data-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.livrea-ui-data-status {
  color: var(--livrea-ui-muted);
  font-size: 11px;
  white-space: nowrap;
}
.livrea-ui-data-item[data-status='provided'] .livrea-ui-data-status {
  color: var(--livrea-ui-accent);
}
.livrea-ui-data-item[data-status='invalid'] .livrea-ui-data-status {
  color: var(--livrea-ui-danger);
}

.livrea-ui-canvas-content {
  position: relative;
  min-height: 100%;
  isolation: isolate;
}

/* Room for a block in an empty slot, only while editing: the same whether it shows or not, so nothing jumps. */
.livrea-ui-slot-room {
  min-height: 56px;
}
.livrea-ui-slot-room[data-livrea-empty='line'] {
  min-height: 12px;
}
.livrea-ui-canvas-content[data-mode='preview'] .livrea-ui-slot-room {
  display: none;
}

.livrea-ui-editor {
  position: absolute;
  inset: 0;
  z-index: 1;
  outline: none;
  cursor: default;
  user-select: none;
  /* A finger scrolls the page; the mouse selects and drags. */
  touch-action: pan-x pan-y;
}
.livrea-ui-editor[data-dragging] {
  cursor: grabbing;
  touch-action: none;
}
.livrea-ui-editor-outline {
  position: absolute;
  box-sizing: border-box;
  pointer-events: none;
}
.livrea-ui-editor-outline[data-kind='hover'] {
  outline: 1px dashed var(--livrea-ui-accent);
  outline-offset: -1px;
}
.livrea-ui-editor-outline[data-kind='selected'] {
  outline: 2px solid var(--livrea-ui-accent);
  outline-offset: -2px;
}
.livrea-ui-editor-outline[data-kind='dragged'] {
  background: color-mix(in srgb, var(--livrea-ui-bg) 55%, transparent);
  outline: 1px dashed var(--livrea-ui-muted);
  outline-offset: -1px;
}
.livrea-ui-editor-tag,
.livrea-ui-editor-ghost {
  background: var(--livrea-ui-accent);
  color: #111318;
  font: 600 11px/1 var(--livrea-ui-font);
  padding: 4px 6px;
  border-radius: 4px;
  white-space: nowrap;
}
.livrea-ui-editor-tag {
  position: absolute;
  left: 0;
  top: 0;
  border-radius: 0 0 4px 0;
}
.livrea-ui-editor-ghost {
  position: absolute;
  pointer-events: none;
  z-index: 3;
}
.livrea-ui-editor-line {
  position: absolute;
  z-index: 2;
  pointer-events: none;
  box-shadow: 0 0 0 2px var(--livrea-ui-accent);
  border-radius: 2px;
}
.livrea-ui-editor-room {
  position: absolute;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed var(--livrea-ui-accent);
  border-radius: var(--livrea-ui-radius);
  background: color-mix(in srgb, var(--livrea-ui-accent) 10%, transparent);
  color: var(--livrea-ui-accent);
  font: 600 12px var(--livrea-ui-font);
  cursor: pointer;
}
button.livrea-ui-editor-room:hover {
  background: color-mix(in srgb, var(--livrea-ui-accent) 22%, transparent);
}
.livrea-ui-editor-room[data-target] {
  background: color-mix(in srgb, var(--livrea-ui-accent) 35%, transparent);
  border-style: solid;
}
/* An empty slot beside filled ones: a line through its room, and a small + on it. */
.livrea-ui-editor-room-line {
  position: absolute;
  pointer-events: none;
  display: flex;
  align-items: center;
  justify-content: center;
}
.livrea-ui-editor-room-line::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  border-top: 1px dashed var(--livrea-ui-accent);
}
.livrea-ui-editor-room-line[data-append] {
  z-index: 2;
}
.livrea-ui-editor-room-line[data-vertical]::before {
  left: 50%;
  right: auto;
  top: 0;
  bottom: 0;
  border-top: 0;
  border-left: 1px dashed var(--livrea-ui-accent);
}
.livrea-ui-editor-room-line[data-target]::before {
  border-top: 3px solid var(--livrea-ui-accent);
  margin-top: -1px;
}
.livrea-ui-editor-room-line button {
  all: unset;
  position: relative;
  box-sizing: border-box;
  width: 20px;
  height: 20px;
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--livrea-ui-accent);
  color: #111318;
  font: 700 14px/1 var(--livrea-ui-font);
  cursor: pointer;
  pointer-events: auto;
}
.livrea-ui-editor-room-line button:hover,
.livrea-ui-editor-room-line button:focus-visible {
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--livrea-ui-accent) 35%, transparent);
}

.livrea-ui-editor-toolbar {
  position: absolute;
  left: -2px;
  bottom: 100%;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px 4px;
  margin-bottom: 2px;
  border-radius: var(--livrea-ui-radius);
  background: var(--livrea-ui-accent);
  color: #111318;
  font: 600 11px/1 var(--livrea-ui-font);
  white-space: nowrap;
  pointer-events: auto;
}
.livrea-ui-editor-toolbar[data-inside] {
  bottom: auto;
  top: 4px;
  left: 4px;
  margin-bottom: 0;
}
.livrea-ui-editor-toolbar button {
  all: unset;
  box-sizing: border-box;
  min-width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  cursor: pointer;
}
.livrea-ui-editor-toolbar button:hover,
.livrea-ui-editor-toolbar button:focus-visible {
  background: rgba(0, 0, 0, 0.18);
}
.livrea-ui-editor-toolbar button[data-danger]:hover {
  background: var(--livrea-ui-danger);
  color: #fff;
}
/* After the toolbar's buttons, and as specific: their all: unset would give a finger on the grip back to scrolling. */
.livrea-ui-editor-toolbar .livrea-ui-editor-grip {
  cursor: grab;
  touch-action: none;
}
.livrea-ui-editor-name {
  padding: 0 6px 0 2px;
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

