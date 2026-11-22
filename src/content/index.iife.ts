// Content script B (document_idle) : distillation, preview, picker, health check.
import { listen, type ContentApi } from '../shared/messages';
import { distill } from './distill';
import { checkHealth, scheduleHealthCheck } from './health';
import { cancelPick, pick } from './picker';
import './shortcutOverlay';
import './shortcutPalette';
import {
  clearPreview,
  compileChanges,
  isOriginal,
  prepareDraft,
  setOriginal,
  setPreview,
  withoutOurStyles,
} from './preview';

listen<ContentApi>({
  async ping() {
    return { host: location.hostname };
  },
  async distill({ include, focus }) {
    return withoutOurStyles(() => distill(include, focus));
  },
  async preparePreview({ recipe, prompts }) {
    return prepareDraft(recipe, prompts);
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
