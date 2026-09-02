/**
 * Mission editor: map canvas on the right, waypoint list and stats on the left.
 *
 * Settings and action panels are added in Phase 4; this phase covers placing,
 * moving, reordering and deleting waypoints, the live statistics, and saving.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  LuSave,
  LuUndo2,
  LuTrash2,
  LuArrowUpDown,
  LuHouse,
  LuCircleAlert,
} from 'react-icons/lu';

import MapCanvas from '../components/editor/MapCanvas.jsx';
import StatsBar from '../components/editor/StatsBar.jsx';
import WaypointList from '../components/editor/WaypointList.jsx';
import SaveMissionDialog from '../components/editor/SaveMissionDialog.jsx';
import ErrorBanner from '../components/ui/ErrorBanner.jsx';
import Spinner from '../components/ui/Spinner.jsx';
import useMissionStore from '../store.js';
import { computeStats } from '../lib/geo.js';
import { ROUTE_TYPE_LABELS } from '../lib/constants.js';

export default function Editor() {
  const { id } = useParams();
  const navigate = useNavigate();

  const mission = useMissionStore((s) => s.mission);
  const meta = useMissionStore((s) => s.meta);
  const dirty = useMissionStore((s) => s.dirty);
  const loading = useMissionStore((s) => s.loading);
  const saving = useMissionStore((s) => s.saving);
  const error = useMissionStore((s) => s.error);
  const selectedWaypoint = useMissionStore((s) => s.selectedWaypoint);
  const selectedAction = useMissionStore((s) => s.selectedAction);
  const historyLength = useMissionStore((s) => s.history.length);

  const {
    loadMission,
    newMission,
    addWaypoint,
    moveWaypoint,
    removeWaypoint,
    reorderWaypoints,
    reverseRoute,
    clearWaypoints,
    selectWaypoint,
    selectAction,
    setSettings,
    saveMission,
    undo,
    clearError,
  } = useMissionStore.getState();

  const [saveOpen, setSaveOpen] = useState(false);
  const [placementMode, setPlacementMode] = useState(null);
  const [fitTrigger, setFitTrigger] = useState(0);
  const [toast, setToast] = useState(null);

  // Load the requested mission, or start a blank one.
  useEffect(() => {
    if (id) {
      loadMission(id)
        .then(() => setFitTrigger((n) => n + 1))
        .catch(() => {});
    } else if (mission.id) {
      newMission();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Warn before losing unsaved work on reload or tab close.
  useEffect(() => {
    if (!dirty) return undefined;
    const handler = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const showToast = useCallback((message) => {
    setToast(message);
    setTimeout(() => setToast(null), 2200);
  }, []);

  const stats = useMemo(
    () => computeStats(mission.waypoints, mission.settings),
    [mission.waypoints, mission.settings]
  );

  const takeoffPoint = mission.settings?.takeOffRefPoint ?? null;

  const handleAddWaypoint = ({ lat, lng }) => {
    if (mission.locked) return showToast('This wayline is locked');
    addWaypoint({ lat, lng });
  };

  const handlePlacePoint = ({ lat, lng }, mode) => {
    if (mode === 'takeoff') {
      setSettings({ takeOffRefPoint: { lat, lng, alt: 0 } });
      showToast('Reference takeoff point set');
    }
    setPlacementMode(null);
  };

  const handleSave = async ({ name, description }) => {
    try {
      const saved = await saveMission({ name, description });
      setSaveOpen(false);
      showToast('Saved');
      if (!id) navigate(`/editor/${saved.id}`, { replace: true });
    } catch {
      // The error is surfaced by the dialog from store state.
    }
  };

  const requestSave = () => {
    if (!mission.waypoints.length) return showToast('Add at least one waypoint first');
    if (mission.name) {
      handleSave({ name: mission.name, description: mission.description });
    } else {
      setSaveOpen(true);
    }
  };

  const handleClear = () => {
    if (!mission.waypoints.length) return;
    // eslint-disable-next-line no-alert
    if (window.confirm('Remove every waypoint from this mission?')) clearWaypoints();
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner label="Loading mission…" />
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* ------------------------------------------------------------ left panel */}
      <aside className="flex w-72 shrink-0 flex-col border-r border-panel-700 bg-panel-900">
        <div className="border-b border-panel-700 px-3 py-2">
          <div className="flex items-center gap-2">
            <h1 className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-100">
              {mission.name || 'Untitled mission'}
            </h1>
            {dirty && (
              <span
                title="Unsaved changes"
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"
              />
            )}
          </div>
          <p className="mt-0.5 truncate text-[11px] text-slate-500">
            {ROUTE_TYPE_LABELS[mission.route_type] ?? mission.route_type}
            {' · '}
            {meta?.aircraft?.[mission.aircraft_series]?.models?.[mission.aircraft_model]?.label ??
              mission.aircraft_model}
          </p>
        </div>

        <StatsBar stats={stats} />

        {/* toolbar */}
        <div className="flex items-center gap-1 border-b border-panel-700 px-2 py-1.5">
          <button
            type="button"
            onClick={requestSave}
            disabled={saving || mission.locked}
            title="Save wayline"
            className="btn-primary flex-1 px-2 py-1 text-xs"
          >
            <LuSave className="h-3.5 w-3.5" />
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={undo}
            disabled={!historyLength}
            title="Undo last change"
            className="btn-ghost p-1.5"
          >
            <LuUndo2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={reverseRoute}
            disabled={mission.waypoints.length < 2}
            title="Reverse flight route"
            className="btn-ghost p-1.5"
          >
            <LuArrowUpDown className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={handleClear}
            disabled={!mission.waypoints.length}
            title="Clear mission"
            className="btn-ghost p-1.5"
          >
            <LuTrash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="border-b border-panel-700 px-2 py-1.5">
          <button
            type="button"
            onClick={() => setPlacementMode(placementMode === 'takeoff' ? null : 'takeoff')}
            className={`btn w-full px-2 py-1 text-xs ${
              placementMode === 'takeoff'
                ? 'bg-accent text-white'
                : takeoffPoint
                  ? 'bg-panel-700 text-slate-300 hover:bg-panel-600'
                  : 'bg-panel-700 text-slate-300 hover:bg-panel-600'
            }`}
          >
            <LuHouse className="h-3.5 w-3.5" />
            {takeoffPoint ? 'Takeoff point set' : 'Set reference takeoff point'}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-panel-800 bg-panel-900 px-3 py-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Waypoints
            </span>
            <span className="font-mono text-[11px] text-slate-500">{mission.waypoints.length}</span>
          </div>

          <WaypointList
            waypoints={mission.waypoints}
            selectedIndex={selectedWaypoint}
            selectedAction={selectedAction}
            onSelect={selectWaypoint}
            onSelectAction={selectAction}
            onRemove={removeWaypoint}
            onReorder={reorderWaypoints}
          />
        </div>

        {error && (
          <div className="border-t border-panel-700 p-2">
            <ErrorBanner message={error} onDismiss={clearError} />
          </div>
        )}
      </aside>

      {/* ------------------------------------------------------------ map */}
      <div className="relative min-w-0 flex-1">
        <MapCanvas
          waypoints={mission.waypoints}
          takeoffPoint={takeoffPoint}
          selectedIndex={selectedWaypoint}
          placementMode={placementMode}
          onAddWaypoint={handleAddWaypoint}
          onMoveWaypoint={moveWaypoint}
          onSelectWaypoint={selectWaypoint}
          onPlacePoint={handlePlacePoint}
          fitTrigger={fitTrigger}
        />

        {mission.locked && (
          <div className="pointer-events-none absolute inset-x-0 bottom-6 z-[400] flex justify-center">
            <div className="flex items-center gap-2 rounded-full border border-amber-500/40 bg-panel-900/95 px-4 py-1.5 text-xs text-amber-300 shadow-lg">
              <LuCircleAlert className="h-3.5 w-3.5" />
              This wayline is locked — unlock it in the library to edit
            </div>
          </div>
        )}

        {toast && (
          <div className="pointer-events-none absolute inset-x-0 bottom-6 z-[500] flex justify-center">
            <div className="rounded-full bg-panel-900/95 px-4 py-1.5 text-xs text-slate-200 shadow-lg ring-1 ring-panel-600">
              {toast}
            </div>
          </div>
        )}
      </div>

      <SaveMissionDialog
        open={saveOpen}
        initialName={mission.name}
        initialDescription={mission.description}
        saving={saving}
        error={error}
        onSave={handleSave}
        onClose={() => setSaveOpen(false)}
      />
    </div>
  );
}
