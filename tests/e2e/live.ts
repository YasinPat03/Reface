// Test « live » avec un vrai LLM : pilote la vraie UI du panel sur de vrais sites,
// mesure la latence, vérifie l'effet visible et sauvegarde des captures.
// Config dans .env.local (non commité) :
//   BP_API_KEY=...   BP_BASE_URL=https://api.openai.com/v1   BP_MODEL=gpt-4o-mini
// Usage : npm run build && node tests/e2e/live.ts [filtre] [--baseline]
//   LIVE_REPEAT=3 : chaque scénario est joué 3 fois (réussites k/N, latences médianes).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launch } from './harness.ts';

const env = Object.fromEntries(
  (
    (await readFile(resolve(import.meta.dirname, '../../.env.local'), 'utf8').catch(() => null)) ??
    (await readFile(resolve(import.meta.dirname, '../../env.local'), 'utf8').catch(() => ''))
  )
    .split('\n')
    .map((line) => line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => [m[1], m[2]!.replace(/^["']|["']$/g, '')]),
);
const settings = {
  apiKey: env.BP_API_KEY ?? '',
  baseUrl: env.BP_BASE_URL ?? 'https://api.openai.com/v1',
  model: env.BP_MODEL ?? 'gpt-4o-mini',
};
if (!settings.apiKey) {
  console.error('BP_API_KEY manquant dans .env.local');
  process.exit(2);
}

interface Scenario {
  name: string;
  url: string;
  prompts: string[];
  /** Expression évaluée dans la page : true si l'effet attendu est visible. */
  verify?: string;
  /** Alternative à verify : une mesure numérique qui doit croître d'au moins `grow` (ex. 1.15 = +15 %). */
  measure?: string;
  grow?: number;
  /** Contrôle de mise en page supplémentaire (true = OK), évalué après l'effet. */
  layout?: string;
  /** Nombre de changements séparés attendus (une règle chacun, activables un par un). */
  changes?: number;
  /** Chaque règle créée ne porte que le prompt qui l'a produite (pas « x → y »). */
  soloPrompts?: boolean;
  /**
   * Demande impossible (élément absent) : pas de Keep. Réussi si la page garde son texte visible
   * (aucun masquage « au hasard ») et si aucune erreur n'est affichée.
   */
  expectNoChange?: boolean;
}

/** Visible pour l'utilisateur (display, visibility, opacity), avec une boîte non vide. */
const VISIBLE = `((e) => !!e && e.checkVisibility({ visibilityProperty: true, opacityProperty: true }) && e.getBoundingClientRect().width > 0)`;

/** Longueur du texte visible de la page (sert à vérifier qu'aucune demande impossible ne cache autre chose). */
const VISIBLE_TEXT = `(() => {
  let n = 0;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    const p = t.parentElement;
    if (p && p.checkVisibility({ visibilityProperty: true, opacityProperty: true })) n += t.nodeValue.trim().length;
  }
  return n;
})()`;

/** Cartes vidéo YouTube : la miniature ne chevauche pas le titre, et le titre reste lisible. */
const YT_LAYOUT_OK = `(() => {
  const cards = [...document.querySelectorAll('ytd-video-renderer, yt-lockup-view-model')]
    .filter((c) => c.getBoundingClientRect().top < innerHeight * 2 && c.getBoundingClientRect().width > 0)
    .slice(0, 6);
  const problems = [];
  for (const card of cards) {
    const thumb = card.querySelector('ytd-thumbnail, yt-thumbnail-view-model');
    const title = card.querySelector('#video-title, h3, [class*="Title"]');
    if (!thumb || !title) continue;
    const a = thumb.getBoundingClientRect(), b = title.getBoundingClientRect();
    const overlap = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    if (overlap > 0.1 * b.width * b.height) problems.push('chevauchement');
    if (b.width < 120) problems.push('titre écrasé (' + Math.round(b.width) + 'px)');
  }
  return problems.length ? problems.join(', ') : true;
})()`;

/** Largeur médiane des miniatures visibles (img de plus de 100 px de large). */
const THUMB_WIDTH = `(() => {
  const widths = [...document.querySelectorAll('ytd-thumbnail img, yt-thumbnail-view-model img, ytd-thumbnail, yt-thumbnail-view-model')]
    .map((e) => e.getBoundingClientRect().width).filter((w) => w > 60).sort((a, b) => a - b);
  return widths[widths.length >> 1] ?? 0;
})()`;

const SCENARIOS: Scenario[] = [
  {
    name: 'youtube-search-images',
    url: 'https://www.youtube.com/results?search_query=lofi+music',
    prompts: ['Modifie-moi les images plus grosses'],
    measure: THUMB_WIDTH,
    grow: 1.1,
    layout: YT_LAYOUT_OK,
  },
  {
    name: 'youtube-watch-images',
    url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk',
    prompts: ['Modifie-moi les images plus grosses'],
    measure: THUMB_WIDTH,
    grow: 1.15,
    layout: YT_LAYOUT_OK,
  },
  {
    // Cartes horizontales (miniature à côté du texte) mêlées à des playlists et des étagères.
    name: 'youtube-search-cards',
    url: 'https://www.youtube.com/results?search_query=lofi+music',
    prompts: ['Show the videos as 3 cards per row'],
    verify: `(() => {
      const cards = [...document.querySelectorAll('ytd-video-renderer, yt-lockup-view-model')]
        .filter((c) => c.getBoundingClientRect().width > 0 && c.getBoundingClientRect().width < innerWidth * 0.45);
      return new Set(cards.slice(0, 6).map((c) => Math.round(c.getBoundingClientRect().left))).size >= 3;
    })()`,
    layout: YT_LAYOUT_OK,
  },
  {
    name: 'wiki-toc',
    url: 'https://en.wikipedia.org/wiki/Golden_ratio',
    prompts: ['Cache la table des matières'],
    verify: `!document.querySelector('#mw-panel-toc')?.checkVisibility()`,
  },
  {
    name: 'wiki-text',
    url: 'https://en.wikipedia.org/wiki/Golden_ratio',
    prompts: ["Agrandis le texte de l'article"],
    verify: `parseFloat(getComputedStyle(document.querySelector('.mw-parser-output p:not(.mw-empty-elt)')).fontSize) >= 17`,
  },
  {
    name: 'wiki-heading-color',
    url: 'https://en.wikipedia.org/wiki/Golden_ratio',
    prompts: ['Mets le titre principal en rouge'],
    verify: `(() => { const [r, g, b] = getComputedStyle(document.querySelector('#firstHeading')).color.match(/\\d+/g).map(Number); return r > 150 && g < 100 && b < 100; })()`,
  },
  {
    name: 'wiki-multi',
    url: 'https://en.wikipedia.org/wiki/Golden_ratio',
    prompts: [
      "Cache la table des matières, mets le titre principal en rouge et agrandis le texte de l'article",
    ],
    changes: 3,
    verify: `(() => {
      const [r, g, b] = getComputedStyle(document.querySelector('#firstHeading')).color.match(/\\d+/g).map(Number);
      const p = document.querySelector('.mw-parser-output p:not(.mw-empty-elt)');
      return !document.querySelector('#mw-panel-toc')?.checkVisibility() && r > 150 && g < 100 && b < 100 && parseFloat(getComputedStyle(p).fontSize) >= 17;
    })()`,
  },
  {
    name: 'wiki-two-commands',
    url: 'https://en.wikipedia.org/wiki/Golden_ratio',
    prompts: ['Mets le titre principal en rouge', 'Cache la table des matières'],
    changes: 2,
    soloPrompts: true,
    verify: `!document.querySelector('#mw-panel-toc')?.checkVisibility()`,
  },
  {
    // Le menu principal est replié derrière un hamburger (case à cocher, panneau caché).
    name: 'wiki-navbar',
    url: 'https://en.wikipedia.org/wiki/Golden_ratio',
    prompts: ['Turn the hamburger menu into a navbar'],
    verify: `(() => {
      const links = [...document.querySelectorAll('#vector-main-menu li a')]
        .filter((a) => a.checkVisibility({ visibilityProperty: true, opacityProperty: true }));
      return links.length >= 8 && new Set(links.map((a) => Math.round(a.getBoundingClientRect().top))).size <= 2;
    })()`,
    layout: `(() => {
      const links = [...document.querySelectorAll('#vector-main-menu li a')].map((a) => a.getBoundingClientRect());
      const bottom = Math.max(...links.map((r) => r.bottom));
      const title = document.querySelector('#firstHeading').getBoundingClientRect().top;
      return title >= bottom - 1 || 'la barre recouvre le titre (' + Math.round(bottom) + ' > ' + Math.round(title) + ')';
    })()`,
  },
  {
    name: 'hn-dark',
    url: 'https://news.ycombinator.com/',
    prompts: ['Mode sombre', 'un peu moins contrasté'],
    verify: `(() => { const bg = getComputedStyle(document.querySelector('#hnmain') ?? document.body).backgroundColor; const n = bg.match(/\\d+/g)?.map(Number) ?? [255,255,255]; return n.slice(0,3).reduce((a, b) => a + b, 0) < 300; })()`,
  },
  {
    name: 'github-about',
    url: 'https://github.com/microsoft/TypeScript',
    prompts: ['Cache la colonne About à droite'],
    verify: `![...document.querySelectorAll('h2')].find((h) => h.textContent.trim() === 'About')?.checkVisibility()`,
  },
  // --- Éléments que le plan ne montre pas (petits, répétés, chargés plus tard) ---
  {
    name: 'youtube-voice-button',
    url: 'https://www.youtube.com/results?search_query=lofi+music',
    prompts: ['Cache le bouton du micro'],
    verify: `(() => { const v = ${VISIBLE}; return !v(document.querySelector('#voice-search-button')) && v(document.querySelector('yt-searchbox, ytd-searchbox')); })()`,
  },
  {
    name: 'youtube-hide-shorts',
    url: 'https://www.youtube.com/results?search_query=lofi+music',
    prompts: ['Cache les Shorts'],
    verify: `(() => { const v = ${VISIBLE}; return [...document.querySelectorAll('grid-shelf-view-model, ytd-reel-shelf-renderer, ytm-shorts-lockup-view-model')].every((e) => !v(e)) && [...document.querySelectorAll('ytd-video-renderer, yt-lockup-view-model')].filter(v).length >= 5; })()`,
  },
  {
    name: 'youtube-watch-comments',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    prompts: ['Cache les commentaires'],
    verify: `(() => { const v = ${VISIBLE}; return !v(document.querySelector('ytd-comments#comments')) && v(document.querySelector('#player')) && v(document.querySelector('#secondary')); })()`,
  },
  {
    // fr.wikipedia : l'article anglais Golden_ratio est protégé (pas de liens « edit »).
    name: 'wiki-edit-links',
    url: 'https://fr.wikipedia.org/wiki/Nombre_d%27or',
    prompts: ['Cache les liens « modifier » à côté des titres'],
    verify: `(() => { const v = ${VISIBLE}; const h = [...document.querySelectorAll('.mw-heading h2')]; return [...document.querySelectorAll('.mw-editsection')].every((e) => !v(e)) && h.length > 3 && h.every(v); })()`,
  },
  {
    name: 'wiki-ref-numbers',
    url: 'https://en.wikipedia.org/wiki/Golden_ratio',
    prompts: ['Cache les numéros de référence dans le texte'],
    verify: `(() => { const v = ${VISIBLE}; return [...document.querySelectorAll('sup.reference')].every((e) => !v(e)) && v(document.querySelector('.mw-parser-output p:not(.mw-empty-elt)')); })()`,
  },
  {
    name: 'wiki-lang-button',
    url: 'https://en.wikipedia.org/wiki/Golden_ratio',
    prompts: ['Cache le bouton des langues'],
    verify: `(() => { const v = ${VISIBLE}; return !v(document.querySelector('#p-lang-btn')) && v(document.querySelector('#firstHeading')) && v(document.querySelector('#p-search')); })()`,
  },
  {
    name: 'hn-domains',
    url: 'https://news.ycombinator.com/',
    prompts: ['Cache les noms de domaine à côté des titres'],
    verify: `(() => { const v = ${VISIBLE}; return [...document.querySelectorAll('.sitebit')].every((e) => !v(e)) && [...document.querySelectorAll('.titleline > a')].filter(v).length >= 25; })()`,
  },
  {
    name: 'hn-rank',
    url: 'https://news.ycombinator.com/',
    prompts: ['Cache les numéros devant les sujets'],
    verify: `(() => { const v = ${VISIBLE}; return [...document.querySelectorAll('.rank')].every((e) => !v(e)) && [...document.querySelectorAll('.titleline > a')].filter(v).length >= 25; })()`,
  },
  {
    name: 'github-topics',
    url: 'https://github.com/microsoft/TypeScript',
    prompts: ['Cache les topics du dépôt'],
    verify: `(() => { const v = ${VISIBLE}; return [...document.querySelectorAll('a[href*="/topics/"]')].every((e) => !v(e)) && v(document.querySelector('article.markdown-body')); })()`,
  },
  {
    name: 'github-star',
    url: 'https://github.com/microsoft/TypeScript',
    prompts: ['Cache le bouton Star'],
    verify: `(() => { const v = ${VISIBLE}; return !v(document.querySelector('[data-testid="star-button"]')) && v(document.querySelector('[data-testid="fork-button"]')); })()`,
  },
  {
    // Élément inexistant : l'IA doit le dire, sans rien cacher d'autre.
    name: 'wiki-missing',
    url: 'https://en.wikipedia.org/wiki/Golden_ratio',
    prompts: ['Cache le bouton « Ajouter au panier »'],
    expectNoChange: true,
    measure: VISIBLE_TEXT,
  },
];

const filter = process.argv.slice(2).find((a) => !a.startsWith('--'));
const saveBaseline = process.argv.includes('--baseline');
const repeat = Math.max(1, Number(process.env.LIVE_REPEAT) || 1);
const out = resolve(import.meta.dirname, '../../.live-shots');
await mkdir(out, { recursive: true });
/** `LIVE_STUDY=1` : pré-étude active, attendue avant la 1re demande (pour mesurer son apport). */
const withStudy = process.env.LIVE_STUDY === '1';
const { context, worker, extensionId } = await launch([], { preStudy: withStudy });
await worker.evaluate((s) => chrome.storage.local.set({ settings: s }), settings);
console.log(
  `Modèle : ${settings.model} @ ${settings.baseUrl}${repeat > 1 ? ` · ${repeat} passages` : ''}\n`,
);

/** Un appel LLM, vu depuis le worker (jamais les en-têtes : la clé n'est pas lue). */
interface Call {
  ms: number;
  schema: string;
  tools: boolean;
  toolCalls: string[];
  cached?: number;
  in?: number;
  out?: number;
  /** Erreur du fournisseur (statut, paramètre, message), jamais les en-têtes. */
  error?: string;
}

/**
 * Journal des appels LLM dans le worker. Réinstallé avant chaque passage : le service worker
 * peut s'endormir et repartir de zéro entre deux scénarios.
 */
async function resetJournal(): Promise<void> {
  await worker.evaluate(() => {
    const g = globalThis as unknown as {
      __calls?: unknown[];
      __journal?: boolean;
      fetch: typeof fetch;
    };
    g.__calls = [];
    if (g.__journal) return;
    g.__journal = true;
    const original = g.fetch.bind(globalThis);
    g.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const t0 = Date.now();
      const response = await original(input, init);
      if (String(input).endsWith('/chat/completions')) {
        const request = (() => {
          try {
            return JSON.parse(String(init?.body ?? '{}')) as {
              tools?: unknown[];
              response_format?: { json_schema?: { name?: string } };
            };
          } catch {
            return {};
          }
        })();
        const body = (await response
          .clone()
          .json()
          .catch(() => null)) as {
          usage?: {
            prompt_tokens?: number;
            completion_tokens?: number;
            prompt_tokens_details?: { cached_tokens?: number };
          };
          choices?: { message?: { tool_calls?: { function?: { name?: string } }[] } }[];
          error?: { message?: string; param?: string | null };
        } | null;
        g.__calls?.push({
          ms: Date.now() - t0,
          schema: request.response_format?.json_schema?.name ?? '',
          tools: Array.isArray(request.tools) && request.tools.length > 0,
          toolCalls: (body?.choices?.[0]?.message?.tool_calls ?? []).map(
            (c) => c.function?.name ?? '?',
          ),
          cached: body?.usage?.prompt_tokens_details?.cached_tokens,
          in: body?.usage?.prompt_tokens,
          out: body?.usage?.completion_tokens,
          ...(response.ok
            ? {}
            : {
                error: `${response.status} ${body?.error?.param ?? ''} ${String(body?.error?.message ?? '').slice(0, 300)}`,
              }),
        });
      }
      return response;
    };
  });
}

async function journal(): Promise<Call[]> {
  return worker
    .evaluate(() => (globalThis as unknown as { __calls?: unknown[] }).__calls ?? [])
    .then((calls) => calls as Call[])
    .catch(() => []);
}

async function runScenario(s: Scenario): Promise<{ ok: boolean; v1: number; total: number }> {
  const runStart = Date.now();
  let v1Ms = 0;
  let totalMs = 0;
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  const panel = await context.newPage();
  await panel.setViewportSize({ width: 400, height: 800 });
  try {
    await page.goto(s.url, { waitUntil: 'load', timeout: 30_000 });
    await page.waitForTimeout(1000);
    const tabId = await worker.evaluate(
      async (u) => (await chrome.tabs.query({ url: u.split('?')[0] + '*' })).at(-1)!.id!,
      s.url,
    );
    const before = s.measure ? Number(await page.evaluate(s.measure)) : 0;
    const startedAt = new Date().toISOString();
    await panel.goto(`chrome-extension://${extensionId}/src/panel/index.html?tabId=${tabId}`);
    if (withStudy) {
      const s0 = Date.now();
      const key = await worker.evaluate(async (id) => {
        const url = new URL((await chrome.tabs.get(id)).url ?? '');
        return `study:${url.hostname}:${
          url.pathname
            .split('/')
            .find(Boolean)
            ?.toLowerCase()
            .replace(/[^a-z0-9_-]/g, '')
            .slice(0, 40) || 'home'
        }`;
      }, tabId);
      let components = 0;
      while (Date.now() - s0 < 90_000) {
        const study = await worker.evaluate(
          async (k) =>
            (await chrome.storage.local.get(k))[k] as { components: unknown[] } | undefined,
          key,
        );
        if (study) {
          components = study.components.length;
          break;
        }
        await page.waitForTimeout(500);
      }
      const status = await worker.evaluate(
        async () => (await chrome.storage.session.get('study-status'))['study-status'] ?? null,
      );
      console.log(
        `    pré-étude : ${components} composant(s) en ${Date.now() - s0} ms · ${JSON.stringify(status)}`,
      );
    }
    for (const [i, prompt] of s.prompts.entries()) {
      await panel
        .getByLabel(i === 0 ? 'What do you want to change?' : 'Refine the change')
        .fill(prompt);
      const t0 = Date.now();
      await panel.getByRole('button', { name: i === 0 ? 'Preview' : 'Revise' }).click();
      // Attendre la vraie fin de la génération (le brouillon précédent est déjà affiché en itération).
      await panel
        .getByRole('button', { name: 'Preparing preview…' })
        .waitFor({ timeout: 2000 })
        .catch(() => null);
      await panel
        .getByRole('button', { name: 'Preparing preview…' })
        .waitFor({ state: 'detached', timeout: 60_000 });
      const ms = Date.now() - t0;
      if (i === 0) v1Ms = ms;
      // Affinage visuel (toujours actif) : on attend sa fin avant de vérifier le rendu.
      const r0 = Date.now();
      await panel
        .getByTestId('refining')
        .waitFor({ state: 'detached', timeout: 30_000 })
        .catch(() => null);
      const refineMs = Date.now() - r0;
      const refined = (await panel.getByTestId('refined').count()) > 0;
      const outcome = (await panel.getByRole('alert').count()) ? 'error' : 'draft';
      if (outcome === 'error')
        throw new Error(`erreur après ${ms} ms : ${await panel.getByRole('alert').textContent()}`);
      const explanation = await panel
        .getByTestId('draft')
        .locator('.draft-explanation')
        .textContent();
      const warnings = await panel.getByTestId('draft').locator('.draft-warning').allTextContents();
      console.log(
        `  « ${prompt} » → ${ms} ms + affinage ${refineMs} ms${refined ? ' (v2 retenue)' : ''} · ${explanation}${warnings.length ? ` · ⚠️ ${warnings.join(' ⚠️ ')}` : ''}`,
      );
    }
    {
      const titles = await panel
        .getByTestId('draft-changes')
        .locator('li')
        .allTextContents()
        .catch(() => []);
      console.log(
        `    changements : ${titles.map((t) => `« ${t} »`).join(', ') || 'aucune liste'}`,
      );
      if (s.changes && titles.length !== s.changes) {
        throw new Error(`${titles.length} changement(s) au lieu de ${s.changes}`);
      }
    }
    await page.screenshot({ path: `${out}/${s.name}-preview.png` });
    totalMs = Date.now() - runStart;
    const css = await page.evaluate(() => document.getElementById('bp-preview')?.textContent ?? '');
    if (s.expectNoChange) {
      // Demande impossible : rien d'autre ne doit disparaître (au plus 3 % du texte visible).
      const after = Number(await page.evaluate(s.measure ?? VISIBLE_TEXT));
      const ok = after >= before * 0.97;
      console.log(`    texte visible : ${before} → ${after}${ok ? '' : ' (du contenu a disparu)'}`);
      console.log(`${ok ? '✓' : '✗'} ${s.name}\n    CSS : ${css.slice(0, 200) || '(aucune)'}`);
      return { ok, v1: v1Ms, total: totalMs };
    }
    const check = async (): Promise<boolean> => {
      if (s.layout) {
        const layout = await page.evaluate(s.layout);
        if (layout !== true) {
          console.log(`    mise en page : ${layout}`);
          return false;
        }
      }
      if (s.verify) return Boolean(await page.evaluate(s.verify));
      const after = Number(await page.evaluate(s.measure!));
      console.log(`    mesure : ${Math.round(before)} → ${Math.round(after)}`);
      return after >= before * (s.grow ?? 1.1);
    };
    const previewOk = await check();
    await panel.getByRole('button', { name: 'Keep' }).click();
    await panel.getByTestId('rules').waitFor({ timeout: 5000 });
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(800);
    let replayOk = await check();
    if (s.changes) {
      const host = new URL(s.url).hostname;
      const created = await worker.evaluate(
        async ([h, since]) =>
          (
            (await chrome.storage.local.get(`rules:${h}`))[`rules:${h}`] as {
              rules: { prompt: string; title?: string; createdAt: string }[];
            }
          ).rules
            .filter((r) => r.createdAt >= since)
            .map((r) => ({ label: r.title ?? r.prompt, prompt: r.prompt })),
        [host, startedAt] as const,
      );
      console.log(
        `    règles enregistrées : ${created.map((r) => `« ${r.label} » (prompt : ${r.prompt})`).join(', ')}`,
      );
      const rows = created.length;
      if (s.soloPrompts && !created.every((r) => s.prompts.includes(r.prompt))) {
        console.log('    une règle porte le prompt d’un autre changement');
        replayOk = false;
      }
      if (rows !== s.changes) replayOk = false;
    }
    if (!replayOk) {
      const debug = await page.evaluate(() => ({
        styles: document.getElementById('bp-styles')?.textContent?.length ?? -1,
        sample: document.getElementById('bp-styles')?.textContent?.slice(0, 600),
        path: location.pathname,
        cards: [
          ...new Set(
            [...document.querySelectorAll('ytd-video-renderer, yt-lockup-view-model')].map(
              (e) => e.tagName,
            ),
          ),
        ],
      }));
      console.log(`    debug rejeu : ${JSON.stringify(debug)}`);
    }
    await page.screenshot({ path: `${out}/${s.name}-reload.png` });
    if (!previewOk || !replayOk) {
      console.log(
        `✗ ${s.name} : effet ${previewOk ? 'ok' : 'ABSENT'} en preview, ${replayOk ? 'ok' : 'ABSENT'} après reload\n    CSS : ${process.env.LIVE_CSS ? css : css.slice(0, 400)}`,
      );
    } else {
      console.log(`✓ ${s.name}\n    CSS : ${process.env.LIVE_CSS ? css : css.slice(0, 200)}`);
    }
    return { ok: previewOk && replayOk, v1: v1Ms, total: totalMs };
  } catch (error) {
    console.log(`✗ ${s.name} : ${error instanceof Error ? error.message.split('\n')[0] : error}`);
    return { ok: false, v1: v1Ms, total: totalMs };
  } finally {
    await page.close();
    await panel.close();
  }
}

const median = (values: number[]): number => {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  return sorted.length ? sorted[sorted.length >> 1]! : 0;
};

interface Summary {
  name: string;
  runs: number;
  passes: number;
  v1Ms: number;
  totalMs: number;
  calls: number;
  toolRounds: number;
  tools: string[];
}

const summaries: Summary[] = [];
for (const s of SCENARIOS.filter((x) => !filter || x.name.includes(filter))) {
  const runs: { ok: boolean; v1: number; total: number; calls: Call[] }[] = [];
  for (let run = 0; run < repeat; run++) {
    if (repeat > 1) console.log(`--- ${s.name} (${run + 1}/${repeat})`);
    await resetJournal();
    const { ok, v1, total } = await runScenario(s);
    const calls = await journal();
    const rounds = calls.filter((c) => c.toolCalls.length).length;
    for (const call of calls.filter((c) => c.error)) console.log(`    fournisseur : ${call.error}`);
    if (calls.length)
      console.log(
        `    appels LLM : ${calls.length} (${calls.map((c) => c.schema + (c.toolCalls.length ? `→${c.toolCalls.join('+')}` : '')).join(', ')})${rounds ? ` · ${rounds} tour(s) d'outils` : ''}`,
      );
    runs.push({ ok, v1, total, calls });
  }
  summaries.push({
    name: s.name,
    runs: runs.length,
    passes: runs.filter((r) => r.ok).length,
    v1Ms: median(runs.map((r) => r.v1)),
    totalMs: median(runs.map((r) => r.total)),
    calls: median(runs.map((r) => r.calls.length)),
    toolRounds: median(runs.map((r) => r.calls.filter((c) => c.toolCalls.length).length)),
    tools: [...new Set(runs.flatMap((r) => r.calls.flatMap((c) => c.toolCalls)))],
  });
}
await context.close();

// Résumé, comparé à la référence (.live-shots/live-baseline.json, écrite par --baseline).
const summaryPath = `${out}/live-summary.json`;
await writeFile(summaryPath, JSON.stringify({ model: settings.model, repeat, summaries }, null, 2));
const baseline = (
  await readFile(`${out}/live-baseline.json`, 'utf8')
    .then((raw) => JSON.parse(raw) as { summaries: Summary[] })
    .catch(() => null)
)?.summaries;
console.log('\nRésumé (réussites · v1 médiane · total médian · appels · tours d’outils) :');
for (const s of summaries) {
  const ref = baseline?.find((b) => b.name === s.name);
  const versus = ref
    ? `   [réf. ${ref.passes}/${ref.runs} · ${ref.v1Ms} ms · ${ref.totalMs} ms]`
    : '';
  console.log(
    `  ${s.passes === s.runs ? '✓' : '✗'} ${s.name.padEnd(24)} ${s.passes}/${s.runs} · ${s.v1Ms} ms · ${s.totalMs} ms · ${s.calls} · ${s.toolRounds}${s.tools.length ? ` (${s.tools.join(', ')})` : ''}${versus}`,
  );
}
const passes = summaries.reduce((n, s) => n + s.passes, 0);
const total = summaries.reduce((n, s) => n + s.runs, 0);
console.log(`\n${passes}/${total} passages réussis. Captures : ${out}`);
if (saveBaseline) {
  await writeFile(
    `${out}/live-baseline.json`,
    JSON.stringify({ model: settings.model, repeat, summaries }, null, 2),
  );
  console.log('Référence enregistrée : .live-shots/live-baseline.json');
}
process.exit(passes === total ? 0 : 1);
