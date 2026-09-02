import { LuPlane } from 'react-icons/lu';
import EmptyState from '../components/ui/EmptyState.jsx';

export default function Drones() {
  return (
    <EmptyState
      icon={LuPlane}
      title="Fleet and assignments"
      message="The drone list and assignment table arrive in Phase 7."
    />
  );
}
