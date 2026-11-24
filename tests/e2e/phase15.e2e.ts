// Phase 15 : l'IA examine la page (outils en lecture seule) au lieu de deviner.
// Le faux LLM appelle vraiment les outils (`tool_calls`) quand la cible n'est pas dans le plan :
// badge minuscule, étiquettes au-delà des 2 premiers éléments d'une liste, contraintes de taille.
// Vérifie aussi : pré-recherche sans appel d'outil, confidentialité (valeur d'un champ),
// plafond de tours, repli si le fournisseur refuse les outils, garde des index périmés.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { HIDDEN_TARGETS_PAGE, SECRET_VALUE, SPONSORED_COUNT } from './fixtures/hiddenTargets.ts';
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
  model: string;
  response_format?: { json_schema?: { name?: string } };
  messages: { role: string; content: unknown }[];
  tools?: { function: { name: string } }[];
  tool_choice?: string;
}

type Mode = 'prematch' | 'badge' | 'sponsored' | 'inspect' | 'greedy' | 'repair' | 'json';
let mode: Mode = 'prematch';
const requests: Body[] = [];
const raws: string[] = [];
let inspected = '';

const hide = (regionIndex: number, scope = 'one') => ({
  title: 'Hide',
  ops: [{ op: 'hide', target: 't1', declarations: [] }],
  targets: [{ key: 't1', regionIndex, selectorHints: [], scope }],
  css: '',
  theme: null,
  menuBar: 0,
});
const recipe = (changes: unknown[]) => ({
  understanding: 'test',
  changes,
  explanation: 'Done.',
});
const answer = (res: ServerResponse, value: unknown) =>
  res
    .writeHead(200, { 'Content-Type': 'application/json' })
    .end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }));

