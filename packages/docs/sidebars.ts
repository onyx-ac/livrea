import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docs: [
    'intro',
    { type: 'category', label: 'Themes', collapsed: false, items: ['writing-themes', 'settings', 'blocks-and-patterns', 'packaging'] },
    { type: 'category', label: 'Apps', collapsed: false, items: ['apps', 'sandbox'] }
  ]
};

export default sidebars;
