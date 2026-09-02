/**
 * Mission editor: waypoint list and stats on the left, map in the middle, and the
 * inspector on the right — route settings, or the selected waypoint's settings
 * and its actions.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  LuSave,
  LuUndo2,
  LuTrash2,
  LuArrowUpDown,
  LuHouse,
  LuCircleAlert,
  LuPencilRuler,
  LuRotateCcw,
  LuX,
} from 'react-icons/lu';

import MapCanvas from '../components/editor/MapCanvas.jsx';
import StatsBar from '../components/editor/StatsBar.jsx';
import WaypointList from '../components/editor/WaypointList.jsx';
import SaveMissionDialog from '../components/editor/SaveMissionDialog.jsx';
import GlobalSettingsPanel from '../components/editor/GlobalSettingsPanel.jsx';
import WaypointPanel from '../components/editor/WaypointPanel.jsx';
import ActionEditor from '../components/editor/ActionEditor.jsx';
import MappingSettingsPanel from '../components/editor/MappingSettingsPanel.jsx';
import DisplaySettingsMenu, {
  loadDisplaySettings,
} from '../components/editor/DisplaySettingsMenu.jsx';
import useEditorShortcuts, { SHORTCUTS } from '../hooks/useEditorShortcuts.js';
import ErrorBanner from '../components/ui/ErrorBanner.jsx';
import Spinner from '../components/ui/Spinner.jsx';
import useMissionStore from '../store.js';
import { computeStats } from '../lib/geo.js';
import { generateRoute, lineLength, polygonArea } from '../lib/routegen.js';
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
    setGeometry,
    applyGeneratedRoute,
    newMission: resetMission,
  } = useMissionStore.getState();

  const [saveOpen, setSaveOpen] = useState(false);
  const [placementMode, setPlacementMode] = useState(null);
  const [fitTrigger, setFitTrigger] = useState(0);
  const [toast, setToast] = useState(null);
  const [inspectorTab, setInspectorTab] = useState('route');
  const [drawMode, setDrawMode] = useState(null);
  const [draft, setDraft] = useState([]);
  const [generated, setGenerated] = useState(null);
  const [searchParams] = useSearchParams();
  const [display, setDisplay] = useState(loadDisplaySettings);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // Selecting a waypoint switches the inspector to it, as the reference does.
  useEffect(() => {
    if (selectedWaypoint != null) setInspectorTab('waypoint');
  }, [selectedWaypoint]);

  // Load the requested mission, or start a blank one of the requested route type.
  useEffect(() => {
    if (id) {
      loadMission(id)
        .then(() => setFitTrigger((n) => n + 1))
        .catch(() => {});
      return;
    }
    const requested = searchParams.get('type');
    const routeType = ['waypoint', 'area', 'linear'].includes(requested) ? requested : 'waypoint';

    // Landing on /editor with no id always starts a fresh route. Comparing against
    // the current mission first would skip the query parameters whenever they
    // happen to match the defaults, silently dropping the name and aircraft the
    // library's Create Route dialog passed in.
    startRoute(routeType, {
      series: searchParams.get('series'),
      model: searchParams.get('model'),
      payload: searchParams.get('payload'),
      name: searchParams.get('name'),
      folder: searchParams.get('folder'),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, searchParams]);

  /**
   * Start a blank route of a given type, seeded with that type's own defaults —
   * an area route starts in AGL at 15 m/s, a waypoint route in ASL at 10 (§5, §8).
   */
  const startRoute = useCallback(
    (routeType, aircraft = {}) => {
      // Read live state rather than closing over `mission`, which would be stale
      // by the time a later click calls this.
      const { meta, mission: current } = useMissionStore.getState();
      const extra =
        routeType === 'area'
          ? meta?.defaultMappingSettings
          : routeType === 'linear'
            ? meta?.defaultLinearSettings
            : null;

      // Honour the §1 compatibility matrix: if the current aircraft cannot fly
      // this route type, fall back to the first series that can.
      const allowed = meta?.routeTypeAircraft?.[routeType] ?? [];
      let series = aircraft.series ?? current.aircraft_series;
      let model = aircraft.model ?? current.aircraft_model;
      if (!meta?.aircraft?.[series]) {
        series = current.aircraft_series;
        model = current.aircraft_model;
      }
      if (allowed.length && !allowed.includes(series)) {
        series = allowed[0];
        model = Object.keys(meta?.aircraft?.[series]?.models ?? {})[0] ?? model;
      }

      resetMission({
        route_type: routeType,
        aircraft_series: series,
        aircraft_model: model,
        payload_model: aircraft.payload ?? null,
        // The library's Create Route dialog names the route up front, so the
        // first save goes straight through without prompting again.
        name: aircraft.name ?? '',
        folder_id: aircraft.folder ?? null,
        settings: { ...(meta?.defaultSettings ?? {}), ...(extra ?? {}) },
      });
      setDraft([]);
      setGenerated(null);
      setDrawMode(null);
    },
    [resetMission]
  );

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

  // Shortcuts are disabled while a dialog owns the keyboard.
  useEditorShortcuts({
    enabled: !saveOpen && !shortcutsOpen,
    onShowHelp: () => setShortcutsOpen(true),
  });

  const stats = useMemo(
    () => computeStats(mission.waypoints, mission.settings),
    [mission.waypoints, mission.settings]
  );

  const isMapping = mission.route_type === 'area' || mission.route_type === 'linear';

  /* ------------------------------------------------------- drawing a shape */

  const startDrawing = () => {
    if (mission.locked) return showToast('This wayline is locked');
    setDraft([]);
    setDrawMode(mission.route_type);
  };

  const handleDrawVertex = ({ lat, lng }) => setDraft((d) => [...d, [lat, lng]]);

  // Reads `draft` directly rather than committing from inside a setState updater:
  // updaters must stay pure, and React re-invokes them.
  const handleFinishDrawing = useCallback(() => {
    const minimum = mission.route_type === 'area' ? 3 : 2;
    if (draft.length < minimum) {
      showToast(
        mission.route_type === 'area'
          ? 'An area needs at least three points'
          : 'A centre line needs at least two points'
      );
      return;
    }
    setGeometry({ kind: mission.route_type, vertices: draft });
    setDrawMode(null);
    setDraft([]);
  }, [draft, mission.route_type, setGeometry, showToast]);

  const handleCancelDrawing = useCallback(() => {
    setDraft([]);
    setDrawMode(null);
  }, []);

  const handleMoveGeometryVertex = (index, lat, lng) => {
    const vertices = (mission.geometry?.vertices ?? []).map((v, i) =>
      i === index ? [lat, lng] : v
    );
    setGeometry({ ...mission.geometry, vertices });
  };

  const clearGeometry = () => {
    setGeometry(null);
    setGenerated(null);
    clearWaypoints();
  };

  /* --------------------------------------------------------- regeneration */

  // Regenerating on every settings change keeps the preview honest; the small
  // delay stops a slider drag from running the generator on every frame.
  const mappingSettings = mission.settings;
  useEffect(() => {
    if (!isMapping) return undefined;
    const geometry = mission.geometry;
    if (!geometry?.vertices?.length || drawMode) return undefined;

    const meta = useMissionStore.getState().meta;
    const sensor =
      meta?.mappingSensors?.[mission.aircraft_model] ?? meta?.defaultMappingSensor;

    const timer = setTimeout(() => {
      const result = generateRoute(mission.route_type, geometry, mappingSettings, sensor);
      if (!result) return;
      setGenerated(result);
      applyGeneratedRoute(result.waypoints);
    }, 120);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMapping, mission.geometry, mappingSettings, mission.route_type, drawMode]);

  /** Area and centre-line length shown in the stats bar for mapping routes. */
  const shapeArea = useMemo(() => {
    if (!isMapping) return null;
    if (generated?.area) return generated.area;
    const vertices = mission.geometry?.vertices;
    if (!vertices?.length) return null;
    return mission.route_type === 'area' ? polygonArea(vertices) : 0;
  }, [isMapping, generated, mission.geometry, mission.route_type]);

  const centerLineLength = useMemo(
    () =>
      mission.route_type === 'linear' && mission.geometry?.vertices
        ? lineLength(mission.geometry.vertices)
        : null,
    [mission.route_type, mission.geometry]
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

        <StatsBar stats={stats} area={shapeArea} centerLineLength={centerLineLength} />

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
          <DisplaySettingsMenu
            value={display}
            onChange={setDisplay}
            syncAttitude={mission.settings?.syncAttitudeOnNewWaypoint}
            onSyncAttitudeChange={(v) => setSettings({ syncAttitudeOnNewWaypoint: v })}
            disabled={mission.locked}
          />
        </div>

        {/* Route type — only while the mission is still empty and unsaved. */}
        {!mission.id && !mission.waypoints.length && !mission.geometry && (
          <div className="border-b border-panel-700 px-2 py-1.5">
            <div className="flex rounded-md border border-panel-600 bg-panel-800 p-0.5">
              {[
                { value: 'waypoint', label: 'Waypoint' },
                { value: 'area', label: 'Area' },
                { value: 'linear', label: 'Linear' },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  title={
                    (meta?.routeTypeAircraft?.[option.value] ?? []).includes(
                      mission.aircraft_series
                    )
                      ? undefined
                      : `${mission.aircraft_model} cannot fly this route type — choosing it switches to a compatible aircraft`
                  }
                  onClick={() => startRoute(option.value)}
                  className={`min-w-0 flex-1 truncate rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                    mission.route_type === option.value
                      ? 'bg-accent text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Drawing controls for mapping routes. */}
        {isMapping && (
          <div className="flex gap-1 border-b border-panel-700 px-2 py-1.5">
            <button
              type="button"
              onClick={startDrawing}
              disabled={mission.locked || !!drawMode}
              className="btn-secondary min-w-0 flex-1 px-2 py-1 text-xs"
            >
              <LuPencilRuler className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {mission.geometry
                  ? mission.route_type === 'area'
                    ? 'Redraw area'
                    : 'Redraw centre line'
                  : mission.route_type === 'area'
                    ? 'Draw area'
                    : 'Draw centre line'}
              </span>
            </button>
            {mission.geometry && (
              <button
                type="button"
                onClick={clearGeometry}
                disabled={mission.locked}
                title="Remove the drawn shape and its route"
                className="btn-ghost p-1.5"
              >
                <LuTrash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}

        <div className="flex gap-1 border-b border-panel-700 px-2 py-1.5">
          <button
            type="button"
            onClick={() => setPlacementMode(placementMode === 'takeoff' ? null : 'takeoff')}
            disabled={mission.locked}
            className={`btn min-w-0 flex-1 px-2 py-1 text-xs ${
              placementMode === 'takeoff'
                ? 'bg-accent text-white'
                : 'bg-panel-700 text-slate-300 hover:bg-panel-600'
            }`}
          >
            <LuHouse className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {takeoffPoint ? 'Takeoff point set' : 'Set reference takeoff point'}
            </span>
          </button>
          {/* "Reset Takeoff Point" (§5) — the point can be cleared once set. */}
          {takeoffPoint && (
            <button
              type="button"
              onClick={() => {
                setSettings({ takeOffRefPoint: null });
                setPlacementMode(null);
                showToast('Takeoff point reset');
              }}
              disabled={mission.locked}
              title="Reset Takeoff Point"
              className="btn-ghost shrink-0 p-1.5"
            >
              <LuRotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
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
          drawMode={drawMode}
          draft={draft}
          geometry={mission.geometry}
          generatedLines={generated?.lines ?? []}
          onDrawVertex={handleDrawVertex}
          onFinishDrawing={handleFinishDrawing}
          onCancelDrawing={handleCancelDrawing}
          onMoveGeometryVertex={handleMoveGeometryVertex}
          display={display}
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

      {/* ------------------------------------------------------------ inspector */}
      <aside className="flex w-80 shrink-0 flex-col border-l border-panel-700 bg-panel-900">
        <div
          role="tablist"
          className="flex shrink-0 border-b border-panel-700 bg-panel-900 px-2 py-1.5"
        >
          {[
            { id: 'route', label: 'Route settings' },
            {
              id: 'waypoint',
              label:
                selectedWaypoint != null ? `Waypoint ${selectedWaypoint + 1}` : 'Waypoint',
            },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={inspectorTab === tab.id}
              disabled={tab.id === 'waypoint' && selectedWaypoint == null}
              onClick={() => setInspectorTab(tab.id)}
              className={`min-w-0 flex-1 truncate rounded px-2 py-1 text-xs font-medium transition-colors disabled:opacity-40 ${
                inspectorTab === tab.id
                  ? 'bg-panel-700 text-slate-100'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {inspectorTab === 'route' ? (
            isMapping ? (
              <MappingSettingsPanel disabled={mission.locked} />
            ) : (
              <GlobalSettingsPanel disabled={mission.locked} />
            )
          ) : selectedWaypoint != null ? (
            <>
              <WaypointPanel index={selectedWaypoint} disabled={mission.locked} />
              <ActionEditor waypointIndex={selectedWaypoint} disabled={mission.locked} />
            </>
          ) : (
            <p className="px-3 py-6 text-center text-xs text-slate-500">
              Select a waypoint to edit it.
            </p>
          )}
        </div>
      </aside>

      {shortcutsOpen && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShortcutsOpen(false)}
        >
          <div className="panel w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="panel-header">
              <h2 className="text-sm font-semibold text-slate-100">Keyboard shortcuts</h2>
              <button
                type="button"
                onClick={() => setShortcutsOpen(false)}
                className="btn-ghost p-1"
                aria-label="Close"
              >
                <LuX className="h-4 w-4" />
              </button>
            </div>
            <dl className="space-y-1.5 p-4">
              {SHORTCUTS.map((shortcut) => (
                <div key={shortcut.keys} className="flex items-baseline gap-3">
                  <dt className="w-24 shrink-0 font-mono text-[11px] text-slate-300">
                    {shortcut.keys}
                  </dt>
                  <dd className="min-w-0 flex-1 text-[11px] text-slate-400">
                    {shortcut.description}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}

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
