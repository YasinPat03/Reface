// Content script B (document_idle) : distillation, preview, picker, health check.
import { listen, type ContentApi } from '../shared/messages';
import { distill, locate } from './distill';
import { investigate, requestMatches } from './investigate';
import { checkHealth, scheduleHealthCheck } from './health';
import { cancelPick, pick, registerPicker } from './picker';
import { registerShortcutOverlay } from './shortcutOverlay';
import { registerShortcutPalette } from './shortcutPalette';
import {
  clearPreview,
  compileChanges,
  isOriginal,
  prepareDraft,
  setOriginal,
  setPreview,
  withoutOurStyles,
} from './preview';

const world = globalThis as typeof globalThis & { refaceContentRuntime?: typeof chrome.runtime };
if (world.refaceContentRuntime !== chrome.runtime) {
  world.refaceContentRuntime = chrome.runtime;
  registerPicker();
  registerShortcutOverlay();
  registerShortcutPalette();
  listen<ContentApi>({
    async ping() {
      return { host: location.hostname };
    },
    async distill({ include, focus, probe, count, search }) {
      return withoutOurStyles(() => {
        const page = distill(include, focus, { probe, count });
        const matches = search?.length ? requestMatches(search) : '';
        return matches ? { ...page, matches } : page;
      });
    },
    async preparePreview({ recipe, prompts, apply, distillId }) {
      return prepareDraft(recipe, prompts, apply ?? true, distillId);
    },
    async investigate({ distillId, calls }) {
      // La page d'origine, sans nos styles (un seul recalcul pour tout le tour).
      return withoutOurStyles(() => investigate(distillId, calls));
    },
    async locate({ selectors }) {
      return locate(selectors);
    },
    async updatePreview({ changes }) {
      const previewCss = compileChanges(changes);
      setPreview(previewCss);
      return { previewCss };
    },
    async clearPreview() {
      clearPreview();
      return null;
    },
    async currentPreview() {
      return { css: document.getElementById('bp-preview')?.textContent ?? '' };
    },
    pick: () => pick(),
    async cancelPick() {
      cancelPick();
      return null;
    },
    healthCheck: () => checkHealth(0),
    async original({ set }) {
      return { original: set === undefined ? isOriginal() : setOriginal(set) };
    },
  });

  scheduleHealthCheck();
}
