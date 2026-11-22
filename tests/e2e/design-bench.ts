// Banc de qualité du design (vrai LLM) : pour chaque site × prompt, mesure la latence,
// les sélecteurs morts, le contraste des textes et les surfaces oubliées par un thème sombre.
// Config : comme live.ts (.env.local ou env.local, clé jamais affichée).
// Usage : npm run build && node tests/e2e/design-bench.ts [filtre] [--baseline]
//   --baseline : enregistre le résultat comme référence ; sinon, compare à la référence.
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { UNKNOWN_PAGE } from './fixtures/unknownForum.ts';
import { launch, startServer } from './harness.ts';

const ROOT = resolve(import.meta.dirname, '../..');
const env = Object.fromEntries(
  (
    (await readFile(`${ROOT}/.env.local`, 'utf8').catch(() => null)) ??
    (await readFile(`${ROOT}/env.local`, 'utf8').catch(() => ''))
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

interface Site {
  name: string;
  url: string;
  prompts: string[];
  /** Titre et métadonnées des éléments de liste, pour mesurer hiérarchie et cohérence. */
  taste?: { title: string; meta: string; item: string };
}

const LIST_PROMPTS = [
  // Le prompt du test à deux mains dans le Chrome de l'utilisateur.
  'Transforme chaque article en carte avec une ombre et des coins arrondis, mets la barre orange en bleu, agrandis les titres et cache le pied de page',
  // La demande qui avait donné un rendu cassé (grille écrite à la main).
  'Organise les articles en cards carrées et place-les 3 par rangée',
  'Mode sombre',
  'Transforme chaque élément de la liste en carte avec une ombre et des coins arrondis',
  'Rends le site plus moderne et beau',
  'Mets la barre du haut en bleu, agrandis les titres, cache le pied de page et espace mieux les lignes',
  'Cache les votes et le nombre de commentaires sous chaque sujet',
];

const { server, origin } = await startServer({ '/': UNKNOWN_PAGE });
const SITES: Site[] = [
  {
    name: 'hn',
    url: 'https://news.ycombinator.com/',
    prompts: LIST_PROMPTS,
    taste: { title: '.titleline > a', meta: '.sitebit, .subline, .score', item: 'tr.athing' },
  },
  {
    name: 'inconnu',
    url: `${origin}/`,
    prompts: LIST_PROMPTS,
    taste: { title: '.qx-head > a', meta: '.qx-src, .qx-info', item: 'tr.qx-entry' },
  },
  {
    name: 'wiki',
    url: 'https://en.wikipedia.org/wiki/Golden_ratio',
    prompts: [
      'Mode sombre',
      'Rends l’article plus agréable à lire, style magazine',
      'Cache la table des matières et mets les titres de section en bleu',
    ],
  },
];

/**
 * Mesures de qualité, évaluées dans la page. Appelée une 1re fois sans preview (`mark`) pour
 * marquer les défauts d'origine du site : seuls les défauts INTRODUITS par la modif comptent.
 */
function measure([dark, mark]: [boolean, boolean]) {
  const preview = document.getElementById('bp-preview')?.textContent ?? '';
  // 1. Sélecteurs morts : règles du CSS de preview qui ne touchent aucun élément.
  const dead: string[] = [];
  let ruleCount = 0;
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(preview);
    const walk = (rules: CSSRuleList) => {
      for (const rule of rules) {
        if (rule instanceof CSSStyleRule) {
          ruleCount++;
          // Virgules de premier niveau seulement (le thème écrit :where(a, b)).
          const parts: string[] = [];
          let depth = 0;
          let current = '';
          for (const char of rule.selectorText) {
            if (char === '(' || char === '[') depth++;
            else if ((char === ')' || char === ']') && depth > 0) depth--;
            if (char === ',' && !depth) {
              parts.push(current);
              current = '';
            } else current += char;
          }
          parts.push(current);
          for (const part of parts) {
            // Les pseudo-classes d'état et pseudo-éléments ne matchent pas au repos : on les retire.
            const base = part
              .replace(
                /::?(?:hover|focus(?:-within|-visible)?|active|visited|before|after|placeholder|selection|first-line|first-letter)\b/g,
                '',
              )
              .trim();
            try {
              if (base && !document.querySelector(base)) dead.push(part.trim());
            } catch {
              dead.push(part.trim());
            }
          }
        } else if ('cssRules' in rule) walk((rule as CSSGroupingRule).cssRules);
      }
    };
    walk(sheet.cssRules);
  } catch {
    /* CSS illisible : compté comme 0 règle */
  }

  // 2. Contraste des textes visibles (2 premiers écrans).
  const parse = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number);
  const lum = ([r, g, b]: number[]) => {
    const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
  };
  const background = (element: Element | null): number[] => {
    for (let e = element; e; e = e.parentElement) {
      const c = parse(getComputedStyle(e).backgroundColor);
      if (c.length >= 3 && (c[3] ?? 1) > 0.5) return c.slice(0, 3);
    }
    return [255, 255, 255];
  };
  const ratio = (a: number[], b: number[]) => {
    const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (l1! + 0.05) / (l2! + 0.05);
  };
  const texts = [...document.body.querySelectorAll('*')].filter((e) => {
    if (!e.checkVisibility?.({ opacityProperty: true, visibilityProperty: true })) return false;
    if (![...e.childNodes].some((n) => n.nodeType === 3 && n.nodeValue!.trim())) return false;
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.top < innerHeight * 2 && r.bottom > 0;
  });
  const lowContrast: string[] = [];
  let tiny = 0;
  for (const e of texts) {
    const s = getComputedStyle(e);
    const size = parseFloat(s.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700);
    const r = ratio(parse(s.color).slice(0, 3), background(e));
    const low = r < (large ? 3 : 4.5);
    if (mark) {
      if (low) e.setAttribute('data-bench-low', '');
      if (size < 11) e.setAttribute('data-bench-tiny', '');
      continue;
    }
    if (low && !e.hasAttribute('data-bench-low')) {
      lowContrast.push(
        `${e.tagName.toLowerCase()}${e.className ? '.' + String(e.className).split(' ')[0] : ''} ${r.toFixed(1)}:1`,
      );
    }
    if (size < 11 && !e.hasAttribute('data-bench-tiny')) tiny++;
  }

  // 3. Thème sombre : grandes surfaces restées claires.
  const lightSurfaces: string[] = [];
  if (dark) {
    const area = innerWidth * innerHeight;
    for (const e of document.body.querySelectorAll('*')) {
      if (/^(?:IMG|VIDEO|CANVAS|PICTURE|IFRAME)$/.test(e.tagName)) continue; // un média n'est pas une surface
      const r = e.getBoundingClientRect();
      if (r.width * Math.min(r.height, innerHeight) < area * 0.01 || r.top > innerHeight) continue;
      const c = parse(getComputedStyle(e).backgroundColor);
      if (c.length >= 3 && (c[3] ?? 1) > 0.5 && lum(c.slice(0, 3)) > 0.4) {
        lightSurfaces.push(
          `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''} rgb(${c.slice(0, 3).join(',')})`,
        );
      }
    }
    if (lum(background(document.body)) > 0.4) lightSurfaces.unshift('fond de page');
  }
  return {
    ruleCount,
    dead: dead.slice(0, 8),
    deadCount: dead.length,
    texts: texts.length,
    lowContrastCount: lowContrast.length,
    lowContrast: [...new Set(lowContrast)].slice(0, 6),
    tiny,
    lightSurfaces: lightSurfaces.slice(0, 6),
  };
}

