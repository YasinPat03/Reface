// Mots de la demande à chercher sur la page avant le 1er appel au LLM (pré-recherche gratuite) :
// les libellés cités entre guillemets, puis les mots rares (noms propres, libellés de boutons).
// Les mots d'une demande de modification (« cache », « bouton », « plus grand »…) ne désignent rien.

const STOPWORDS = new Set(
  `hide show make bigger smaller larger large small change color colour colors colours remove
  button buttons link links text texts page pages site the and with from this that these those into
  more less much very please every also only just like look style theme font fonts size dark light
  mode image images picture pictures photo photos title titles left right bottom side next near
  above below under over behind front back make turn into instead whole entire section part parts
  cache cacher caches masque masquer masques enleve enlever supprime supprimer retire retirer
  affiche afficher montre montrer rends rendre mets mettre plus moins grand grande grands grandes
  petit petite petits petites gros grosse couleur couleurs bouton boutons lien liens texte textes
  page toute tous toutes tout dans avec pour sans leur leurs cette ceci cela comme aussi juste
  seulement tres trop sombre clair theme police taille image photo titre titres haut droite
  gauche cote devant derriere dessous dessus partie parties section entier entiere agrandis agrandir
  reduis reduire change changer modifie modifier fais faire voir`.split(/\s+/),
);

const QUOTED = /[«"“']\s*([^«»"“”']{2,60}?)\s*[»"”']/g;

/** Au plus `max` requêtes : d'abord les libellés cités, puis les mots rares de 4 lettres et plus. */
export function requestQueries(prompt: string, max = 3): string[] {
  const out: string[] = [];
  const push = (query: string) => {
    const clean = query.trim();
    if (clean && !out.some((q) => q.toLowerCase() === clean.toLowerCase())) out.push(clean);
  };
  for (const match of prompt.matchAll(QUOTED)) push(match[1]!);
  const unquoted = prompt.replace(QUOTED, ' ');
  for (const word of unquoted.split(/[^\p{L}\p{N}-]+/u)) {
    const plain = word.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (plain.length >= 4 && !STOPWORDS.has(plain) && !/^\d+$/.test(plain)) push(word);
  }
  return out.slice(0, max);
}
