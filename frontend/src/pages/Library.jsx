import { LuLibrary } from 'react-icons/lu';
import EmptyState from '../components/ui/EmptyState.jsx';

export default function Library() {
  return (
    <EmptyState
      icon={LuLibrary}
      title="Wayline library"
      message="Saved waylines, search, folders and card actions arrive in Phase 6."
    />
  );
}
