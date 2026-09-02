/**
 * Zustand store for the mission currently being edited.
 *
 * Holds the in-progress wayline (settings + waypoints + their actions), tracks a
 * dirty flag, and keeps a small undo history so the editor can offer "undo last".
 * Persistence is explicit — nothing is written to the server until `markSaved`
 * is called by the page after a successful request.
 */
import { create } from 'zustand';
import api from './api.js';

const HISTORY_LIMIT = 50;

/** A brand-new, unsaved mission. `settings` is filled from /api/meta on load. */
const emptyMission = () => ({
  id: null,
  name: '',
  description: '',
  folder_id: null,
  route_type: 'waypoint',
  aircraft_series: 'M30',
  aircraft_model: 'M30T',
  payload_model: null,
  locked: false,
  settings: {},
  geometry: null,
  waypoints: [],
});

/** Client-side id for a waypoint or action that has not been saved yet. */
let localIdCounter = 0;
const localId = () => `local-${Date.now()}-${(localIdCounter += 1)}`;

/**
 * The four attitude actions written by "synchronize attitude on new waypoint" and
 * re-written by "Record Attitude" (feature-reference §4, §6).
 *
 * We have no 3D virtual aircraft to read a live attitude from, so the capture is
 * seeded from the waypoint's own heading and any attitude values already on it,
 * falling back to the documented defaults.
 */
function attitudeActions(waypoint = {}, settings = {}) {
  const existing = {};
  for (const action of waypoint.actions ?? []) existing[action.action_type] = action.params ?? {};

  const heading =
    existing.rotateYaw?.aircraftHeading ??
    (waypoint.heading_mode === 'manually' ? (waypoint.heading_angle ?? 0) : 0);

  return [
    {
      id: localId(),
      action_type: 'rotateYaw',
      params: {
        aircraftHeading: heading,
        aircraftPathMode: existing.rotateYaw?.aircraftPathMode ?? 'counterClockwise',
      },
    },
    { id: localId(), action_type: 'gimbalYaw', params: { angle: existing.gimbalYaw?.angle ?? 0 } },
    { id: localId(), action_type: 'gimbalTilt', params: { angle: existing.gimbalTilt?.angle ?? 0 } },
    { id: localId(), action_type: 'zoom', params: { zoomRatio: existing.zoom?.zoomRatio ?? 5 } },
  ];
}

const ATTITUDE_TYPES = ['rotateYaw', 'gimbalYaw', 'gimbalTilt', 'zoom'];

