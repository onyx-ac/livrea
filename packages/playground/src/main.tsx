import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import '@astryxdesign/theme-neutral/theme.css';
import { createRoot } from 'react-dom/client';
import { DemoApp } from './app.js';

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(<DemoApp />);
}


