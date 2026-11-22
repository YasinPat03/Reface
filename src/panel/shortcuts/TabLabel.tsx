import { BookmarkSimpleIcon } from '@phosphor-icons/react/dist/csr/BookmarkSimple';

/**
 * Libellé de l'onglet « Raccourcis » : texte + nombre, ou icône + nombre si le panel est trop
 * étroit pour 4 onglets (voir shortcuts.css). Le nom complet reste dans l'aria-label de l'onglet.
 */
export function ShortcutsTabLabel({ count }: { count: number }) {
  return (
    <span className="shortcut-tab-label" title="Shortcuts">
      <BookmarkSimpleIcon className="shortcut-tab-icon" size={16} aria-hidden="true" />
      <span className="shortcut-tab-text">Shortcuts</span>
      <span className="tab-count">{count}</span>
    </span>
  );
}