export const useMissionStore = create((set, get) => ({
  mission: emptyMission(),
  meta: null,
  dirty: false,
  loading: false,
  saving: false,
  error: null,

  /** Index of the selected waypoint, or null. */
  selectedWaypoint: null,
  /** Index of the selected action within the selected waypoint, or null. */
  selectedAction: null,

  history: [],

  // ------------------------------------------------------------------ meta

  async loadMeta() {
    if (get().meta) return get().meta;
    const meta = await api.meta();
    set((s) => ({
      meta,
      // A fresh mission starts from the documented defaults.
      mission: s.mission.id
        ? s.mission
        : { ...s.mission, settings: { ...meta.defaultSettings } },
    }));
    return meta;
  },

  // ------------------------------------------------------------------ history

  /** Snapshot the current waypoints so the change can be undone. */
  pushHistory() {
    set((s) => ({
      history: [...s.history, JSON.stringify(s.mission.waypoints)].slice(-HISTORY_LIMIT),
    }));
  },

  undo() {
    const { history } = get();
    if (!history.length) return;
    const previous = history[history.length - 1];
    set((s) => ({
      mission: { ...s.mission, waypoints: JSON.parse(previous) },
      history: s.history.slice(0, -1),
      dirty: true,
      selectedWaypoint: null,
      selectedAction: null,
    }));
  },

  get canUndo() {
    return get().history.length > 0;
  },

  // ------------------------------------------------------------------ mission lifecycle

  newMission(overrides = {}) {
    const { meta } = get();
    set({
      mission: {
        ...emptyMission(),
        settings: { ...(meta?.defaultSettings ?? {}) },
        ...overrides,
      },
      dirty: false,
      history: [],
      selectedWaypoint: null,
      selectedAction: null,
      error: null,
    });
  },

  async loadMission(id) {
    set({ loading: true, error: null });
    try {
      const mission = await api.waylines.get(id);
      set({
        mission,
        dirty: false,
        history: [],
        selectedWaypoint: null,
        selectedAction: null,
        loading: false,
      });
      return mission;
    } catch (err) {
      set({ error: err.message, loading: false });
      throw err;
    }
  },

  /** Create or update on the server, depending on whether the mission has an id. */
  async saveMission(fields = {}) {
    const mission = { ...get().mission, ...fields };
    set({ saving: true, error: null });
    try {
      const payload = {
        name: mission.name,
        description: mission.description,
        folder_id: mission.folder_id,
        route_type: mission.route_type,
        aircraft_series: mission.aircraft_series,
        aircraft_model: mission.aircraft_model,
        payload_model: mission.payload_model,
        settings: mission.settings,
        geometry: mission.geometry,
        waypoints: mission.waypoints.map(stripLocalIds),
      };
      const saved = mission.id
        ? await api.waylines.update(mission.id, payload)
        : await api.waylines.create(payload);

      set({ mission: saved, dirty: false, saving: false, history: [] });
      return saved;
    } catch (err) {
      set({ error: err.message, saving: false });
      throw err;
    }
  },

  setMissionFields(fields) {
    set((s) => ({ mission: { ...s.mission, ...fields }, dirty: true }));
  },

  setSettings(partial) {
    set((s) => ({
      mission: { ...s.mission, settings: { ...s.mission.settings, ...partial } },
      dirty: true,
    }));
  },

  setGeometry(geometry) {
    set((s) => ({ mission: { ...s.mission, geometry }, dirty: true }));
  },

  /**
   * Install a freshly generated mapping route.
   *
   * Deliberately does not push undo history: regeneration fires on every settings
   * change, so recording each one would bury the user's own edits. Undo for these
   * routes is the geometry and the settings, both of which are still restorable.
   *
   * If the generated route is identical to what is already loaded, nothing is
   * written at all — otherwise merely opening a saved mapping route would
   * regenerate it, mark the mission dirty and trip the unsaved-changes guard.
   */
  applyGeneratedRoute(waypoints) {
    if (sameRoute(get().mission.waypoints, waypoints)) return;
    set((s) => ({
      mission: { ...s.mission, waypoints },
      dirty: true,
      selectedWaypoint: null,
      selectedAction: null,
    }));
  },

  /** Replace the whole waypoint array — used by the route generators. */
  replaceWaypoints(waypoints) {
    get().pushHistory();
    set((s) => ({
      mission: { ...s.mission, waypoints },
      dirty: true,
      selectedWaypoint: null,
      selectedAction: null,
    }));
  },

  // ------------------------------------------------------------------ waypoints

  addWaypoint(partial) {
    const { mission, meta } = get();
    const settings = mission.settings ?? {};
    const waypoint = {
      id: localId(),
      lat: partial.lat,
      lng: partial.lng,
      height: partial.height ?? settings.globalHeight ?? 100,
      ellipsoid_height: null,
      speed: null,
      heading_mode: settings.headingMode ?? 'followWayline',
      heading_angle: 0,
      heading_path_mode: 'followBadArc',
      poi_lat: 0,
      poi_lng: 0,
      poi_alt: 0,
      turn_mode: settings.turnMode ?? 'toPointAndStopWithDiscontinuityCurvature',
      turn_damping_dist: 0.2,
      use_global_speed: true,
      use_global_height: true,
      use_global_heading: true,
      use_global_turn: true,
      use_straight_line: settings.useStraightLine ?? true,
      actions: [],
      ...partial,
    };

    // Mirrors the reference behaviour: with "synchronize attitude" on, a new
    // waypoint captures the current aircraft/gimbal/zoom attitude as actions.
    if (settings.syncAttitudeOnNewWaypoint && meta) {
      waypoint.actions = attitudeActions(waypoint, settings);
    }

    get().pushHistory();
    set((s) => ({
      mission: { ...s.mission, waypoints: [...s.mission.waypoints, waypoint] },
      dirty: true,
      selectedWaypoint: s.mission.waypoints.length,
      selectedAction: null,
    }));
    return waypoint;
  },

  updateWaypoint(index, fields) {
    set((s) => {
      const waypoints = s.mission.waypoints.map((w, i) => (i === index ? { ...w, ...fields } : w));
      return { mission: { ...s.mission, waypoints }, dirty: true };
    });
  },

  /** Live position update while dragging — deliberately does not push history. */
  moveWaypoint(index, lat, lng) {
    set((s) => {
      const waypoints = s.mission.waypoints.map((w, i) => (i === index ? { ...w, lat, lng } : w));
      return { mission: { ...s.mission, waypoints }, dirty: true };
    });
  },

  removeWaypoint(index) {
    get().pushHistory();
    set((s) => {
      const waypoints = s.mission.waypoints.filter((_, i) => i !== index);
      return {
        mission: { ...s.mission, waypoints },
        dirty: true,
        selectedWaypoint: null,
        selectedAction: null,
      };
    });
  },

  reorderWaypoints(from, to) {
    if (from === to) return;
    get().pushHistory();
    set((s) => {
      const waypoints = [...s.mission.waypoints];
      const [moved] = waypoints.splice(from, 1);
      waypoints.splice(to, 0, moved);
      return { mission: { ...s.mission, waypoints }, dirty: true, selectedWaypoint: to };
    });
  },

  reverseRoute() {
    get().pushHistory();
    set((s) => ({
      mission: { ...s.mission, waypoints: [...s.mission.waypoints].reverse() },
      dirty: true,
      selectedWaypoint: null,
      selectedAction: null,
    }));
  },

  clearWaypoints() {
    get().pushHistory();
    set((s) => ({
      mission: { ...s.mission, waypoints: [], geometry: null },
      dirty: true,
      selectedWaypoint: null,
      selectedAction: null,
    }));
  },

  // ------------------------------------------------------------------ actions

  addAction(waypointIndex, actionType, params = {}) {
    get().pushHistory();
    let newIndex = 0;
    set((s) => {
      const waypoints = s.mission.waypoints.map((w, i) => {
        if (i !== waypointIndex) return w;
        newIndex = w.actions.length;
        return {
          ...w,
          actions: [...w.actions, { id: localId(), action_type: actionType, params }],
        };
      });
      return { mission: { ...s.mission, waypoints }, dirty: true };
    });
    set({ selectedWaypoint: waypointIndex, selectedAction: newIndex });
  },

  updateAction(waypointIndex, actionIndex, params) {
    set((s) => {
      const waypoints = s.mission.waypoints.map((w, i) => {
        if (i !== waypointIndex) return w;
        const actions = w.actions.map((a, j) =>
          j === actionIndex ? { ...a, params: { ...a.params, ...params } } : a
        );
        return { ...w, actions };
      });
      return { mission: { ...s.mission, waypoints }, dirty: true };
    });
  },

  /**
   * "Record Attitude" — replaces this waypoint's attitude actions with a freshly
   * captured set, leaving every other action untouched and in order.
   */
  recordCurrentAttitude(waypointIndex) {
    get().pushHistory();
    set((s) => {
      const settings = s.mission.settings ?? {};
      const waypoints = s.mission.waypoints.map((w, i) => {
        if (i !== waypointIndex) return w;
        const others = (w.actions ?? []).filter((a) => !ATTITUDE_TYPES.includes(a.action_type));
        return { ...w, actions: [...attitudeActions(w, settings), ...others] };
      });
      return { mission: { ...s.mission, waypoints }, dirty: true, selectedAction: 0 };
    });
  },

  removeAction(waypointIndex, actionIndex) {
    get().pushHistory();
    set((s) => {
      const waypoints = s.mission.waypoints.map((w, i) =>
        i === waypointIndex ? { ...w, actions: w.actions.filter((_, j) => j !== actionIndex) } : w
      );
      return { mission: { ...s.mission, waypoints }, dirty: true, selectedAction: null };
    });
  },

  // ------------------------------------------------------------------ selection

  selectWaypoint(index) {
    set({ selectedWaypoint: index, selectedAction: null });
  },

  selectAction(waypointIndex, actionIndex) {
    set({ selectedWaypoint: waypointIndex, selectedAction: actionIndex });
  },

  clearSelection() {
    set({ selectedWaypoint: null, selectedAction: null });
  },

  clearError() {
    set({ error: null });
  },
}));

/**
 * Whether two waypoint lists describe the same flight path.
 *
 * Compares position and altitude only: generated waypoints carry synthetic ids
 * while saved ones carry database ids, so the ids can never match even when the
 * routes are identical.
 */
function sameRoute(a = [], b = []) {
  if (a.length !== b.length) return false;
  const EPSILON = 1e-9;
  return a.every((left, i) => {
    const right = b[i];
    return (
      Math.abs(left.lat - right.lat) < EPSILON &&
      Math.abs(left.lng - right.lng) < EPSILON &&
      Math.abs((left.height ?? 0) - (right.height ?? 0)) < EPSILON &&
      (left.actions?.length ?? 0) === (right.actions?.length ?? 0)
    );
  });
}

/** Drop client-only ids before sending to the server, which assigns real ones. */
function stripLocalIds(waypoint) {
  const { id, actions, ...rest } = waypoint;
  return {
    ...rest,
    actions: (actions ?? []).map(({ id: actionId, order_index, ...action }) => action),
  };
}

export default useMissionStore;
