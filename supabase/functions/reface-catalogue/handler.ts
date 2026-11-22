import {
  catalogueEntrySchema,
  publicEntry,
  type CatalogueEntry,
} from '../../../src/shared/catalogueSchema.ts';
import { themeStyles } from '../../../src/shared/catalogueIdentity.ts';
import { cssViolation } from '../../../src/shared/cssSafety.ts';
import { sensitiveReason } from '../../../src/shared/sensitive.ts';

const MAX_THEME_BYTES = 256 * 1024;

export type PublishResult = 'published' | 'duplicate' | 'forbidden' | 'rate_limited';

export interface CatalogueStore {
  list(): Promise<CatalogueEntry[]>;
  publish(codeHash: string, cssHash: string, entry: CatalogueEntry): Promise<PublishResult>;
}

async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function readTheme(request: Request): Promise<unknown> {
  if (!request.body) throw new SyntaxError('Missing JSON');
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_THEME_BYTES) {
        await reader.cancel();
        throw new RangeError('Theme too large');
      }
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally {
    reader.releaseLock();
  }
}

export function catalogueHandler(store: CatalogueStore) {
  return async (request: Request): Promise<Response> => {
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-ReFace-Publish-Code',
      'Cache-Control': 'no-store',
    };
    const send = (status: number, body: unknown) => Response.json(body, { status, headers });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    try {
      if (request.method === 'GET') return send(200, await store.list());
      if (request.method !== 'POST') return send(405, { error: 'Method not allowed' });
      const code = request.headers.get('X-ReFace-Publish-Code') ?? '';
      if (!/^rfc_[A-Za-z0-9_-]{43}$/.test(code))
        return send(403, { error: 'Publisher code required' });
      if (
        request.headers.get('Content-Type')?.split(';', 1)[0]?.trim().toLowerCase() !==
        'application/json'
      ) {
        return send(415, { error: 'JSON required' });
      }
      let raw: unknown;
      try {
        raw = await readTheme(request);
      } catch (error) {
        return error instanceof RangeError
          ? send(413, { error: 'Theme too large' })
          : send(400, { error: 'Invalid JSON' });
      }
      const parsed = catalogueEntrySchema.safeParse(raw);
      if (!parsed.success) return send(400, { error: 'Invalid theme' });
      const url = new URL(parsed.data.pageUrl);
      if (
        sensitiveReason(url.href) ||
        !url.hostname.includes('.') ||
        /^[\d.]+$/.test(url.hostname)
      ) {
        return send(422, { error: 'The target page cannot be published' });
      }
      if (parsed.data.rules.some((rule) => cssViolation(rule.css))) {
        return send(400, { error: 'Invalid CSS' });
      }
      const entry = publicEntry({
        ...parsed.data,
        pageUrl: url.href,
        id: 'c_' + crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      });
      const styles = themeStyles(entry);
      if (!styles) return send(400, { error: 'Empty theme' });
      const [codeHash, cssHash] = await Promise.all([digest(code), digest(styles)]);
      const result = await store.publish(codeHash, cssHash, entry);
      if (result === 'forbidden') return send(403, { error: 'Publisher code refused' });
      if (result === 'duplicate') return send(409, { error: 'Theme already public' });
      if (result === 'rate_limited') return send(429, { error: 'Publication limit reached' });
      return send(201, entry);
    } catch {
      return send(503, { error: 'Catalogue unavailable' });
    }
  };
}
