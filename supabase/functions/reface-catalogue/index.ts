import { catalogueEntrySchema } from '../../../src/shared/catalogueSchema.ts';
import { catalogueHandler } from './handler.ts';

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Promise<Response>): void;
};

const origin = Deno.env.get('SUPABASE_URL');
const secretKeys = Deno.env.get('SUPABASE_SECRET_KEYS');
const key =
  (secretKeys ? JSON.parse(secretKeys).default : undefined) ??
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!origin || typeof key !== 'string') throw new Error('Supabase service credentials unavailable');

const headers: Record<string, string> = { apikey: key };
if (key.startsWith('eyJ')) headers.Authorization = 'Bearer ' + key;

async function database(path: string, payload?: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(origin + '/rest/v1/' + path, {
    headers: payload ? { ...headers, 'Content-Type': 'application/json' } : headers,
    ...(payload ? { method: 'POST', body: JSON.stringify(payload) } : {}),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Catalogue database request failed');
  return response.json();
}

Deno.serve(
  catalogueHandler({
    async list() {
      const rows = await database(
        'reface_catalogue_themes?select=entry&order=created_at.desc,id.desc&limit=100',
      );
      if (!Array.isArray(rows)) throw new Error('Invalid catalogue response');
      return rows.map((row) => catalogueEntrySchema.parse(row.entry));
    },
    async publish(codeHash, cssHash, entry) {
      const result = await database('rpc/reface_publish_catalogue_theme', {
        p_code_hash: codeHash,
        p_css_hash: cssHash,
        p_entry: entry,
      });
      if (
        result === 'published' ||
        result === 'duplicate' ||
        result === 'forbidden' ||
        result === 'rate_limited'
      ) {
        return result;
      }
      throw new Error('Invalid publication response');
    },
  }),
);
