// Phase 10 : qualité du design. Contexte « design » envoyé au LLM (listes, surfaces, rôles avec
// sélecteurs vérifiés), repli sur les suggestions du LLM pour « tous les similaires », et
// garde-fous après la preview (masquage abusif, sélecteurs morts, contraste corrigé par calcul).
import type { IncomingMessage, ServerResponse } from 'node:http';
import { UNKNOWN_PAGE } from './fixtures/unknownForum.ts';
import { assert, check, done, launch, startServer } from './harness.ts';

const requests: string[] = [];

function regionOf(user: string, needle: string): number {
  const line = user.split('\n').find((l) => l.includes(needle));
  return Number(line?.match(/\[#(\d+)\]/)?.[1] ?? -1);
}

type WireChange = { title: string; ops: unknown[]; targets: unknown[]; css: string };
const cssOnly = (title: string, css: string): WireChange => ({ title, ops: [], targets: [], css });

/** Faux LLM : la recette dépend de la demande (et reste la même lors de l'auto-correction). */
function recipeFor(user: string): { changes: WireChange[]; explanation: string } {
  const request = user.match(/^User request: (.*)$/m)?.[1] ?? '';
  const change = (title: string, op: string, target: object, declarations: unknown[] = []) => ({
    title,
    ops: [{ op, target: 't1', declarations }],
    targets: [{ key: 't1', selectorHints: [], scope: 'one', ...target }],
    css: '',
  });
  switch (request) {
    case 'cartes':
      // Région = le tbody conteneur ; la bonne liste n'est que dans les suggestions.
      return {
        changes: [
          {
            ...change(
              'Cartes',
              'style',
              {
                regionIndex: regionOf(user, 'kids=72'),
                selectorHints: ['tr.qx-entry'],
                scope: 'all_similar',
              },
              [{ property: 'background-color', value: 'rgb(255, 255, 255)' }],
            ),
            // Cible déclarée sans opération : ne doit produire aucun avertissement.
            targets: [
              {
                key: 't1',
                regionIndex: regionOf(user, 'kids=72'),
                selectorHints: ['tr.qx-entry'],
                scope: 'all_similar',
              },
              {
                key: 't9',
                regionIndex: regionOf(user, 'kids=72'),
                selectorHints: [],
                scope: 'all_similar',
              },
            ],
          },
        ],
        explanation: 'Cartes.',
      };
    case 'cache le pied':
      // Mauvaise cible : toute la table principale.
      return {
        changes: [change('Pied caché', 'hide', { regionIndex: regionOf(user, 'id="qxwrap"') })],
        explanation: 'Pied caché.',
      };
    case 'cache les votes':
      return { changes: [cssOnly('Votes cachés', '.votes{display:none}')], explanation: 'Votes.' };
    case 'barre sombre':
      // Fond sombre sans changer la couleur des liens (noirs) : illisible sans correction.
      return {
        changes: [cssOnly('Barre sombre', '[bgcolor]{background-color:rgb(20, 30, 60)}')],
        explanation: 'Barre sombre.',
      };
    default:
      return { changes: [cssOnly('Titres', 'span.qx-head{font-size:18px}')], explanation: 'Ok.' };
  }
}

async function llm(req: IncomingMessage, res: ServerResponse) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const messages = (JSON.parse(raw) as { messages: { content: string }[] }).messages;
  const user = messages[1]!.content;
  requests.push(messages.at(-1)!.content);
  res
    .writeHead(200, { 'Content-Type': 'application/json' })
    .end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(recipeFor(user)) } }] }));
}

const { server, origin } = await startServer({
  '/': UNKNOWN_PAGE,
  '/v1/chat/completions': (res) => void llm(res.req, res),
});
const { context, worker, extensionId } = await launch();
await worker.evaluate(
  (baseUrl) =>
    chrome.storage.local.set({ settings: { apiKey: 'sk-test', baseUrl, model: 'mock' } }),
  `${origin}/v1`,
);
const page = await context.newPage();
await page.setViewportSize({ width: 1280, height: 900 });
await page.goto(origin);
const tabId = await worker.evaluate(
  async (url) => (await chrome.tabs.query({ url: url + '/*' }))[0]!.id!,
  origin,
);
const panel = await context.newPage();
await panel.goto(`chrome-extension://${extensionId}/src/panel/index.html?tabId=${tabId}`);

