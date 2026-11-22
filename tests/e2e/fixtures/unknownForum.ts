// Forum fictif pour les bancs de test : le LLM ne peut pas en connaître les classes de mémoire.
/** Forum « inconnu » du LLM : mise en page en tableau, classes inventées, ids numériques, bgcolor. */
const ROWS = Array.from(
  { length: 24 },
  (_, i) => `
<tr class="qx-entry" id="${81_234_500 + i}"><td class="qx-rank">${i + 1}.</td><td class="qx-cell"><span class="qx-head"><a href="/item/${i}">Sujet de discussion numéro ${i + 1} sur la cuisine régionale</a> <span class="qx-src">(exemple.org)</span></span></td></tr>
<tr><td></td><td class="qx-info"><span class="qx-pts">${(i * 37) % 400} votes</span> par membre${i} il y a ${i + 1} heures | <a href="/item/${i}">${(i * 13) % 90} réponses</a></td></tr>
<tr class="qx-gap" style="height:4px"></tr>`,
).join('');
export const UNKNOWN_PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Le Comptoir</title>
<style>body{font-family:Verdana,sans-serif;font-size:10pt;margin:8px}#qxwrap{width:85%;background:#f2f0e6}
.qx-head a{color:#000;text-decoration:none}.qx-info,.qx-info a{color:#828282;font-size:7pt}.qx-rank{color:#828282;text-align:right;vertical-align:top}
.qx-foot{text-align:center;font-size:8pt;padding:12px}</style></head><body><center>
<table id="qxwrap" cellpadding="0" cellspacing="0">
<tr><td bgcolor="#2e7d32"><table width="100%" style="padding:2px"><tr><td><b>Le Comptoir</b> <a href="/new">nouveaux</a> | <a href="/top">populaires</a> | <a href="/ask">questions</a></td><td align="right"><a href="/login">connexion</a></td></tr></table></td></tr>
<tr style="height:10px"></tr>
<tr><td><table cellpadding="0" cellspacing="0">${ROWS}</table></td></tr>
<tr><td class="qx-foot"><a href="/faq">FAQ</a> | <a href="/rules">Règles</a> | <a href="/contact">Contact</a></td></tr>
</table></center></body></html>`;