/**
 * Goût : hiérarchie (titre nettement plus grand que ses métadonnées), cohérence (même style pour
 * tous les éléments de la liste) et sobriété de la palette (couleurs de texte distinctes).
 */
function taste(config: { title: string; meta: string; item: string } | null) {
  const visible = (e: Element) => {
    const r = e.getBoundingClientRect();
    return (
      r.width > 0 && r.top < innerHeight * 2 && !!e.checkVisibility?.({ visibilityProperty: true })
    );
  };
  const colors = new Set<string>();
  for (const e of document.body.querySelectorAll('*')) {
    if (![...e.childNodes].some((n) => n.nodeType === 3 && n.nodeValue!.trim()) || !visible(e))
      continue;
    colors.add(getComputedStyle(e).color);
  }
  if (!config)
    return {
      textColors: colors.size,
      hierarchyBroken: 0,
      titleVariants: 0,
      metaVariants: 0,
      split: 0,
    };
  // Intégrité : chaque élément garde sa ligne suivante (infos) juste en dessous, alignée.
  let split = 0;
  for (const item of [...document.querySelectorAll(config.item)].slice(0, 6)) {
    const a = item.getBoundingClientRect();
    const b = item.nextElementSibling?.getBoundingClientRect();
    if (!b || a.height < 2 || b.height < 2) continue;
    const below = b.top >= a.bottom - 4 && b.top - a.bottom < 48;
    const aligned =
      Math.min(a.right, b.right) - Math.max(a.left, b.left) >= Math.min(a.width, b.width) * 0.5;
    if (!below || !aligned) split++;
  }
  const titles = [...document.querySelectorAll(config.title)].filter(visible).slice(0, 20);
  const metas = [...document.querySelectorAll(config.meta)].filter(visible).slice(0, 40);
  const key = (e: Element) => {
    const s = getComputedStyle(e);
    return `${s.fontSize}|${s.color}|${s.fontWeight}`;
  };
  const titleSize = Math.min(...titles.map((t) => parseFloat(getComputedStyle(t).fontSize)));
  const metaSize = Math.max(...metas.map((m) => parseFloat(getComputedStyle(m).fontSize)));
  return {
    split,
    textColors: colors.size,
    hierarchyBroken: titles.length && metas.length && titleSize < metaSize + 2 ? 1 : 0,
    titleVariants: new Set(titles.map(key)).size,
    // Les métadonnées ont plusieurs classes (domaine, ligne de points) : variantes par sélecteur.
    metaVariants: Math.max(
      0,
      ...config.meta
        .split(',')
        .map(
          (sel) =>
            new Set(
              [...document.querySelectorAll(sel.trim())].filter(visible).slice(0, 20).map(key),
            ).size,
        ),
    ),
  };
}

