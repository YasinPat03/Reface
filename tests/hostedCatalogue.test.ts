import { describe, expect, it, vi } from 'vitest';
import {
  catalogueHandler,
  type CatalogueStore,
} from '../supabase/functions/reface-catalogue/handler';
import demo from '../demo/catalogue/public/example-paper.json';

const code = 'rfc_' + 'a'.repeat(43);
const endpoint = 'https://catalogue.example/functions/v1/reface-catalogue';

function publication(body: unknown, publisherCode?: string) {
  return new Request(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(publisherCode ? { 'X-ReFace-Publish-Code': publisherCode } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe('hosted Catalogue', () => {
  it('allows browsing without a code and rejects anonymous publication', async () => {
    const publish = vi.fn<CatalogueStore['publish']>();
    const handle = catalogueHandler({ list: async () => [], publish });

    expect(await (await handle(new Request(endpoint))).json()).toEqual([]);
    expect((await handle(publication(demo))).status).toBe(403);
    expect(publish).not.toHaveBeenCalled();
  });

  it('sanitizes themes and hashes their CSS and publisher code before storing', async () => {
    const publish = vi.fn<CatalogueStore['publish']>().mockResolvedValue('published');
    const handle = catalogueHandler({ list: async () => [], publish });
    const entry = {
      ...demo,
      rules: demo.rules.map((rule) => ({ ...rule, prompt: 'Private prompt' })),
    };

    const response = await handle(publication(entry, code));
    expect(response.status).toBe(201);
    const [codeHash, cssHash, stored] = publish.mock.calls[0]!;
    expect(codeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(codeHash).not.toBe(code);
    expect(cssHash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.id).not.toBe(entry.id);
    expect(stored.rules[0]?.prompt).toBe(entry.title);
    expect(await response.json()).toEqual(stored);

    publish.mockResolvedValue('duplicate');
    expect((await handle(publication({ ...entry, title: 'New title' }, code))).status).toBe(409);
    expect(publish.mock.calls[1]?.[1]).toBe(cssHash);
  });

  it('rejects blocked destinations, unsafe CSS, and oversized themes before storage', async () => {
    const publish = vi.fn<CatalogueStore['publish']>();
    const handle = catalogueHandler({ list: async () => [], publish });

    expect(
      (
        await handle(
          publication({ ...demo, host: 'localhost', pageUrl: 'http://localhost/' }, code),
        )
      ).status,
    ).toBe(422);
    expect(
      (
        await handle(
          publication(
            {
              ...demo,
              rules: demo.rules.map((rule) => ({
                ...rule,
                css: 'body{background:url(https://example.com/image.png)}',
              })),
            },
            code,
          ),
        )
      ).status,
    ).toBe(400);
    expect((await handle(publication({ value: 'x'.repeat(256 * 1024) }, code))).status).toBe(413);
    expect(publish).not.toHaveBeenCalled();
  });
});
