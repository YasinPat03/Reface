import { describe, expect, it } from 'vitest';
import { isSafeSelector } from '../src/shared/cssSafety';
import { mentions, parseSkill, splitOutside } from '../src/shared/skillFormat';
import {
  SITE_SKILL_BUDGET,
  SKILLS,
  SKILL_NAMES,
  TECHNIQUE_SKILL_BUDGET,
  componentProbes,
  siteSkill,
  skillText,
  techniqueSkills,
} from '../src/shared/skills';

describe('skills : fichiers', () => {
  it('lit les 9 skills de site, aux noms uniques', () => {
    const sites = SKILLS.filter((s) => s.kind === 'site').map((s) => s.name);
    expect(sites).toEqual(
      expect.arrayContaining([
        'youtube',
        'wikipedia',
        'hackernews',
        'github',
        'reddit',
        'x',
        'stackoverflow',
        'google',
        'amazon',
      ]),
    );
    expect(new Set(SKILL_NAMES).size).toBe(SKILL_NAMES.length);
  });

  it('chaque skill tient dans son budget et a une description', () => {
    for (const skill of SKILLS) {
      const budget = skill.kind === 'site' ? SITE_SKILL_BUDGET : TECHNIQUE_SKILL_BUDGET;
      expect(
        skill.body.length,
        `${skill.name}: ${skill.body.length} caractères`,
      ).toBeLessThanOrEqual(budget);
      expect(skill.description.length, skill.name).toBeGreaterThan(10);
      expect(skillText(skill)).not.toContain('…</skill>');
    }
  });

  it('les skills de site ont des hôtes, des URLs de contrôle et des composants sûrs', () => {
    for (const skill of SKILLS.filter((s) => s.kind === 'site')) {
      expect(skill.hosts.length, skill.name).toBeGreaterThan(0);
      expect(
        skill.verify.every((url) => url.startsWith('https://')),
        skill.name,
      ).toBe(true);
      expect(skill.components.length, skill.name).toBeGreaterThanOrEqual(8);
      expect(skill.body, skill.name).not.toContain('```');
      const names = skill.components.map((c) => c.name);
      expect(new Set(names).size, `${skill.name}: noms de composants en double`).toBe(names.length);
      for (const component of skill.components) {
        expect(component.aliases.length, `${skill.name}/${component.name}`).toBeGreaterThan(0);
        for (const selector of component.selectors) {
          expect(isSafeSelector(selector), `${skill.name}: ${selector}`).toBe(true);
        }
      }
    }
  });
});

describe('skills : choix', () => {
  it('associe un hôte à son skill (sous-domaines compris, pas les faux amis)', () => {
    expect(siteSkill('www.youtube.com')?.name).toBe('youtube');
    expect(siteSkill('m.youtube.com')?.name).toBe('youtube');
    expect(siteSkill('fr.wikipedia.org')?.name).toBe('wikipedia');
    expect(siteSkill('news.ycombinator.com')?.name).toBe('hackernews');
    expect(siteSkill('twitter.com')?.name).toBe('x');
    expect(siteSkill('superuser.com')?.name).toBe('stackoverflow');
    expect(siteSkill('www.amazon.fr')?.name).toBe('amazon');
    expect(siteSkill('notyoutube.com')).toBeNull();
    expect(siteSkill('youtube.com.evil.example')).toBeNull();
    expect(siteSkill('127.0.0.1')).toBeNull();
  });

  it('marque les composants cités dans la demande (accents et pluriels ignorés)', () => {
    const asked = (host: string, prompt: string) =>
      componentProbes(siteSkill(host), prompt)
        .filter((p) => p.asked)
        .map((p) => p.name);
    expect(asked('www.youtube.com', 'Cache les Shorts')).toContain('Shorts');
    expect(asked('www.youtube.com', 'Cache le bouton du micro')).toContain('Voice search button');
    expect(asked('en.wikipedia.org', 'cache la table des matieres')).toEqual(['Table of contents']);
    expect(asked('news.ycombinator.com', 'Cache les noms de domaine')).toContain('Domains');
    expect(asked('www.youtube.com', 'Agrandis tout')).toEqual([]);
    expect(componentProbes(null, 'Cache les Shorts')).toEqual([]);
  });

  it('les techniques se choisissent par leurs déclencheurs', () => {
    for (const skill of SKILLS.filter((s) => s.kind === 'technique')) {
      expect(skill.triggers, skill.name).not.toBeNull();
    }
    expect(techniqueSkills('', 5)).toEqual([]);
    const names = (prompt: string) => techniqueSkills(prompt, 3).map((s) => s.name);
    expect(names('Cache les Shorts')).toEqual(['hide']);
    expect(names('Mode lecture, sans les pubs')).toEqual(['hide', 'reading-mode']);
    expect(names('make the header sticky')).toEqual(['sticky']);
    expect(names('Agrandis les miniatures')).toEqual(['enlarge-media']);
    expect(names('Turn the hamburger menu into a navbar')).toEqual(['navbar-menus']);
    expect(names('Une police plus lisible')).toEqual(['typography']);
    expect(names('Mets le titre en rouge')).toEqual([]);
  });
});

describe('skills : format', () => {
  it('découpe les alternatives hors parenthèses', () => {
    expect(splitOutside('a:is(b; c) ; d[x=";"] ; e', ';')).toEqual(['a:is(b; c)', 'd[x=";"]', 'e']);
  });

  it('reconnaît un mot entier, avec ou sans accents et au pluriel', () => {
    expect(mentions('Cache les vidéos courtes', 'videos courtes')).toBe(true);
    expect(mentions('hide the chips', 'chip')).toBe(true);
    expect(mentions('Cache le chapeau', 'chap')).toBe(false);
    expect(mentions('[edit] links', '[edit]')).toBe(true);
  });

  it('refuse une ligne de composant mal formée', () => {
    const bad = '---\nname: t\nkind: site\n---\nx\n```components\nA | b | c\n```\n';
    expect(() => parseSkill(bad)).toThrow(/4 cells/);
    const scope = '---\nname: t\nkind: site\n---\n```components\nA | b | c | many\n```\n';
    expect(() => parseSkill(scope)).toThrow(/one\|all/);
    expect(() => parseSkill('pas de front matter')).toThrow(/front matter/);
  });
});
