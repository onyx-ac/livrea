import type * as Preset from '@docusaurus/preset-classic';
import type { Config } from '@docusaurus/types';
import { themes as prismThemes } from 'prism-react-renderer';

const config: Config = {
  title: 'Livrea',
  tagline: 'Themes for React apps, written as classes, run in a sandbox.',
  url: 'https://onyx-ac.github.io',
  baseUrl: '/livrea/',
  organizationName: 'onyx-ac',
  projectName: 'livrea',
  onBrokenLinks: 'throw',
  markdown: { hooks: { onBrokenMarkdownLinks: 'throw' } },
  i18n: { defaultLocale: 'en', locales: ['en'] },
  presets: [
    [
      'classic',
      {
        docs: {
          routeBasePath: '/',
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/onyx-ac/livrea/tree/main/packages/docs/'
        },
        blog: false,
        theme: { customCss: './src/css/custom.css' }
      } satisfies Preset.Options
    ]
  ],
  themeConfig: {
    navbar: {
      title: 'Livrea',
      items: [
        { type: 'docSidebar', sidebarId: 'docs', position: 'left', label: 'Docs' },
        { href: 'pathname:///livrea/demo/index.html', label: 'Playground', position: 'left' },
        { href: 'https://github.com/onyx-ac/livrea', label: 'GitHub', position: 'right' }
      ]
    },
    footer: {
      style: 'dark',
      copyright: `© ${new Date().getFullYear()} Onyx AC, LLC. Licensed under CC BY-SA 4.0.`
    },
    prism: { theme: prismThemes.github, darkTheme: prismThemes.dracula, additionalLanguages: ['bash', 'json'] }
  } satisfies Preset.ThemeConfig
};

export default config;
