/**
 * Assignment status table.
 *
 * Status advances manually to simulate progress —
 * pending → synced → in_progress → complete — with `failed` reachable from any
 * state that has not finished. This is the project brief's fallback model
 * (feature-reference §10); it does not mirror FlightHub's real task flow, which
 * was never explored.
 */
import { LuChevronRight, LuRotateCcw, LuTrash2, LuTriangleAlert } from 'react-icons/lu';
import { ASSIGNMENT_STATUS_LABELS, ASSIGNMENT_STATUS_STYLES, ROUTE_TYPE_LABELS } from '../../lib/constants.js';

function formatWhen(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function AssignmentTable({ assignments = [], nextStatus = {}, onAdvance, onSetStatus, onRemove }) {
  if (!assignments.length) {
    return (
      <p className="px-3 py-8 text-center text-xs text-slate-500">
        No assignments yet. Assign a saved route to one or more aircraft.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-xs">
        <thead>
          <tr className="border-b border-panel-700 text-[10px] uppercase tracking-wide text-slate-500">
            <th scope="col" className="px-3 py-2 font-medium">Route</th>
            <th scope="col" className="px-3 py-2 font-medium">Aircraft</th>
            <th scope="col" className="px-3 py-2 font-medium">Status</th>
            <th scope="col" className="px-3 py-2 font-medium">Assigned</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {assignments.map((assignment) => {
            const next = nextStatus[assignment.status];
            const finished = assignment.status === 'complete';
            const failed = assignment.status === 'failed';

            return (
              <tr
                key={assignment.id}
                className="border-b border-panel-800 last:border-0 hover:bg-panel-900/60"
              >
                <td className="max-w-56 px-3 py-2">
                  <p className="truncate text-slate-200">{assignment.wayline_name}</p>
                  <p className="truncate text-[10px] text-slate-500">
                    {ROUTE_TYPE_LABELS[assignment.route_type] ?? assignment.route_type}
                  </p>
                </td>

                <td className="max-w-44 px-3 py-2">
                  <p className="truncate text-slate-200">{assignment.drone_name}</p>
                  <p className="truncate text-[10px] text-slate-500">{assignment.drone_model}</p>
                </td>

                <td className="px-3 py-2">
                  <span
                    className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                      ASSIGNMENT_STATUS_STYLES[assignment.status]
                    }`}
                  >
                    {ASSIGNMENT_STATUS_LABELS[assignment.status] ?? assignment.status}
                  </span>
                </td>

                <td className="whitespace-nowrap px-3 py-2 font-mono text-[10px] text-slate-500">
                  {formatWhen(assignment.assigned_at)}
                </td>

                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-1">
                    {next && (
                      <button
                        type="button"
                        onClick={() => onAdvance(assignment, next)}
                        title={`Advance to ${ASSIGNMENT_STATUS_LABELS[next]}`}
                        className="btn-secondary px-2 py-1 text-[10px]"
                      >
                        {ASSIGNMENT_STATUS_LABELS[next]}
                        <LuChevronRight className="h-3 w-3" />
                      </button>
                    )}

                    {!finished && !failed && (
                      <button
                        type="button"
                        onClick={() => onSetStatus(assignment, 'failed')}
                        title="Mark as failed"
                        className="btn-ghost p-1 text-slate-500 hover:text-amber-400"
                      >
                        <LuTriangleAlert className="h-3 w-3" />
                      </button>
                    )}

                    {(finished || failed) && (
                      <button
                        type="button"
                        onClick={() => onSetStatus(assignment, 'pending')}
                        title="Reset to Pending"
                        className="btn-ghost p-1 text-slate-500 hover:text-slate-200"
                      >
                        <LuRotateCcw className="h-3 w-3" />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => onRemove(assignment)}
                      title="Remove assignment"
                      className="btn-ghost p-1 text-slate-500 hover:text-red-400"
                    >
                      <LuTrash2 className="h-3 w-3" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
