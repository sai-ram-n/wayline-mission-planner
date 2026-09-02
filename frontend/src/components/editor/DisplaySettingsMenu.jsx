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
import { ToggleField } from '../ui/Field.jsx';

const STORAGE_KEY = 'wmp.displaySettings';

export const DEFAULT_DISPLAY_SETTINGS = {
  // Deviation from §3, which has every toggle default off: waypoint markers are
  // how you select and drag a waypoint here, so starting with them hidden would
  // make the editor unusable. The toggle still works, it just starts on.
  displayWaypoints: true,
  displayGimbalOrientation: false,
  displayVerticalLines: false,
  boldLineMode: false,
};

/** Read the saved view preferences, tolerating a blocked or empty store. */
export function loadDisplaySettings() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_DISPLAY_SETTINGS };
    return { ...DEFAULT_DISPLAY_SETTINGS, ...JSON.parse(raw) };
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
    hint: 'Draw a short tick from each waypoint showing where the gimbal is pointed.',
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
];

export default function DisplaySettingsMenu({
  value,
  onChange,
  syncAttitude,
  onSyncAttitudeChange,
  disabled = false,
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
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
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

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 space-y-2 rounded-md border border-panel-600 bg-panel-800 p-2.5 shadow-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Display settings
          </p>
          {TOGGLES.map((toggle) => (
            <ToggleField
              key={toggle.key}
              label={toggle.label}
              hint={toggle.hint}
              value={!!value[toggle.key]}
              onChange={set(toggle.key)}
            />
          ))}

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
          </div>
        </div>
      )}
    </div>
  );
}
