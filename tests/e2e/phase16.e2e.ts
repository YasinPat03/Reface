// Phase 16 : pré-étude de la page à l'ouverture du panel (« carte du site »).
// L'IA étudie la page en arrière-plan (avec les outils), nomme ses composants ; l'extension les
// garde en sélecteurs vérifiés, 30 jours par site et section, et les redonne au LLM à chaque
// demande. Le faux LLM ne trouve le badge minuscule que grâce à l'étude.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { HIDDEN_TARGETS_PAGE } from './fixtures/hiddenTargets.ts';
import {
  assert,
  check,
  declineRefine,
  done,
  isRefineRequest,
  launch,
  startServer,
  toolCallReply,
  toolResults,
} from './harness.ts';

interface Body {
  messages: { role: string; content: unknown }[];
  response_format?: { json_schema?: { name?: string } };
}
const studies: Body[] = [];
const recipes: Body[] = [];

const answer = (res: ServerResponse, value: unknown) =>
  res
    .writeHead(200, { 'Content-Type': 'application/json' })
    .end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }));

async function llm(req: IncomingMessage, res: ServerResponse) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  if (isRefineRequest(raw)) return declineRefine(res);
  const body = JSON.parse(raw) as Body;
  const user = String(body.messages[1]!.content);
  if (body.response_format?.json_schema?.name === 'site_study') {
    studies.push(body);
    const results = toolResults(raw);
    // L'étude cherche le petit badge (absent du plan), puis rend sa carte.
    if (!results.length)
      return toolCallReply(res, [
        { name: 'find_elements', args: { queries: ['Beta'], within: -1 } },
      ]);
    const badge = Number(results[0]!.match(/1\. \[#(\d+)\]/)?.[1] ?? -1);
    const item = Number(user.match(/\[#(\d+)\] <li class="item"/)?.[1] ?? -1);
    return answer(res, {
      pageKind: 'forum',
      summary: 'Green header, list of discussions, rules sidebar.',
      components: [
        {
          name: 'Beta badge',
          aliases: ['insigne', 'petit badge'],
          regionIndex: badge,
          scope: 'one',
        },
        {
          name: 'Discussions',
          aliases: ['sujets', 'discussions'],
          regionIndex: item,
          scope: 'all',
        },
      ],
    });
  }
  recipes.push(body);
  const line = user.match(/- Beta badge: [^\n]*\[#(\d+)\]/);
  return answer(res, {
    understanding: 'u',
    changes: line
      ? [
          {
            title: 'Hide badge',
            ops: [{ op: 'hide', target: 't1', declarations: [] }],
            targets: [{ key: 't1', regionIndex: Number(line[1]), selectorHints: [], scope: 'one' }],
            css: '',
            theme: null,
            menuBar: 0,
          },
        ]
      : [],
    explanation: line ? 'Hidden.' : 'Not found.',
  });
}

const EMPTY_FORUM = HIDDEN_TARGETS_PAGE.replace(/<span class="pill">Beta<\/span>/, '').replace(
  /<ul class="feed">[\s\S]*?<\/ul>/,
  '<p>No discussions yet.</p>',
);

const { server, origin } = await startServer({
  '/forum': HIDDEN_TARGETS_PAGE,
  '/forum?empty=1': EMPTY_FORUM,
  '/v1/chat/completions': (res) => void llm(res.req, res),
});
const { context, worker, extensionId } = await launch([], { preStudy: true });
await worker.evaluate(
  (baseUrl) =>
    chrome.storage.local.set({ settings: { apiKey: 'sk-test', baseUrl, model: 'mock' } }),
  `${origin}/v1`,
);
const host = new URL(origin).hostname;
const KEY = `study:${host}:forum`;
const page = await context.newPage();
await page.setViewportSize({ width: 1280, height: 800 });
await page.goto(`${origin}/forum`);
const tabId = await worker.evaluate(
  async (url) => (await chrome.tabs.query({ url: url + '/*' }))[0]!.id!,
  origin,
);
const openPanel = async () => {
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/src/panel/index.html?tabId=${tabId}`);
  return panel;
};
const stored = () =>
  worker.evaluate(
    async (key) =>
      (await chrome.storage.local.get(key))[key] as
        { components: { name: string; selectors: string[]; all: boolean }[] } | undefined,
    KEY,
  );
const waitFor = async (test: () => Promise<boolean>, ms: number) => {
  for (const end = Date.now() + ms; Date.now() < end;) {
    if (await test()) return true;
    await new Promise((ok) => setTimeout(ok, 150));
  }
  return false;
};
const shown = (selector: string) =>
  page.evaluate(
    (s) => [...document.querySelectorAll(s)].filter((e) => e.checkVisibility()).length,
    selector,
  );

console.log('Phase 16 : pré-étude à l’ouverture du panel');
let panel = await openPanel();

await check(
  '16.1 l’ouverture du panel étudie la page et garde des sélecteurs vérifiés',
  async () => {
    assert(await waitFor(async () => !!(await stored()), 12_000), 'aucune étude enregistrée');
    const study = (await stored())!;
    assert(studies.length === 2, `${studies.length} appels d’étude (outil puis carte attendus)`);
    const badge = study.components.find((c) => c.name === 'Beta badge');
    assert(
      badge?.selectors.some((s) => s.includes('pill')),
      JSON.stringify(study.components),
    );
    const list = study.components.find((c) => c.name === 'Discussions');
    assert(list?.all && list.selectors[0]!.includes('li'), JSON.stringify(list));
    assert(!JSON.stringify(study).includes('regionIndex'), 'des index ont été gardés');
  },
);

await check('16.2 la demande suivante reçoit la carte du site et trouve le badge', async () => {
  recipes.length = 0;
  const reply = (await panel.evaluate((m) => chrome.runtime.sendMessage(m), {
    type: 'generate',
    payload: { tabId, prompt: 'Cache l’insigne', previous: null, pick: null },
  })) as { ok: boolean; error?: string };
  assert(reply.ok, `generate : ${reply.error}`);
  const user = String(recipes[0]!.messages[1]!.content);
  assert(user.includes('<untrusted_site_map>'), 'pas de carte du site dans la demande');
  assert(/- Beta badge: [^\n]*← mentioned in the request/.test(user), 'badge non signalé');
  assert(user.includes('Page kind: forum'), 'résumé de l’étude absent');
  assert(recipes.length === 1, `${recipes.length} appels de recette`);
  assert((await shown('.pill')) === 0, 'le badge est encore visible');
  await panel.evaluate((m) => chrome.runtime.sendMessage(m), {
    type: 'discard',
    payload: { tabId },
  });
});

await check('16.3 rouvrir le panel ne relance pas l’étude (cache de 30 jours)', async () => {
  const before = studies.length;
  await panel.close();
  panel = await openPanel();
  await new Promise((ok) => setTimeout(ok, 3500));
  assert(studies.length === before, `${studies.length - before} nouvel(s) appel(s) d’étude`);
});

await check('16.4 désactivée dans Options : aucune étude', async () => {
  await worker.evaluate(async (key) => {
    await chrome.storage.local.remove(key);
    await chrome.storage.local.set({ 'preStudy:v1': false });
  }, KEY);
  const before = studies.length;
  await panel.close();
  panel = await openPanel();
  await new Promise((ok) => setTimeout(ok, 3500));
  assert(studies.length === before, 'une étude a été lancée malgré l’option');
  assert(!(await stored()), 'une étude a été enregistrée');
  await worker.evaluate(() => chrome.storage.local.remove('preStudy:v1'));
});

await check('16.5 une étude périmée (composants disparus) est oubliée', async () => {
  await panel.close();
  panel = await openPanel();
  assert(await waitFor(async () => !!(await stored()), 12_000), 'pas de nouvelle étude');
  await page.goto(`${origin}/forum?empty=1`);
  const reply = (await panel.evaluate((m) => chrome.runtime.sendMessage(m), {
    type: 'generate',
    payload: { tabId, prompt: 'Cache l’insigne', previous: null, pick: null },
  })) as { ok: boolean; error?: string };
  assert(reply.ok, `generate : ${reply.error}`);
  assert(await waitFor(async () => !(await stored()), 3000), 'l’étude périmée est restée');
});

await check('16.6 page non web (ici, la page du panel lui-même) : aucune étude', async () => {
  const before = studies.length;
  const reply = (await panel.evaluate(async () => {
    const self = await chrome.tabs.getCurrent();
    return chrome.runtime.sendMessage({ type: 'study', payload: { tabId: self!.id } });
  })) as { ok: boolean; data?: { status: string } };
  assert(reply.data?.status === 'skipped', JSON.stringify(reply));
  assert(studies.length === before, 'une étude a été lancée');
});

await context.close();
server.close();
done();
