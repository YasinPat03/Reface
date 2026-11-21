// Content script B (document_idle) : distillation, preview, picker, health check.
import { listen, type ContentApi } from '../shared/messages';

listen<ContentApi>({
  async ping() {
    return { host: location.hostname };
  },
});
