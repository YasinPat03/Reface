// Content script B (document_idle) : distillation, preview, picker, health check.
import { listen, type ContentApi } from '../shared/messages';
import { distill } from './distill';
import { clearPreview, prepareDraft, withoutOurStyles } from './preview';

listen<ContentApi>({
  async ping() {
    return { host: location.hostname };
  },
  async distill({ include }) {
    return withoutOurStyles(() => distill(include));
  },
  async preparePreview({ recipe, prompts }) {
    return prepareDraft(recipe, prompts);
  },
  async clearPreview() {
    clearPreview();
    return null;
  },
});