const filter = process.argv.slice(2).find((a) => !a.startsWith('--'));
const saveBaseline = process.argv.includes('--baseline');
const out = `${ROOT}/.live-shots/bench`;
await mkdir(out, { recursive: true });
const { context, worker, extensionId } = await launch();
await worker.evaluate((s) => chrome.storage.local.set({ settings: s }), settings);
// Journal des appels LLM (durée et tokens), sans en-têtes : la clé n'est jamais lue.
await worker.evaluate(() => {
  const g = globalThis as unknown as { __calls: unknown[]; fetch: typeof fetch };
  g.__calls = [];
  const original = g.fetch.bind(globalThis);
  g.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const t0 = Date.now();
    const response = await original(input, init);
    if (String(input).endsWith('/chat/completions')) {
      const body = (await response
        .clone()
        .json()
        .catch(() => null)) as {
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          completion_tokens_details?: { reasoning_tokens?: number };
        };
      } | null;
      g.__calls.push({
        ms: Date.now() - t0,
        in: body?.usage?.prompt_tokens,
        out: body?.usage?.completion_tokens,
        reasoning: body?.usage?.completion_tokens_details?.reasoning_tokens,
      });
    }
    return response;
  };
});
console.log(`Modèle : ${settings.model}\n`);

interface Result {
  id: string;
  ms: number;
  error?: string;
  calls: { ms: number; in?: number; out?: number; reasoning?: number }[];
  changes: string[];
  warnings: string[];
  metrics: ReturnType<typeof measure> | null;
  taste?: ReturnType<typeof taste> | null;
  firstMs?: number;
  refined?: boolean;
  previewCss?: string;
}
const results: Result[] = [];
for (const site of SITES.filter((s) => !filter || s.name.includes(filter))) {
  for (const [n, prompt] of site.prompts.entries()) {
    const id = `${site.name}-${n + 1}`;
    const page = await context.newPage();
    await page.setViewportSize({ width: 1280, height: 900 });
    const panel = await context.newPage();
    try {
      await page.goto(site.url, { waitUntil: 'load', timeout: 30_000 });
      await page.waitForTimeout(800);
      const tabId = await worker.evaluate(
        async (u) => (await chrome.tabs.query({ url: u.split('?')[0] + '*' })).at(-1)!.id!,
        site.url,
      );
      await page.evaluate(measure, [false, true] as [boolean, boolean]);
      await panel.goto(`chrome-extension://${extensionId}/src/panel/index.html?tabId=${tabId}`);
      await worker.evaluate(() => ((globalThis as unknown as { __calls: unknown[] }).__calls = []));
      const t0 = Date.now();
      const reply = (await panel.evaluate((m) => chrome.runtime.sendMessage(m), {
        type: 'generate',
        payload: { tabId, prompt, previous: null, pick: null },
      })) as {
        ok: boolean;
        error?: string;
        data?: { changes: { title: string }[]; warnings: string[]; previewCss: string };
      };
      const firstMs = Date.now() - t0;
      // v1 photographiée, puis affinage visuel (comme le fait le panel).
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${out}/${id}-v1.png` });
      let refined = false;
      if (reply.ok && reply.data) {
        const next = (await panel.evaluate((m) => chrome.runtime.sendMessage(m), {
          type: 'refine',
          payload: { tabId, draft: reply.data },
        })) as { ok: boolean; data?: typeof reply.data & { refined?: boolean } };
        if (next.ok && next.data) {
          refined = !!next.data.refined;
          reply.data = next.data;
        }
      }
      const ms = Date.now() - t0;
      const calls = (await worker.evaluate(
        () => (globalThis as unknown as { __calls: Result['calls'] }).__calls,
      )) as Result['calls'];
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${out}/${id}.png` });
      const metrics = reply.ok
        ? await page.evaluate(measure, [/sombre|dark/i.test(prompt), false] as [boolean, boolean])
        : null;
      const flavour = reply.ok ? await page.evaluate(taste, site.taste ?? null) : null;
      const result: Result = {
        id,
        ms,
        ...(reply.ok ? {} : { error: reply.error }),
        calls,
        changes: reply.data?.changes.map((c) => c.title) ?? [],
        warnings: reply.data?.warnings ?? [],
        metrics,
        taste: flavour,
        firstMs,
        refined,
        previewCss: reply.data?.previewCss,
      };
      results.push(result);
      const m = metrics;
      console.log(
        `${id} « ${prompt} »\n  v1 ${firstMs} ms, total ${ms} ms${refined ? ' · v2 RETENUE' : ' · v1 gardée'} (${calls.map((c) => `${c.ms} ms, ${c.in}→${c.out} tok dont ${c.reasoning} raisonnement`).join(' + ')})` +
          (reply.ok
            ? `\n  changements : ${result.changes.join(' | ')}` +
              `\n  sélecteurs morts : ${m!.deadCount}/${m!.ruleCount}${m!.deadCount ? ' ' + m!.dead.join(' ; ') : ''}` +
              `\n  contraste dégradé : ${m!.lowContrastCount}/${m!.texts}${m!.lowContrastCount ? ' ' + m!.lowContrast.join(' ; ') : ''} · nouveaux textes < 11 px : ${m!.tiny}` +
              `\n  goût : ${flavour!.textColors} couleurs de texte · hiérarchie ${flavour!.hierarchyBroken ? 'CASSÉE' : 'ok'} · variantes titre/méta ${flavour!.titleVariants}/${flavour!.metaVariants} · articles déchirés ${flavour!.split}` +
              (m!.lightSurfaces.length
                ? `\n  surfaces claires (sombre) : ${m!.lightSurfaces.join(' ; ')}`
                : '') +
              (result.warnings.length ? `\n  avertissements : ${result.warnings.join(' · ')}` : '')
            : `\n  ERREUR : ${reply.error}`),
      );
    } catch (error) {
      results.push({
        id,
        ms: 0,
        error: String(error),
        calls: [],
        changes: [],
        warnings: [],
        metrics: null,
      });
      console.log(`${id} : ${error instanceof Error ? error.message.split('\n')[0] : error}`);
    }
    await page.close();
    await panel.close();
  }
}
await context.close();
server.close();

