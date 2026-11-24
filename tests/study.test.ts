import { describe, expect, it } from 'vitest';
import {
  STUDY_TTL_MS,
  isFresh,
  parseStudyAnswer,
  parseStudyStep,
  shouldStudy,
  studyKey,
  studyProbes,
  type SiteStudy,
} from '../src/shared/study';

const now = Date.parse('2026-11-23T12:00:00Z');
const study = (createdAt: string, components = 1): SiteStudy => ({
  createdAt,
  pageKind: 'forum',
  summary: 'A list.',
  components: Array.from({ length: components }, (_, i) => ({
    name: i ? `Part ${i}` : 'Beta badge',
    aliases: i ? [] : ['badge', 'insigne', 'petit badge jaune'],
    selectors: i ? [`.p${i}`] : ['span.pill'],
    all: false,
  })),
});

describe('pré-étude', () => {
  it('clé par site et par section', () => {
    expect(studyKey('www.youtube.com', 'watch')).toBe('study:www.youtube.com:watch');
  });

  it('une étude vaut 30 jours, et pas si elle est vide', () => {
    expect(isFresh(study('2026-11-22T12:00:00Z'), now)).toBe(true);
    expect(isFresh(study(new Date(now - STUDY_TTL_MS - 1).toISOString()), now)).toBe(false);
    expect(isFresh(study('2026-11-22T12:00:00Z', 0), now)).toBe(false);
    expect(isFresh(study('pas une date'), now)).toBe(false);
    expect(isFresh(null, now)).toBe(false);
  });

  it('ne se lance que si elle est utile et permise', () => {
    const base = {
      enabled: true,
      hasKey: true,
      sensitive: false,
      web: true,
      cached: null,
      running: false,
      now,
    };
    expect(shouldStudy(base)).toBe(true);
    expect(shouldStudy({ ...base, enabled: false })).toBe(false);
    expect(shouldStudy({ ...base, hasKey: false })).toBe(false);
    expect(shouldStudy({ ...base, sensitive: true })).toBe(false);
    expect(shouldStudy({ ...base, web: false })).toBe(false);
    expect(shouldStudy({ ...base, running: true })).toBe(false);
    expect(shouldStudy({ ...base, cached: study('2026-11-20T00:00:00Z') })).toBe(false);
    expect(shouldStudy({ ...base, cached: study('2026-01-01T00:00:00Z') })).toBe(true);
  });

  it('composants à revérifier : alias cités marqués, doublons du skill retirés', () => {
    const probes = studyProbes(study('2026-11-22T12:00:00Z', 3), 'Cache le petit badge jaune', [
      '.p2',
    ]);
    expect(probes.map((p) => [p.name, p.asked])).toEqual([
      ['Beta badge', true],
      ['Part 1', false],
    ]);
    expect(studyProbes(null, 'x')).toEqual([]);
  });

  it('lit la réponse du LLM : index valides, sans doublon, alias nettoyés', () => {
    const parsed = parseStudyAnswer({
      pageKind: 'forum',
      summary: 'Header, list, sidebar.',
      components: [
        {
          name: ' Beta badge ',
          aliases: ['Badge', 'badge', ' insigne '],
          regionIndex: 7,
          scope: 'one',
        },
        { name: 'Same element', aliases: [], regionIndex: 7, scope: 'one' },
        { name: 'Invalid', aliases: [], regionIndex: -1, scope: 'all' },
        { name: 'Items', aliases: ['posts'], regionIndex: 9, scope: 'all' },
      ],
    });
    expect(parsed.components).toEqual([
      { name: 'Beta badge', aliases: ['badge', 'insigne'], regionIndex: 7, scope: 'one' },
      { name: 'Items', aliases: ['posts'], regionIndex: 9, scope: 'all' },
    ]);
    expect(() => parseStudyAnswer({ components: 'x' })).toThrow();
  });

  it('étape JSON de l’étude : outils ou étude complète', () => {
    const call = {
      name: 'find_elements',
      queries: ['Beta'],
      within: -1,
      regions: [],
      depth: 1,
      skill: '',
    };
    expect(parseStudyStep({ understanding: '', tool_calls: [call], study: null }).kind).toBe(
      'tools',
    );
    expect(
      parseStudyStep({
        understanding: '',
        tool_calls: [],
        study: { pageKind: 'p', summary: 's', components: [] },
      }),
    ).toEqual({
      kind: 'answer',
      value: { understanding: '', pageKind: 'p', summary: 's', components: [] },
    });
    expect(parseStudyStep({ pageKind: 'p', summary: 's', components: [] }).kind).toBe('answer');
  });
});
