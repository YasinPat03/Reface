import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createCatalogueServer } from '../scripts/catalogue-server';
import type { CatalogueEntry } from '../src/shared/catalogueSchema';

let directory: string, server: Server, url: string;
const workspace = resolve(process.cwd(), '..');
const theme: CatalogueEntry = {
  format: 'reface/catalogue/v1',
  id: 'c_original',
  title: 'Lecture',
  description: 'Une description.',
  host: 'example.com',
  pagePath: '/',
  pageUrl: 'https://example.com/',
  createdAt: '2026-11-21T00:00:00.000Z',
  rules: [
    {
      id: 'r_original',
      kind: 'restyle',
      createdAt: '2026-11-21T00:00:00.000Z',
      prompt: 'Private prompt',
      urlPattern: 'https://example.com/*',
      enabled: true,
      ops: [{ op: 'theme', css: { color: '#222222' } }],
      targets: {},
      css: '',
      explanation: 'Private explanation',
      intent: null,
      health: { lastOk: null, failures: 0, status: 'ok' },
    },
  ],
};
beforeAll(async () => {
  directory = await mkdtemp(join(workspace, 'catalogue-test-'));
  server = createCatalogueServer(directory);
  await new Promise<void>((ok, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', ok);
  });
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/catalogue`;
});
afterAll(async () => {
  if (server)
    await new Promise<void>((ok, fail) => server.close((error) => (error ? fail(error) : ok())));
  if (
    !directory ||
    !resolve(directory).startsWith(workspace + sep) ||
    !directory.includes('catalogue-test-')
  )
    throw new Error('Unexpected test cleanup path');
  await rm(directory, { recursive: true, force: true });
});

describe('JSON-folder public catalogue', () => {
  it('publishes a new JSON file and reads it back without exposing private prompts', async () => {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      },
      body: JSON.stringify(theme),
    });
    expect(response.status).toBe(201);
    const published = (await response.json()) as CatalogueEntry;
    expect(published.id).not.toBe(theme.id);
    expect(published.rules[0]!.prompt).toBe(theme.title);
    expect(published.rules[0]!.explanation).toBe(theme.description);
    const disk = JSON.parse(await readFile(join(directory, `${published.id}.json`), 'utf8'));
    expect(disk).toEqual(published);
    const listing = (await (await fetch(url)).json()) as CatalogueEntry[];
    expect(listing.some((entry) => entry.id === published.id)).toBe(true);
  });
  it('rejects renamed and concurrent republications without writing another file', async () => {
    const publish = () =>
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...theme, id: 'c_imported_copy', title: 'Renamed copy' }),
      });
    const [a, b] = await Promise.all([publish(), publish()]);
    expect(a.status).toBe(409);
    expect(b.status).toBe(409);
    expect((await readdir(directory)).filter((name) => name.endsWith('.json'))).toHaveLength(1);
  });
  it('rejects invalid metadata, malformed JSON, and requests from unrelated websites', async () => {
    const request = (body: string, origin?: string) =>
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) },
        body,
      });
    expect((await request('{')).status).toBe(400);
    expect((await request(JSON.stringify({ ...theme, title: '' }))).status).toBe(400);
    expect((await request(JSON.stringify(theme), 'https://other.example')).status).toBe(403);
  });
  it('ignores invalid files placed in the demo folder and returns valid themes', async () => {
    await writeFile(join(directory, 'broken.json'), '{');
    const response = await fetch(url);
    expect(response.status).toBe(200);
    expect(await response.json()).toHaveLength(1);
  });
});
