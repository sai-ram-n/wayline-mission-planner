import { LuMap } from 'react-icons/lu';
import EmptyState from '../components/ui/EmptyState.jsx';

export default function Editor() {
  return (
    <EmptyState
      icon={LuMap}
      title="Mission editor"
      message="The map canvas, waypoint list and settings panels arrive in Phase 3."
    />
  );
}