/** 1er élément trouvé (« 1. [#n] ») dans un texte d'outil ou de pré-recherche. */
const firstMatch = (text: string) => Number(text.match(/1\. \[#(\d+)\]/)?.[1] ?? -1);

async function llm(req: IncomingMessage, res: ServerResponse) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw) as Body;
  requests.push(body);
  raws.push(raw);
  if (isRefineRequest(raw)) return declineRefine(res);
  if (body.model === 'mock-notools' && body.tools) {
    return res
      .writeHead(400, { 'Content-Type': 'application/json' })
      .end('{"error":{"message":"tools are not supported by this model","param":"tools"}}');
  }
  const user = String(body.messages[1]!.content);
  const results = toolResults(raw);
  switch (mode) {
    case 'json': {
      // Fournisseur sans outils natifs : les appels passent dans la réponse JSON.
      const schema = body.response_format?.json_schema?.name;
      const back = body.messages
        .filter((m) => m.role === 'user')
        .map((m) => String(m.content))
        .find((c) => c.startsWith('Tool results:'));
      if (schema !== 'agent_step') return answer(res, recipe([]));
      const call = { queries: ['Beta'], within: -1, regions: [], depth: 1, skill: '' };
      return back
        ? answer(res, {
            understanding: 'u',
            tool_calls: [],
            recipe: recipe([hide(firstMatch(back))]),
          })
        : answer(res, {
            understanding: 'u',
            tool_calls: [{ name: 'find_elements', ...call }],
            recipe: null,
          });
    }
    case 'prematch':
      return answer(
        res,
        recipe([hide(firstMatch(user.split('<untrusted_request_matches>')[1] ?? ''))]),
      );
    case 'badge':
    case 'sponsored': {
      // Le temps d'un vrai LLM : chaque étape reste affichée dans le panel (test 15.11).
      if (mode === 'badge') await new Promise((ok) => setTimeout(ok, 600));
      if (!results.length)
        return toolCallReply(res, [
          {
            name: 'find_elements',
            args: { queries: [mode === 'badge' ? 'Beta' : 'Sponsored'], within: -1 },
          },
        ]);
      return answer(
        res,
        recipe([hide(firstMatch(results.at(-1)!), mode === 'badge' ? 'one' : 'all_similar')]),
      );
    }
    case 'inspect': {
      if (!results.length) {
        const aside = Number(user.match(/\[#(\d+)\] <aside id="side"/)?.[1] ?? -1);
        return toolCallReply(res, [
          { name: 'inspect_regions', args: { regions: [aside], depth: 2 } },
        ]);
      }
      inspected = results.at(-1)!;
      return answer(res, recipe([]));
    }
    case 'greedy':
      if (body.tool_choice === 'none') return answer(res, recipe([]));
      return toolCallReply(res, [
        { name: 'find_elements', args: { queries: [`x${requests.length}`], within: -1 } },
      ]);
    case 'repair': {
      // 1er essai : un sélecteur inventé, qui ne vise rien.
      const repairing = body.messages.some(
        (m) => m.role === 'user' && String(m.content).startsWith('Your recipe was applied'),
      );
      if (!repairing)
        return answer(
          res,
          recipe([{ ...hide(-1), ops: [], targets: [], css: '.badge-beta{display:none}' }]),
        );
      if (!results.length && body.tool_choice !== 'none')
        return toolCallReply(res, [
          { name: 'find_elements', args: { queries: ['Beta'], within: -1 } },
        ]);
      return answer(res, recipe([hide(firstMatch(results.at(-1)!))]));
    }
  }
}

const { server, origin } = await startServer({
  '/forum': HIDDEN_TARGETS_PAGE,
  '/v1/chat/completions': (res) => void llm(res.req, res),
});
const { context, worker, extensionId } = await launch();
const setModel = (model: string) =>
  worker.evaluate(
    ([baseUrl, m]) =>
      chrome.storage.local.set({ settings: { apiKey: 'sk-test', baseUrl, model: m } }),
    [`${origin}/v1`, model] as const,
  );
await setModel('mock');
const page = await context.newPage();
await page.setViewportSize({ width: 1280, height: 800 });
await page.goto(`${origin}/forum`);
const tabId = await worker.evaluate(
  async (url) => (await chrome.tabs.query({ url: url + '/*' }))[0]!.id!,
  origin,
);
const panel = await context.newPage();
await panel.goto(`chrome-extension://${extensionId}/src/panel/index.html?tabId=${tabId}`);

const send = async <T>(type: string, payload: unknown) =>
  (await panel.evaluate((m) => chrome.runtime.sendMessage(m), { type, payload })) as {
    ok: boolean;
    data?: T;
    error?: string;
  };
const content = async <T>(type: string, payload: unknown) =>
  (await panel.evaluate(([id, m]) => chrome.tabs.sendMessage(id, m, { frameId: 0 }), [
    tabId,
    { type, payload },
  ] as const)) as { ok: boolean; data?: T; error?: string };

interface DraftReply {
  changes: { targets: Record<string, { selectors: string[] }> }[];
  warnings: string[];
  layoutIssues?: string[];
  previewCss: string;
}
const generate = async (prompt: string, next: Mode) => {
  mode = next;
  requests.length = 0;
  raws.length = 0;
  const reply = await send<DraftReply>('generate', { tabId, prompt, previous: null, pick: null });
  assert(reply.ok, `generate : ${reply.error}`);
  return reply.data!;
};
const shown = (selector: string) =>
  page.evaluate(
    (s) =>
      [...document.querySelectorAll(s)].filter((e) =>
        e.checkVisibility({ visibilityProperty: true, opacityProperty: true }),
      ).length,
    selector,
  );
const reset = async () => {
  await send('discard', { tabId });
  await worker.evaluate(
    (host) => chrome.storage.local.remove([`rules:${host}`, `css:${host}`, `page-css:${host}`]),
    new URL(origin).hostname,
  );
};

console.log('Phase 15 : l’IA examine la page');

await check('15.1 pré-recherche : les mots de la demande sont trouvés sans outil', async () => {
  const draft = await generate('Hide the Beta badge', 'prematch');
  const user = String(requests[0]!.messages[1]!.content);
  assert(user.includes('<untrusted_request_matches>'), 'pas de bloc de pré-recherche');
  assert(requests.length === 1, `${requests.length} appels au lieu d’un`);
  assert(/display:\s*none/.test(draft.previewCss), `preview : ${draft.previewCss}`);
  assert((await shown('.pill')) === 0, 'le badge est encore visible');
  assert((await shown('.logo')) === 1, 'le logo a disparu');
  await reset();
});

await check(
  '15.2 cible absente du plan : find_elements, puis le badge seul est caché',
  async () => {
    const draft = await generate('Cache le petit insigne près du nom du site', 'badge');
    const first = requests[0]!;
    const user = String(first.messages[1]!.content);
    assert(!user.includes('Beta'), 'le badge était déjà dans le plan : le test ne prouve rien');
    assert(user.startsWith('User request: '), 'messages[1] ne commence plus par la demande');
    const names = (first.tools ?? []).map((t) => t.function.name);
    assert(
      names.includes('find_elements') && names.includes('inspect_regions'),
      `outils : ${names}`,
    );
    assert(first.tool_choice === 'auto', `tool_choice : ${first.tool_choice}`);
    assert(raws[0]!.includes('"response_format"'), 'response_format manquant');
    assert(requests.length === 2, `${requests.length} appels au lieu de 2`);
    const second = requests[1]!;
    assert(
      second.messages.some(
        (m) => m.role === 'assistant' && JSON.stringify(m).includes('tool_calls'),
      ),
      'l’appel d’outil n’est pas recopié',
    );
    const result = toolResults(raws[1]!)[0] ?? '';
    assert(result.startsWith('<untrusted_tool_result name="find_elements">'), result.slice(0, 80));
    assert(/1\. \[#\d+\] <span class="pill"/.test(result), `résultat : ${result.slice(0, 300)}`);
    assert((await shown('.pill')) === 0, 'le badge est encore visible');
    assert((await shown('.logo, h1, li.item')) === 14, 'autre chose a été caché');
    const kept = await send('keep', { tabId, draft });
    assert(kept.ok, `keep : ${kept.error}`);
    await page.reload();
    await page.waitForTimeout(300);
    assert((await shown('.pill')) === 0, 'le badge réapparaît après rechargement');
    await reset();
    await page.reload();
  },
);

await check('15.3 étiquettes au-delà du plan : toutes cachées (all_similar)', async () => {
  const user = async () => String(requests[0]!.messages[1]!.content);
  await generate('Cache les étiquettes de pub', 'sponsored');
  assert(!(await user()).includes('Sponsored'), 'les étiquettes étaient déjà dans le plan');
  assert((await shown('.tag')) === 0, `${await shown('.tag')} étiquette(s) encore visibles`);
  assert((await shown('li.item')) === 12, 'des discussions ont disparu');
  assert((await page.locator('.tag').count()) === SPONSORED_COUNT, 'fixture inattendue');
  await reset();
});

await check('15.4 inspect_regions donne la mise en page et les contraintes de taille', async () => {
  await generate('Élargis la colonne des règles', 'inspect');
  assert(inspected.includes('<aside id="side"'), inspected.slice(0, 200));
  assert(/size limited by: [^\n]*max-width:300px/.test(inspected), inspected.slice(0, 600));
  assert(/parent [^\n]*flex/.test(inspected), 'mise en page du parent absente');
  assert(inspected.includes('children (depth 2)'), 'enfants absents');
  await reset();
});

await check('15.5 la valeur d’un champ ne part jamais chez le fournisseur', async () => {
  for (const prompt of ['Hide the Beta badge', 'search the forum']) {
    await generate(prompt, 'prematch');
    assert(
      !raws.some((raw) => raw.includes(SECRET_VALUE)),
      `« ${SECRET_VALUE} » envoyé (${prompt})`,
    );
  }
  await generate('Cache le petit insigne près du nom du site', 'badge');
  assert(!raws.some((raw) => raw.includes(SECRET_VALUE)), `« ${SECRET_VALUE} » envoyé (outils)`);
  await reset();
});

await check('15.6 un modèle gourmand en outils doit répondre au bout de 3 tours', async () => {
  await generate('Cache le petit insigne', 'greedy');
  const choices = requests.map((r) => r.tool_choice);
  assert(
    JSON.stringify(choices) === JSON.stringify(['auto', 'auto', 'auto', 'none']),
    `tool_choice : ${choices}`,
  );
  const last = requests.at(-1)!.messages.at(-1)!;
  assert(
    last.role === 'user' && String(last.content).startsWith('No more tools'),
    'note finale absente',
  );
  await reset();
});

await check('15.7 fournisseur sans outils natifs : repli mémorisé, sans outils natifs ensuite', async () => {
  await setModel('mock-notools');
  const draft = await generate('Hide the Beta badge', 'prematch');
  assert(requests.length === 2, `${requests.length} appels au lieu de 2`);
  assert(!!requests[0]!.tools && !requests[1]!.tools, 'le 2e appel envoie encore des outils');
  assert(/display:\s*none/.test(draft.previewCss), `pas de preview : ${draft.previewCss}`);
  await generate('Hide the Beta badge', 'prematch');
  assert((requests.length as number) === 1 && !requests[0]!.tools, 'le refus n’est pas mémorisé');
  await setModel('mock');
  await reset();
});

await check(
  '15.8 auto-correction : un sélecteur inventé est remplacé grâce aux outils',
  async () => {
    const draft = await generate('Cache le petit insigne', 'repair');
    const trace = JSON.stringify(
      requests.map((r) => [
        !!r.tools,
        r.tool_choice,
        r.messages.at(-1)!.role,
        String(r.messages.at(-1)!.content).slice(0, 50),
      ]),
    );
    assert(requests.length === 3, `${requests.length} appels au lieu de 3 : ${trace}`);
    assert(!!requests[1]!.tools, `la réparation ne propose pas les outils : ${trace}`);
    assert(toolResults(raws[2]!).length === 1, 'pas de résultat d’outil dans la réparation');
    assert((await shown('.pill')) === 0, `badge encore visible : ${draft.previewCss}`);
    await reset();
  },
);

await check('15.12 sans outils natifs, l’IA appelle les outils dans sa réponse JSON', async () => {
  await setModel('mock-notools');
  await generate('Cache le petit insigne près du nom du site', 'json');
  const schemas = requests.map((r) => r.response_format?.json_schema?.name);
  assert(
    JSON.stringify(schemas) === JSON.stringify(['agent_step', 'agent_step']),
    `schémas : ${schemas}`,
  );
  assert(
    requests.every((r) => !r.tools),
    'des outils natifs ont été envoyés',
  );
  const back = String(requests[1]!.messages.at(-1)!.content);
  assert(
    back.startsWith('Tool results:') && back.includes('<untrusted_tool_result'),
    back.slice(0, 120),
  );
  assert((await shown('.pill')) === 0, 'le badge est encore visible');
  await setModel('mock');
  await reset();
});

await check('15.9 index d’une distillation périmée : seules les suggestions servent', async () => {
  const first = await content<{ distillId: number; regions: string }>('distill', {
    include: [],
    focus: null,
  });
  assert(first.ok, `distill : ${first.error}`);
  const h1 = Number(first.data!.regions.match(/\[#(\d+)\] <h1/)?.[1] ?? -1);
  const target = { key: 't1', regionIndex: h1, selectorHints: ['aside#side'], scope: 'one' };
  const prepare = (distillId: number) =>
    content<DraftReply>('preparePreview', {
      recipe: {
        changes: [
          { title: 'x', ops: [{ op: 'hide', target: 't1' }], targets: { t1: target }, css: '' },
        ],
        explanation: '',
      },
      prompts: ['x'],
      apply: false,
      distillId,
    });
  const fresh = await prepare(first.data!.distillId);
  assert(
    fresh.data!.changes[0]!.targets.t1!.selectors.some((s) => s.includes('h1')),
    `index à jour : ${fresh.data!.changes[0]!.targets.t1!.selectors}`,
  );
  await content('distill', { include: [], focus: null });
  const stale = await prepare(first.data!.distillId);
  assert(
    JSON.stringify(stale.data!.changes[0]!.targets.t1!.selectors) === '["aside#side"]',
    `index périmé : ${stale.data!.changes[0]!.targets.t1!.selectors}`,
  );
});

await check('15.10 l’affinage visuel n’envoie pas d’outils', async () => {
  const draft = await generate('Hide the Beta badge', 'prematch');
  requests.length = 0;
  raws.length = 0;
  await send('refine', { tabId, draft });
  const refine = raws.findIndex((raw) => isRefineRequest(raw));
  assert(refine >= 0, 'pas de requête d’affinage');
  assert(!requests[refine]!.tools, 'l’affinage envoie des outils');
  await reset();
});

await check('15.11 le panel montre ce que fait l’IA (recherche dans la page)', async () => {
  mode = 'badge';
  await panel.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { __progress: string[] }).__progress = seen;
    new MutationObserver(() => {
      const text = document.querySelector('[data-testid="progress"]')?.textContent;
      if (text && seen.at(-1) !== text) seen.push(text);
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  await panel
    .getByLabel('What do you want to change?')
    .fill('Cache le petit insigne près du nom du site');
  await panel.getByRole('button', { name: 'Preview' }).click();
  await panel.getByRole('button', { name: 'Preparing preview…' }).waitFor({ timeout: 5000 });
  await panel
    .getByRole('button', { name: 'Preparing preview…' })
    .waitFor({ state: 'detached', timeout: 20_000 });
  const seen = await panel.evaluate(
    () => (window as unknown as { __progress: string[] }).__progress,
  );
  assert(
    seen.some((text) => text.startsWith('Searching the page for “Beta”')),
    `étapes vues : ${JSON.stringify(seen)}`,
  );
  assert(seen.includes('Writing the change…'), `étapes vues : ${JSON.stringify(seen)}`);
  assert((await shown('.pill')) === 0, 'le badge est encore visible');
  await reset();
});

await context.close();
server.close();
done();
