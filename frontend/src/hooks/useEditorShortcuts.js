/**
 * Editor keyboard shortcuts — docs/feature-reference.md §3.
 *
 * The reference's shortcut map is built around a 3D virtual aircraft (W/S/A/D
 * flight, Space to drop a waypoint at the aircraft's position). We author by
 * clicking the map instead (§4), so only the shortcuts that still mean something
 * are bound here: stepping through waypoints and their actions, attaching a
 * photo action, and deleting the selection.
 *
 * Events originating inside a form control are ignored, so typing in a numeric
 * field and the Alt+Arrow row reorder in WaypointList both keep working.
 */
import { useEffect } from 'react';
import useMissionStore from '../store.js';
import { defaultParams } from '../lib/actions.js';

const FORM_ELEMENTS = 'input, textarea, select, [contenteditable="true"]';

export default function useEditorShortcuts({ enabled = true, onShowHelp } = {}) {
  useEffect(() => {
    if (!enabled) return undefined;

    const handler = (event) => {
      // Never steal a key from a field the user is typing in.
      if (event.target?.closest?.(FORM_ELEMENTS)) return;
      // Leave browser and OS combinations alone. Shift is ours (insert-after).
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const state = useMissionStore.getState();
      const { mission, selectedWaypoint, selectedAction } = state;
      const waypoints = mission.waypoints ?? [];
      if (!waypoints.length && event.key !== '?') return;

      const waypoint = selectedWaypoint != null ? waypoints[selectedWaypoint] : null;
      const actions = waypoint?.actions ?? [];
      const locked = mission.locked;

      switch (event.key) {
        // --- step through waypoints
        case 'ArrowUp':
        case 'ArrowDown': {
          event.preventDefault();
          const delta = event.key === 'ArrowDown' ? 1 : -1;
          const current = selectedWaypoint ?? (delta > 0 ? -1 : waypoints.length);
          const next = Math.min(waypoints.length - 1, Math.max(0, current + delta));
          state.selectWaypoint(next);
          break;
        }

        // --- step through the selected waypoint's actions
        case 'ArrowLeft':
        case 'ArrowRight': {
          if (selectedWaypoint == null || !actions.length) return;
          event.preventDefault();
          const delta = event.key === 'ArrowRight' ? 1 : -1;
          const current = selectedAction ?? (delta > 0 ? -1 : actions.length);
          const next = Math.min(actions.length - 1, Math.max(0, current + delta));
          state.selectAction(selectedWaypoint, next);
          break;
        }

        // --- attach Take Photo (Fixed Angle), or insert it after the selected action
        case 'f':
        case 'F': {
          if (locked || selectedWaypoint == null) return;
          event.preventDefault();
          const params = defaultParams('takePhotoFixedAngle', mission.settings ?? {});
          if (event.shiftKey && selectedAction != null) {
            state.insertAction(selectedWaypoint, selectedAction + 1, 'takePhotoFixedAngle', params);
          } else {
            state.addAction(selectedWaypoint, 'takePhotoFixedAngle', params);
          }
          break;
        }

        // --- remove the selected action, or the selected waypoint
        case 'Delete':
        case 'Backspace': {
          if (locked) return;
          if (selectedAction != null && selectedWaypoint != null) {
            event.preventDefault();
            state.removeAction(selectedWaypoint, selectedAction);
          } else if (selectedWaypoint != null) {
            event.preventDefault();
            state.removeWaypoint(selectedWaypoint);
          }
          break;
        }

        // Shift+Space inserts a waypoint after the current one, midway to the
        // next, matching the reference's insert-after binding.
        case ' ': {
          if (locked || !event.shiftKey || selectedWaypoint == null) return;
          event.preventDefault();
          const current = waypoints[selectedWaypoint];
          const next = waypoints[selectedWaypoint + 1];
          const lat = next ? (current.lat + next.lat) / 2 : current.lat + 0.0004;
          const lng = next ? (current.lng + next.lng) / 2 : current.lng + 0.0004;
          state.insertWaypoint(selectedWaypoint + 1, { lat, lng });
          break;
        }

        case '?': {
          event.preventDefault();
          onShowHelp?.();
          break;
        }

        default:
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled, onShowHelp]);
}

/** Rendered by the editor's help overlay, and the single source for the list. */
export const SHORTCUTS = [
  { keys: '↑ / ↓', description: 'Previous / next waypoint' },
  { keys: '← / →', description: 'Previous / next action on the selected waypoint' },
  { keys: 'F', description: 'Add Take Photo (Fixed Angle) to the selected waypoint' },
  { keys: 'Shift + F', description: 'Insert Take Photo (Fixed Angle) after the selected action' },
  { keys: 'Shift + Space', description: 'Insert a waypoint after the selected one' },
  { keys: 'Delete', description: 'Remove the selected action, or the waypoint' },
  { keys: 'Alt + ↑ / ↓', description: 'Reorder the focused waypoint in the list' },
  { keys: 'Esc', description: 'Cancel drawing an area or centre line' },
  { keys: '?', description: 'Show this list' },
];
