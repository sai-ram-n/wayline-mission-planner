/**
 * One aircraft in the fleet.
 *
 * The fleet is our own design (feature-reference §10 records that FlightHub's
 * own fleet module was never explored), so this follows the project brief's
 * fallback spec: id, name, model, series and a status of idle | flying | offline.
 */
import { useState } from 'react';
import { LuCheck, LuPencil, LuPlane, LuX } from 'react-icons/lu';
import { DRONE_STATUS_STYLES } from '../../lib/constants.js';

const STATUS_LABELS = {
  idle: 'Idle',
  flying: 'Flying',
  offline: 'Offline',
};

export default function DroneCard({ drone, statuses = [], seriesLabel, onRename, onSetStatus, assignmentCount = 0 }) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(drone.name);

  const commit = () => {
    const name = draft.trim();
    setRenaming(false);
    if (name && name !== drone.name) onRename(name);
  };

  return (
    <li className="rounded-md border border-panel-700 bg-panel-900 p-3">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 shrink-0 rounded-md bg-panel-800 p-1.5 text-slate-400">
          <LuPlane className="h-4 w-4" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            {renaming ? (
              <input
                className="input min-w-0 flex-1 py-0.5 text-xs"
                value={draft}
                autoFocus
                maxLength={120}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={commit}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') commit();
                  if (event.key === 'Escape') setRenaming(false);
                }}
              />
            ) : (
              <>
                <h3 className="min-w-0 flex-1 truncate text-sm font-medium text-slate-100">
                  {drone.name}
                </h3>
                <button
                  type="button"
                  aria-label={`Rename ${drone.name}`}
                  onClick={() => {
                    setDraft(drone.name);
                    setRenaming(true);
                  }}
                  className="btn-ghost shrink-0 p-1"
                >
                  <LuPencil className="h-3 w-3" />
                </button>
              </>
            )}
          </div>

          <p className="truncate text-[11px] text-slate-500">
            {seriesLabel ? `${seriesLabel} · ` : ''}
            {drone.model}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-1">
            {statuses.map((status) => {
              const active = drone.status === status;
              return (
                <button
                  key={status}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onSetStatus(status)}
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors ${
                    active
                      ? DRONE_STATUS_STYLES[status]
                      : 'border-panel-600 bg-panel-800 text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {STATUS_LABELS[status] ?? status}
                </button>
              );
            })}
            {assignmentCount > 0 && (
              <span className="ml-auto shrink-0 text-[10px] text-slate-500">
                {assignmentCount} assignment{assignmentCount === 1 ? '' : 's'}
              </span>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

export { STATUS_LABELS };
