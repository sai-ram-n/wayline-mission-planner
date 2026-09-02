/**
 * Assign one wayline to one or more drones.
 *
 * Our own design (feature-reference §10 — FlightHub's task flow was never
 * explored), following the project brief's fallback spec: pick a wayline, tick
 * the drones, create one assignment row per drone.
 *
 * Mismatches are surfaced rather than blocked. A wayline authored for one
 * aircraft will not fly correctly on another, and an offline aircraft cannot
 * receive it — but this is a mock fleet, so the dialog warns and lets the user
 * decide instead of silently disabling rows.
 */
import { useEffect, useMemo, useState } from 'react';
import { LuTriangleAlert, LuX } from 'react-icons/lu';
import { DRONE_STATUS_STYLES } from '../../lib/constants.js';
import { STATUS_LABELS } from './DroneCard.jsx';

export default function AssignDialog({ open, waylines = [], drones = [], initialWaylineId, onAssign, onClose }) {
  const [waylineId, setWaylineId] = useState('');
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setWaylineId(initialWaylineId ?? waylines[0]?.id ?? '');
    setSelected([]);
    setBusy(false);
  }, [open, initialWaylineId, waylines]);

  const wayline = useMemo(
    () => waylines.find((w) => w.id === waylineId) ?? null,
    [waylines, waylineId]
  );

  const warnings = useMemo(() => {
    if (!wayline) return [];
    const chosen = drones.filter((d) => selected.includes(d.id));
    const list = [];
    const mismatched = chosen.filter((d) => d.model !== wayline.aircraft_model);
    if (mismatched.length) {
      list.push(
        `${mismatched.map((d) => d.name).join(', ')} ` +
          `${mismatched.length === 1 ? 'is' : 'are'} not ${wayline.aircraft_model}. ` +
          'This route was authored for a different aircraft.'
      );
    }
    const offline = chosen.filter((d) => d.status === 'offline');
    if (offline.length) {
      list.push(
        `${offline.map((d) => d.name).join(', ')} ` +
          `${offline.length === 1 ? 'is' : 'are'} offline and will not receive the route until back online.`
      );
    }
    return list;
  }, [wayline, drones, selected]);

  if (!open) return null;

  const toggle = (id) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((v) => v !== id) : [...current, id]
    );

  const submit = async (event) => {
    event.preventDefault();
    if (!waylineId || !selected.length) return;
    setBusy(true);
    try {
      await onAssign(waylineId, selected);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4">
      <form onSubmit={submit} className="panel flex max-h-[85vh] w-full max-w-lg flex-col shadow-2xl">
        <div className="panel-header shrink-0">
          <h2 className="text-sm font-semibold text-slate-100">Assign a route</h2>
          <button type="button" onClick={onClose} className="btn-ghost p-1" aria-label="Close">
            <LuX className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          <div>
            <label className="label" htmlFor="assign-wayline">
              Flight route
            </label>
            {waylines.length === 0 ? (
              <p className="text-xs text-slate-500">
                No saved routes yet. Create one in the library first.
              </p>
            ) : (
              <select
                id="assign-wayline"
                className="input text-xs"
                value={waylineId}
                onChange={(event) => setWaylineId(event.target.value)}
              >
                {waylines.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} — {w.aircraft_model} · {w.waypoint_count} waypoints
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <span className="label">Aircraft ({selected.length} selected)</span>
            {drones.length === 0 ? (
              <p className="text-xs text-slate-500">No aircraft in the fleet.</p>
            ) : (
              <ul className="space-y-1">
                {drones.map((drone) => {
                  const checked = selected.includes(drone.id);
                  const mismatch = wayline && drone.model !== wayline.aircraft_model;
                  return (
                    <li key={drone.id}>
                      <label
                        className={`flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 transition-colors ${
                          checked
                            ? 'border-accent/60 bg-accent/10'
                            : 'border-panel-700 bg-panel-800 hover:border-panel-600'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(drone.id)}
                          className="h-3 w-3 shrink-0 accent-accent"
                        />
                        <span className="min-w-0 flex-1 truncate text-xs text-slate-200">
                          {drone.name}
                          <span className="ml-1.5 text-[10px] text-slate-500">{drone.model}</span>
                        </span>
                        {mismatch && (
                          <span
                            title={`This route was authored for ${wayline.aircraft_model}`}
                            className="shrink-0 rounded border border-amber-500/40 px-1.5 py-0.5 text-[9px] text-amber-300"
                          >
                            Different model
                          </span>
                        )}
                        <span
                          className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] ${
                            DRONE_STATUS_STYLES[drone.status]
                          }`}
                        >
                          {STATUS_LABELS[drone.status] ?? drone.status}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {warnings.map((warning) => (
            <p
              key={warning}
              className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-2 text-[11px] leading-snug text-amber-300"
            >
              <LuTriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {warning}
            </p>
          ))}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-panel-700 px-4 py-3">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={busy || !waylineId || !selected.length}
          >
            {busy
              ? 'Assigning…'
              : `Assign to ${selected.length || 'no'} aircraft`}
          </button>
        </div>
      </form>
    </div>
  );
}