interface Draft {
  changes: { title: string; enabled: boolean; css: string }[];
  warnings: string[];
  previewCss: string;
}
async function generate(prompt: string): Promise<Draft> {
  requests.length = 0;
  const reply = (await panel.evaluate((m) => chrome.runtime.sendMessage(m), {
    type: 'generate',
    payload: { tabId, prompt, previous: null, pick: null },
  })) as { ok: boolean; data?: Draft; error?: string };
  assert(reply.ok, `generate a échoué : ${reply.error}`);
  return reply.data!;
}

console.log('Phase 10 : qualité du design');

await check(
  'le LLM reçoit les listes, surfaces et rôles avec des sélecteurs vérifiés',
  async () => {
    await generate('titres');
    const user = requests[0]!;
    assert(user.includes('<untrusted_design>'), 'pas de bloc <untrusted_design>');
    assert(user.includes('24× "tr.qx-entry"'), 'liste des 24 sujets absente');
    assert(user.includes('"tr.qx-entry + tr"'), 'ligne compagne des métadonnées absente');
    assert(user.includes('"tr.qx-entry + tr td.qx-info"'), 'partie « métadonnées » absente');
    assert(user.includes('"[bgcolor]"'), 'attribut bgcolor non signalé');
    assert(/header\/top bar: "[^"]+" background #2e7d32/.test(user), 'barre du haut non détectée');
    assert(/footer: "td\.qx-foot"/.test(user), 'pied de page non détecté');
    assert(/class="qx-entry"[^\n]*similar=×24/.test(user), 'les sujets ne sont pas dans le plan');
    assert(!/id="#"|81234500/.test(user), 'un id numérique est montré au LLM');
  },
);

await check(
  '« tous les similaires » sur le conteneur : les suggestions du LLM sont utilisées',
  async () => {
    const draft = await generate('cartes');
    assert(
      !draft.warnings.some((w) => /can’t target all similar|not found/.test(w)),
      `avertissement inattendu : ${draft.warnings.join(' | ')}`,
    );
    const white = await page.evaluate(
      () =>
        [...document.querySelectorAll('tr.qx-entry')].filter(
          (row) => getComputedStyle(row).backgroundColor === 'rgb(255, 255, 255)',
        ).length,
    );
    assert(white === 24, `${white}/24 sujets stylés`);
  },
);

await check('un masquage qui efface la page est désactivé et renvoyé au LLM', async () => {
  const draft = await generate('cache le pied');
  assert(requests.length === 2, `${requests.length} appel(s) LLM au lieu de 2 (auto-correction)`);
  assert(/hid \d+% of the page text/.test(requests[1]!), 'le problème n’est pas expliqué au LLM');
  assert(draft.changes[0] && !draft.changes[0].enabled, 'le changement reste actif');
  assert(
    draft.warnings.some((w) => /hid \d+% of the page text/.test(w)),
    'aucun avertissement',
  );
  const visible = await page.evaluate(() =>
    document.body.innerText.includes('Sujet de discussion'),
  );
  assert(visible, 'la page est effacée en preview');
});

await check('une règle qui ne vise rien est signalée et renvoyée au LLM', async () => {
  const draft = await generate('cache les votes');
  assert(requests.length === 2, `${requests.length} appel(s) LLM au lieu de 2`);
  assert(requests[1]!.includes('.votes'), 'le sélecteur mort n’est pas cité au LLM');
  assert(
    draft.warnings.some((w) => /target no element/.test(w)),
    `aucun avertissement : ${draft.warnings.join(' | ')}`,
  );
});

await check('le contraste dégradé par un nouveau fond est corrigé sans IA', async () => {
  const draft = await generate('barre sombre');
  assert(requests.length === 1, `${requests.length} appel(s) LLM : la correction doit être locale`);
  assert(
    /color:/.test(draft.changes[0]!.css),
    'aucune couleur de correction ajoutée au changement',
  );
  const ratio = await page.evaluate(() => {
    const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
    };
    const link = document.querySelector('a[href="/new"]')!;
    const bar = document.querySelector('[bgcolor]')!;
    const [a, b] = [
      lum(rgb(getComputedStyle(link).color)),
      lum(rgb(getComputedStyle(bar).backgroundColor)),
    ];
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
  assert(ratio >= 4.5, `contraste du lien sur la barre : ${ratio.toFixed(1)}:1`);
});

await context.close();
server.close();
done();