/** Totaux comparables d'un run à l'autre. */
function totals(list: Result[]) {
  const ok = list.filter((r) => r.metrics);
  const sum = (f: (r: Result) => number) => ok.reduce((a, r) => a + f(r), 0);
  return {
    runs: list.length,
    errors: list.length - ok.length,
    medianMs: [...list.map((r) => r.ms)].sort((a, b) => a - b)[list.length >> 1] ?? 0,
    medianFirstMs:
      [...list.map((r) => r.firstMs ?? r.ms)].sort((a, b) => a - b)[list.length >> 1] ?? 0,
    refined: list.filter((r) => r.refined).length,
    deadSelectors: sum((r) => r.metrics!.deadCount),
    lowContrast: sum((r) => r.metrics!.lowContrastCount),
    tinyTexts: sum((r) => r.metrics!.tiny),
    lightSurfaces: sum((r) => r.metrics!.lightSurfaces.length),
    warnings: sum((r) => r.warnings.length),
    hierarchyBroken: sum((r) => r.taste?.hierarchyBroken ?? 0),
    splitItems: sum((r) => r.taste?.split ?? 0),
    inconsistentLists: sum((r) =>
      r.taste && (r.taste.titleVariants > 1 || r.taste.metaVariants > 1) ? 1 : 0,
    ),
    medianTextColors:
      [...ok.map((r) => r.taste?.textColors ?? 0)].sort((a, b) => a - b)[ok.length >> 1] ?? 0,
  };
}
const now = totals(results);
await writeFile(`${out}/latest.json`, JSON.stringify({ totals: now, results }, null, 2));
console.log('\nTotaux :', now);
if (saveBaseline) {
  await copyFile(`${out}/latest.json`, `${out}/baseline.json`);
  console.log('Référence enregistrée.');
} else {
  const base = JSON.parse(await readFile(`${out}/baseline.json`, 'utf8').catch(() => 'null')) as {
    totals: ReturnType<typeof totals>;
  } | null;
  if (base) console.log('Référence :', base.totals);
}
console.log(`Captures : ${out}`);
