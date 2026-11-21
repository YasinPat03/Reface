// Module « Raccourcis » : seule surface publique, branchée dans App.tsx.
// Tout le reste du module est privé, pour rester indépendant du reste du panel.
import './shortcuts.css';

export { RecordingBar } from './RecordingBar';
export { ShortcutsTab } from './ShortcutsTab';
export { ShortcutsTabLabel } from './TabLabel';
export { useShortcutCount } from './hooks';
