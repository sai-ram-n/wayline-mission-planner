/**
 * Flight route display settings — docs/feature-reference.md §3.
 *
 * Four toggles behind the editor's gear button, all defaulting **off** as the
 * reference does, plus the "synchronize attitude on new waypoint" toggle, which
 * defaults on and is the one setting here that belongs to the mission rather
 * than the view.
 *
 * The four display toggles are view state, not mission data: they must never
 * mark the mission dirty, so they live in the editor rather than the store and
 * persist per-browser in localStorage.
 */
import { useEffect, useRef, useState } from 'react';
import { LuSettings2 } from 'react-icons/lu';
import { NumberStepper, ToggleField } from '../ui/Field.jsx';

const STORAGE_KEY = 'wmp.displaySettings';

export const DEFAULT_DISPLAY_SETTINGS = {
  // Deviation from §3, which has every toggle default off: waypoint markers are
  // how you select and drag a waypoint here, so starting with them hidden would
  // make the editor unusable. The toggle still works, it just starts on.
  displayWaypoints: true,
  displayGimbalOrientation: false,
  displayVerticalLines: false,
  boldLineMode: false,
  // Camera coverage wedges (docs/waypoint-camera-visuals.md §2).
  displayCameraCoverage: false,
};

/**
 * `displayWaypoints` is deliberately not persisted.
 *
 * Hiding the markers is a useful momentary "let me see the map" gesture, but the
 * markers are also the only way to select or drag a waypoint. Remembering the
 * off state across sessions leaves the editor looking broken with no obvious
 * cause, so it always comes back on.
 */
const PERSISTED_KEYS = [
  'displayGimbalOrientation',
  'displayVerticalLines',
  'boldLineMode',
  'displayCameraCoverage',
];

/** Read the saved view preferences, tolerating a blocked or empty store. */
export function loadDisplaySettings() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_DISPLAY_SETTINGS };
    const saved = JSON.parse(raw);
    const restored = { ...DEFAULT_DISPLAY_SETTINGS };
    for (const key of PERSISTED_KEYS) {
      if (typeof saved?.[key] === 'boolean') restored[key] = saved[key];
    }
    return restored;
  } catch {
    return { ...DEFAULT_DISPLAY_SETTINGS };
  }
}

const TOGGLES = [
  {
    key: 'displayWaypoints',
    label: 'Display Waypoints',
    hint: 'Show the numbered waypoint markers on the map.',
  },
  {
    key: 'displayGimbalOrientation',
    label: 'Display Gimbal Orientation',
    hint: 'Draw a fan at each waypoint showing which way the aircraft faces there.',
  },
  {
    key: 'displayVerticalLines',
    label: 'Display Vertical Lines',
    hint: 'Draw a vertical drop line beneath each waypoint to suggest its altitude.',
  },
  {
    key: 'boldLineMode',
    label: 'Bold Line Mode',
    hint: 'Thicken the route line so it stays visible over busy imagery.',
  },
  {
    key: 'displayCameraCoverage',
    label: 'Display Camera Coverage',
    hint:
      'Shade what the camera sees from each waypoint: amber for the wide lens, ' +
      'green for the view narrowed by that waypoint\u2019s zoom ratio.',
    // Only aircraft with a measured field of view can draw this honestly.
    requiresCoverage: true,
  },
];

export default function DisplaySettingsMenu({
  value,
  onChange,
  syncAttitude,
  onSyncAttitudeChange,
  minAltitudeAlert,
  onMinAltitudeAlertChange,
  disabled = false,
  // Whether the selected aircraft has a measured camera field of view.
  coverageAvailable = false,
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => {
      if (!ref.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const set = (key) => (next) => {
    const updated = { ...value, [key]: next };
    onChange(updated);
    try {
      const toSave = Object.fromEntries(PERSISTED_KEYS.map((k) => [k, !!updated[k]]));
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch {
      // A blocked storage API must not break the toggle itself.
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title="Flight route display settings"
        className="btn-ghost p-1.5"
      >
        <LuSettings2 className="h-3.5 w-3.5" />
      </button>

      {/*
        z-[1000], not z-50. The Leaflet container is positioned but has no
        z-index, so it creates no stacking context and its panes (z-400 and up)
        compete at the root — a z-50 menu is painted underneath the map and is
        unreadable and unclickable. Our own map overlays top out at z-[460].
      */}
      {open && (
        <div className="absolute left-0 top-full z-[1000] mt-1 w-64 space-y-2 rounded-md border border-panel-600 bg-panel-800 p-2.5 shadow-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Display settings
          </p>
          {TOGGLES.map((toggle) => {
            /*
              Coverage needs a measured field of view for the chosen aircraft.
              Only the Matrice 4TD has one, so for anything else the row is shown
              disabled with the reason rather than silently missing or drawing a
              footprint we invented. Same treatment as terrain following.
            */
            const unavailable = toggle.requiresCoverage && !coverageAvailable;
            return (
              <ToggleField
                key={toggle.key}
                label={toggle.label}
                hint={
                  unavailable
                    ? 'No measured field of view for this aircraft, so a footprint would be guesswork.'
                    : toggle.hint
                }
                value={!unavailable && !!value[toggle.key]}
                onChange={set(toggle.key)}
                disabled={disabled || unavailable}
              />
            );
          })}

          <div className="border-t border-panel-700 pt-2">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Edit settings
            </p>
            <ToggleField
              label="Synchronize attitude on new waypoint"
              hint="Capture the current heading, gimbal angles and zoom as actions whenever a waypoint is added."
              value={!!syncAttitude}
              onChange={onSyncAttitudeChange}
              disabled={disabled}
            />

            <div className="mt-2">
              <NumberStepper
                label="Min Flight Route Altitude Alert (AGL)"
                hint="Warn when a waypoint sits below this height above ground."
                value={minAltitudeAlert ?? 20}
                onChange={onMinAltitudeAlertChange}
                min={0}
                max={1500}
                steps={[1, 10]}
                unit="m"
                decimals={1}
                disabled={disabled}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
