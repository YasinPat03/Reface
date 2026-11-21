import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json' with { type: 'json' };

export default defineManifest({
  manifest_version: 3,
  name: 'Browser Paint',
  version: pkg.version,
  description:
    'Modifie n’importe quel site avec un prompt. Les modifs sont rejouées instantanément.',
  minimum_chrome_version: '116',
  icons: {
    16: 'icons/icon16.png',
    32: 'icons/icon32.png',
    48: 'icons/icon48.png',
    128: 'icons/icon128.png',
  },
  action: {
    default_title: 'Ouvrir Browser Paint',
    default_icon: { 16: 'icons/icon16.png', 32: 'icons/icon32.png' },
  },
  permissions: ['storage', 'unlimitedStorage', 'sidePanel', 'scripting', 'activeTab'],
  host_permissions: ['<all_urls>'],
  background: { service_worker: 'src/background/index.ts', type: 'module' },
  side_panel: { default_path: 'src/panel/index.html' },
  options_page: 'src/options/index.html',
  content_scripts: [
    {
      matches: ['http://*/*', 'https://*/*'],
      js: ['src/injector/index.iife.ts'],
      run_at: 'document_start',
      all_frames: false,
    },
    {
      matches: ['http://*/*', 'https://*/*'],
      js: ['src/content/index.ts'],
      run_at: 'document_idle',
    },
  ],
});
