// Sites sensibles (PRD §6.4) : aucun contenu de page n'y est envoyé au LLM.
// Le rejeu des règles existantes et « Cacher cet élément » (local) restent possibles.

/** Domaines (et leurs sous-domaines) bloqués. */
const DOMAINS = [
  // Courriel
  'mail.google.com',
  'outlook.live.com',
  'outlook.office.com',
  'outlook.office365.com',
  'mail.yahoo.com',
  'mail.proton.me',
  'proton.me',
  'fastmail.com',
  'icloud.com',
  // Gestionnaires de mots de passe / identité
  '1password.com',
  'bitwarden.com',
  'lastpass.com',
  'dashlane.com',
  'accounts.google.com',
  'login.microsoftonline.com',
  'appleid.apple.com',
  // Banques et paiement (Canada, US, Europe)
  'rbc.com',
  'rbcroyalbank.com',
  'td.com',
  'tdbank.com',
  'bmo.com',
  'scotiabank.com',
  'cibc.com',
  'bnc.ca',
  'nbc.ca',
  'desjardins.com',
  'tangerine.ca',
  'simplii.com',
  'eqbank.ca',
  'wealthsimple.com',
  'questrade.com',
  'chase.com',
  'bankofamerica.com',
  'wellsfargo.com',
  'citi.com',
  'capitalone.com',
  'americanexpress.com',
  'usbank.com',
  'schwab.com',
  'fidelity.com',
  'vanguard.com',
  'paypal.com',
  'venmo.com',
  'stripe.com',
  'revolut.com',
  'wise.com',
  'n26.com',
  'monzo.com',
  'coinbase.com',
  'binance.com',
  'kraken.com',
  // Santé et impôts
  'canada.ca',
  'irs.gov',
  'mychart.org',
  'healthvault.com',
];

/**
 * Mots-clés dans le nom d'hôte. « bank » est cherché n'importe où (mybank, bankofx) :
 * un faux positif est sans danger (seule l'IA est désactivée), un faux négatif ne l'est pas.
 */
const KEYWORDS =
  /bank|banque|(?:^|[.-])(?:banking|credit-?union|caisse|wallet|vault|password|patient|mychart|health)(?:[.-]|$)/i;

function isPrivateIp(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  // RFC 1918 + lien local. La boucle locale (127.x) reste permise : serveurs de dev et démo.
  return (
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}

/** Raison du blocage, ou null si le site peut être envoyé au LLM. */
export function sensitiveReason(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'Adresse illisible.';
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')
    return 'Page interne du navigateur.';
  const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (isPrivateIp(host)) return 'Adresse de réseau privé (intranet).';
  if (/\.(?:local|internal|intranet|corp|lan|home\.arpa)$/.test(host))
    return 'Réseau interne (intranet).';
  if (DOMAINS.some((d) => host === d || host.endsWith(`.${d}`)))
    return 'Site sensible (courriel, banque, santé ou identité).';
  if (KEYWORDS.test(host)) return 'Site potentiellement sensible (banque, santé ou identité).';
  return null;
}
