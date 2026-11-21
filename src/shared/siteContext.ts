// Contexte du site (PRD §5.4, version simple) : nom, catégorie, et vocabulaire propre à la
// catégorie, pour que l'IA interprète les références indirectes (« les images » sur YouTube
// = les miniatures des vidéos).

export type SiteCategory =
  | 'video'
  | 'news'
  | 'ecommerce'
  | 'social'
  | 'forum'
  | 'encyclopedia'
  | 'docs'
  | 'code'
  | 'search'
  | 'email'
  | 'education'
  | 'other';

/** Domaines connus (et leurs sous-domaines) → nom lisible + catégorie. */
const KNOWN: Record<string, [string, SiteCategory]> = {
  'youtube.com': ['YouTube', 'video'],
  'vimeo.com': ['Vimeo', 'video'],
  'twitch.tv': ['Twitch', 'video'],
  'netflix.com': ['Netflix', 'video'],
  'dailymotion.com': ['Dailymotion', 'video'],
  'tiktok.com': ['TikTok', 'video'],
  'nytimes.com': ['The New York Times', 'news'],
  'theguardian.com': ['The Guardian', 'news'],
  'bbc.com': ['BBC', 'news'],
  'bbc.co.uk': ['BBC', 'news'],
  'cnn.com': ['CNN', 'news'],
  'lemonde.fr': ['Le Monde', 'news'],
  'lapresse.ca': ['La Presse', 'news'],
  'radio-canada.ca': ['Radio-Canada', 'news'],
  'cbc.ca': ['CBC', 'news'],
  'amazon.com': ['Amazon', 'ecommerce'],
  'amazon.ca': ['Amazon', 'ecommerce'],
  'amazon.fr': ['Amazon', 'ecommerce'],
  'ebay.com': ['eBay', 'ecommerce'],
  'etsy.com': ['Etsy', 'ecommerce'],
  'bestbuy.ca': ['Best Buy', 'ecommerce'],
  'bestbuy.com': ['Best Buy', 'ecommerce'],
  'walmart.com': ['Walmart', 'ecommerce'],
  'aliexpress.com': ['AliExpress', 'ecommerce'],
  'x.com': ['X (Twitter)', 'social'],
  'twitter.com': ['X (Twitter)', 'social'],
  'facebook.com': ['Facebook', 'social'],
  'instagram.com': ['Instagram', 'social'],
  'linkedin.com': ['LinkedIn', 'social'],
  'reddit.com': ['Reddit', 'forum'],
  'news.ycombinator.com': ['Hacker News', 'forum'],
  'stackoverflow.com': ['Stack Overflow', 'forum'],
  'wikipedia.org': ['Wikipedia', 'encyclopedia'],
  'developer.mozilla.org': ['MDN Web Docs', 'docs'],
  'docs.python.org': ['Python docs', 'docs'],
  'github.com': ['GitHub', 'code'],
  'gitlab.com': ['GitLab', 'code'],
  'google.com': ['Google', 'search'],
  'bing.com': ['Bing', 'search'],
  'duckduckgo.com': ['DuckDuckGo', 'search'],
  'ocw.mit.edu': ['MIT OpenCourseWare', 'education'],
  'coursera.org': ['Coursera', 'education'],
  'khanacademy.org': ['Khan Academy', 'education'],
};

/** Vocabulaire : ce que l'utilisateur veut dire par des mots courants sur ce type de site. */
export const CATEGORY_HINTS: Record<SiteCategory, string> = {
  video:
    'Video platform. "images"/"pictures"/"photos" usually mean the VIDEO THUMBNAILS in the lists/grid; "videos" = video cards/thumbnails; "suggestions"/"recommendations" = the related/suggested videos list; "player" = the main video player; "shorts" = the Shorts shelf; "comments" = the comment section; "sidebar"/"menu" = the left navigation guide.',
  news: 'News site. "images" = article photos and teaser images; "articles"/"stories" = article cards; "ads" = ad slots; "text" = article body paragraphs.',
  ecommerce:
    'Online shop. "images"/"photos" = product images; "products"/"items" = product cards; "price" = price labels; "reviews" = customer reviews; "ads"/"sponsored" = sponsored results.',
  social:
    'Social network. "images"/"photos" = images inside posts; "posts" = feed items; "stories" = the stories bar; "trends"/"suggestions" = side recommendation panels.',
  forum:
    'Discussion site. "posts"/"threads"/"links" = list entries; "comments" = replies; "votes"/"points" = score widgets.',
  encyclopedia:
    'Encyclopedia article. "images" = figures/thumbnails in the article and the infobox; "summary box" = infobox; "table of contents"/"TOC" = contents navigation; "text" = article paragraphs; "references" = citations section.',
  docs: 'Documentation. "code" = code blocks; "sidebar"/"menu" = docs navigation; "text" = prose.',
  code: 'Code hosting. "files" = file list; "readme" = rendered README; "sidebar"/"about" = the repository About column; "code" = code views.',
  search:
    'Search engine. "results" = result entries; "images" = image results/thumbnails; "ads" = sponsored results.',
  email: 'Email client. "messages" = message list rows.',
  education:
    'Learning site. "video" = lecture player; "transcript" = lecture transcript; "notes"/"resources" = course materials.',
  other: '',
};

export interface SiteContext {
  host: string;
  name: string;
  category: SiteCategory;
  /** og:type, types JSON-LD : indices bruts. */
  signals: string;
  description: string;
}

export function knownSite(host: string): [string, SiteCategory] | null {
  const h = host.toLowerCase().replace(/^www\./, '');
  for (const [domain, info] of Object.entries(KNOWN)) {
    if (h === domain || h.endsWith(`.${domain}`)) return info;
  }
  return null;
}

/** Catégorie à partir des métadonnées quand le domaine est inconnu. */
export function categoryFromSignals(
  ogType: string,
  jsonLd: string[],
  hasVideo: boolean,
): SiteCategory {
  const types = jsonLd.join(' ');
  if (/^video/.test(ogType) || /VideoObject/.test(types) || hasVideo) return 'video';
  if (/^article/.test(ogType) || /NewsArticle|Article|BlogPosting/.test(types)) return 'news';
  if (/product/.test(ogType) || /Product|Offer/.test(types)) return 'ecommerce';
  if (/DiscussionForumPosting|QAPage/.test(types)) return 'forum';
  return 'other';
}

/** Bloc de contexte lisible, envoyé au LLM en tête de requête. */
export function describeSite(site: SiteContext): string {
  const hint = CATEGORY_HINTS[site.category];
  return [
    `Website: ${site.name} (${site.host})${site.category !== 'other' ? ` — category: ${site.category}` : ''}`,
    site.description ? `Site/page description: ${site.description}` : '',
    site.signals ? `Metadata: ${site.signals}` : '',
    hint ? `Vocabulary on this kind of site: ${hint}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
