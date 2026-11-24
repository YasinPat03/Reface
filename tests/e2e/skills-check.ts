// Contrôle des skills de site sur les vrais sites (réseau requis, sans LLM ni extension) : chaque
// composant doit viser au moins un élément sur au moins une des pages `verify` de son skill.
// Un skill périmé ne casse rien (les composants absents ne sont jamais montrés au LLM), mais il
// perd son utilité : à lancer avant une démo.
// Usage : node tests/e2e/skills-check.ts [filtre]
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { parseSkill, type Skill } from '../../src/shared/skillFormat.ts';

const DIR = resolve(import.meta.dirname, '../../src/skills/site');
/** Sites dont une partie des composants n'existe qu'une fois connecté : absences tolérées. */
const LOGIN_WALLED = new Set(['x']);

const filter = process.argv[2];
const skills: Skill[] = [];
for (const file of (await readdir(DIR)).filter((f) => f.endsWith('.md')).sort()) {
  const skill = parseSkill(await readFile(resolve(DIR, file), 'utf8'), file);
  if (!filter || skill.name.includes(filter)) skills.push(skill);
}

const browser = await chromium.launch({
  channel: 'chromium',
  headless: process.env.HEADED !== '1',
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  locale: 'en-US',
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
});

let failures = 0;
for (const skill of skills) {
  /** Composant → meilleur résultat vu sur les pages du skill. */
  const seen = new Map<string, string>();
  let blocked = 0;
  for (const url of skill.verify) {
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 40_000 });
      await page.waitForTimeout(3000);
      // Contenu chargé au défilement (commentaires YouTube…).
      await page.mouse.wheel(0, 2500);
      await page.waitForTimeout(1500);
      await page.mouse.wheel(0, -2500);
      await page.waitForTimeout(500);
      const wall = await page.evaluate(
        () =>
          /just a moment|captcha|unusual traffic/i.test(document.title + location.pathname) ||
          location.pathname.startsWith('/sorry'),
      );
      if (wall) {
        blocked++;
        console.log(`  ⚠ ${url} : protection anti-robot, page non vérifiable`);
        continue;
      }
      const results = await page.evaluate((components) => {
        const out: Record<string, string> = {};
        for (const { name, selectors } of components) {
          for (const selector of selectors) {
            let all: Element[];
            try {
              all = [...document.querySelectorAll(selector)];
            } catch {
              out[name] = `INVALIDE : ${selector}`;
              break;
            }
            if (!all.length) continue;
            const shown = all.filter(
              (e) =>
                e.checkVisibility({ visibilityProperty: true }) &&
                e.getBoundingClientRect().width > 0,
            ).length;
            out[name] = `${selector} ×${all.length} (${shown} visibles)`;
            break;
          }
        }
        return out;
      }, skill.components);
      for (const [name, result] of Object.entries(results)) {
        if (!seen.has(name) || result.includes('INVALIDE')) seen.set(name, `${result} · ${url}`);
      }
    } catch (error) {
      blocked++;
      console.log(`  ⚠ ${url} : ${error instanceof Error ? error.message.split('\n')[0] : error}`);
    } finally {
      await page.close();
    }
  }
  if (blocked === skill.verify.length) {
    console.log(`? ${skill.name} : aucune page vérifiable (protection anti-robot ou réseau)\n`);
    continue;
  }
  const missing = skill.components.filter((c) => !seen.has(c.name)).map((c) => c.name);
  const invalid = [...seen.entries()].filter(([, r]) => r.includes('INVALIDE'));
  const tolerated = LOGIN_WALLED.has(skill.name);
  const ok = !invalid.length && (!missing.length || tolerated);
  if (!ok) failures++;
  console.log(
    `${ok ? '✓' : '✗'} ${skill.name} : ${skill.components.length - missing.length}/${skill.components.length} composants trouvés`,
  );
  for (const [name, result] of seen) console.log(`    ${name} : ${result}`);
  if (missing.length)
    console.log(
      `    ${tolerated ? 'absents (connexion requise ?)' : 'ABSENTS'} : ${missing.join(', ')}`,
    );
  console.log('');
}
await browser.close();
console.log(failures ? `${failures} skill(s) à mettre à jour.` : 'Skills à jour.');
process.exit(failures ? 1 : 0);
