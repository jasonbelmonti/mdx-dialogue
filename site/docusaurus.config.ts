import type { Config } from '@docusaurus/types';
const config: Config = {
  title: 'MDX Dialogue',
  tagline: 'Interactive explanations, carried into documentation',
  url: 'http://127.0.0.1:4317',
  baseUrl: '/docs/',
  trailingSlash: false,
  onBrokenLinks: 'throw',
  presets: [['classic', { docs: false, blog: false, theme: { customCss: './src/custom.css' } }]],
  themeConfig: {
    navbar: {
      title: 'MDX Dialogue',
      items: [
        { to: '/graph', label: 'Graph document', position: 'left' },
        {
          href: 'pathname:///graphs',
          autoAddBaseUrl: false,
          target: '_self',
          label: 'Open studio',
          position: 'right',
        },
      ],
    },
    colorMode: { defaultMode: 'light', disableSwitch: true },
  },
  plugins: [
    function sharedTypescript() {
      return {
        name: 'shared-typescript',
        configureWebpack() {
          return { resolve: { extensionAlias: { '.js': ['.ts', '.tsx', '.js'] } } };
        },
      };
    },
  ],
};
export default config;
