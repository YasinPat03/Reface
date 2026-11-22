import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json' with { type: 'json' };

export default defineManifest({
  manifest_version: 3,
  name: 'ReFace',
  version: pkg.version,
  description: 'Change any website with a prompt. Your changes are replayed instantly.',
  minimum_chrome_version: '116',
  icons: {
    16: 'icons/icon16.png',
    32: 'icons/icon32.png',
    48: 'icons/icon48.png',
    128: 'icons/icon128.png',
  },
  action: {
    default_title: 'Open ReFace',
    default_icon: { 16: 'icons/icon16.png', 32: 'icons/icon32.png' },
  },
  permissions: ['storage', 'unlimitedStorage', 'sidePanel', 'scripting', 'activeTab'],
  host_permissions: ['<all_urls>'],
  background: { service_worker: 'src/background/index.ts', type: 'module' },
  side_panel: { default_path: 'src/panel/index.html' },
  options_page: 'src/options/index.html',
  commands: {
    // ⌘⇧E : libre dans Chrome et macOS (listes officielles vérifiées). Modifiable dans
    // chrome://extensions/shortcuts. Voir src/background/shortcutHotkey.ts.
    'record-shortcut': {
      suggested_key: { default: 'Ctrl+Shift+E', mac: 'Command+Shift+E' },
      description: 'Shortcut: start recording, then save the page reached',
    },
    // ⌘⇧X : l'autre lettre libre à la fois dans Chrome et macOS.
    'open-shortcuts': {
      suggested_key: { default: 'Ctrl+Shift+X', mac: 'Command+Shift+X' },
      description: 'Shortcuts: show or close the list of the site’s shortcuts',
    },
  },
  content_scripts: [
    {
      matches: ['http://*/*', 'https://*/*'],
      js: ['src/injector/index.iife.ts'],
      run_at: 'document_start',
      all_frames: false,
    },
    {
      matches: ['http://*/*', 'https://*/*'],
      js: ['src/content/index.iife.ts'],
      run_at: 'document_idle',
    },
  ],
});
