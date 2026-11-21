import { sameTheme } from '../src/shared/catalogueIdentity.ts';
import { createServer, type Server } from 'node:http';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { catalogueEntrySchema, publicEntry } from '../src/shared/catalogueSchema.ts';

const LIMIT = 2 * 1024 * 1024;

export function createCatalogueServer(directory: string): Server {
  let writes: Promise<unknown> = Promise.resolve();
  const list = async () => {
    const files = (await readdir(directory))
      .filter((name) => /^[\w-]+\.json$/.test(name))
      .slice(0, 500);
    const entries = (
      await Promise.all(
        files.map(async (name) => {
          try {
            const parsed = catalogueEntrySchema.safeParse(
              JSON.parse(await readFile(join(directory, name), 'utf8')),
            );
            return parsed.success ? [publicEntry(parsed.data)] : [];
          } catch {
            return [];
          }
        }),
      )
    ).flat();
    return entries.filter(
      (entry, index) => entries.findIndex((other) => sameTheme(other, entry)) === index,
    );
  };
  return createServer(async (request, response) => {
    const origin = request.headers.origin;
    const allowed =
      !origin ||
      /^chrome-extension:\/\/[a-p]{32}$/.test(origin) ||
      /^http:\/\/(127\.0\.0\.1|localhost):889[01]$/.test(origin);
    const send = (status: number, value: unknown) => {
      response.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      response.end(JSON.stringify(value));
    };
    if (!allowed) return send(403, { error: 'Origin refused' });
    if (origin) response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (request.url !== '/api/catalogue') return send(404, { error: 'Not found' });
    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      return response.end();
    }
    try {
      await mkdir(directory, { recursive: true });
      if (request.method === 'GET') {
        return send(
          200,
          (await list()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        );
      }
      if (request.method !== 'POST') return send(405, { error: 'Method not allowed' });
      if (!request.headers['content-type']?.startsWith('application/json'))
        return send(415, { error: 'JSON required' });
      const chunks: Buffer[] = [];
      let bytes = 0;
      for await (const chunk of request) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytes += buffer.length;
        if (bytes > LIMIT) return send(413, { error: 'Theme too large' });
        chunks.push(buffer);
      }
      let raw: unknown;
      try {
        raw = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        return send(400, { error: 'Invalid JSON' });
      }
      const parsed = catalogueEntrySchema.safeParse(raw);
      if (!parsed.success) return send(400, { error: 'Invalid theme' });
      const publish = async () => {
        const entry = publicEntry({
          ...parsed.data,
          id: `c_${randomUUID()}`,
          createdAt: new Date().toISOString(),
        });
        if ((await list()).some((existing) => sameTheme(existing, entry)))
          return send(409, { error: 'Theme already public' });
        await writeFile(
          join(directory, `${entry.id}.json`),
          JSON.stringify(entry, null, 2) + '\n',
          { flag: 'wx' },
        );
        return send(201, entry);
      };
      const operation = writes.catch(() => undefined).then(publish);
      writes = operation;
      await operation;
    } catch {
      return send(500, { error: 'Catalogue unavailable' });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const directory = resolve(dirname(fileURLToPath(import.meta.url)), '../demo/catalogue/public');
  createCatalogueServer(directory).listen(8892, '127.0.0.1', () => {
    process.stdout.write(
      `ReFace catalogue: http://127.0.0.1:8892/api/catalogue\nJSON folder: ${directory}\n`,
    );
  });
}
