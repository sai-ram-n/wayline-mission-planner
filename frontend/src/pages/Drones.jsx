/**
 * Fleet and assignments.
 *
 * Our own design rather than a reproduction: feature-reference §10 records that
 * FlightHub's fleet and task modules were never explored, so guessing at them
 * would break the project's "don't guess" rule. This follows the brief's
 * fallback spec — a mock fleet, and assignments that advance manually through
 * pending → synced → in_progress → complete.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { LuPlane, LuPlus, LuRefreshCw } from 'react-icons/lu';

import api from '../api.js';
import useMissionStore from '../store.js';
import DroneCard from '../components/fleet/DroneCard.jsx';
import AssignDialog from '../components/fleet/AssignDialog.jsx';
import AssignmentTable from '../components/fleet/AssignmentTable.jsx';
import ErrorBanner from '../components/ui/ErrorBanner.jsx';
import Spinner from '../components/ui/Spinner.jsx';
import { ASSIGNMENT_STATUS_LABELS } from '../lib/constants.js';

export default function Drones() {
  const meta = useMissionStore((s) => s.meta);

  const [drones, setDrones] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [waylines, setWaylines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');

  const refresh = useCallback(async () => {
    try {
      const [droneList, assignmentList, waylineList] = await Promise.all([
        api.drones.list(),
        api.assignments.list(),
        api.waylines.list(),
      ]);
      setDrones(droneList);
      setAssignments(assignmentList);
      setWaylines(waylineList);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /** Mutations always refetch, so the table cannot drift from the server. */
  const run = async (work) => {
    try {
      await work();
      await refresh();
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  };

  const assignmentCounts = useMemo(() => {
    const counts = {};
    for (const a of assignments) counts[a.drone_id] = (counts[a.drone_id] ?? 0) + 1;
    return counts;
  }, [assignments]);

  const visibleAssignments = useMemo(
    () => (statusFilter ? assignments.filter((a) => a.status === statusFilter) : assignments),
    [assignments, statusFilter]
  );

  const seriesLabel = useCallback(
    (drone) => meta?.aircraft?.[drone.series]?.label ?? drone.series,
    [meta]
  );

  const handleAddDrone = () =>
    run(async () => {
      // eslint-disable-next-line no-alert
      const name = window.prompt('Aircraft name', `Falcon ${drones.length + 1}`);
      if (!name?.trim()) return;
      // Model and series come from the catalogue so the fleet stays consistent
      // with the aircraft the editor knows about.
      const series = Object.keys(meta?.aircraft ?? {})[0] ?? 'M30';
      const model = Object.keys(meta?.aircraft?.[series]?.models ?? {})[0] ?? 'M30T';
      await api.drones.create({ name: name.trim(), model, series, status: 'idle' });
    });

  const handleAssign = (waylineId, droneIds) =>
    run(async () => {
      await api.assignments.create(waylineId, droneIds);
      setAssignOpen(false);
    });

  const handleRemoveAssignment = (assignment) =>
    run(async () => {
      // eslint-disable-next-line no-alert
      const ok = window.confirm(
        `Remove the assignment of "${assignment.wayline_name}" to ${assignment.drone_name}?`
      );
      if (!ok) return;
      await api.assignments.remove(assignment.id);
    });

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner label="Loading fleet…" />
      </div>
    );
  }

  const statusCounts = (meta?.assignmentStatuses ?? []).map((status) => ({
    status,
    count: assignments.filter((a) => a.status === status).length,
  }));

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {error && (
        <div className="shrink-0 p-3 pb-0">
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
        </div>
      )}

      {/* ------------------------------------------------------------- fleet */}
      <section className="shrink-0 p-3">
        <div className="mb-2 flex items-center gap-2">
          <h1 className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-100">
            Fleet ({drones.length})
          </h1>
          <button type="button" onClick={refresh} title="Refresh" className="btn-ghost p-1.5">
            <LuRefreshCw className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={handleAddDrone} className="btn-secondary px-2 py-1 text-xs">
            <LuPlus className="h-3.5 w-3.5" />
            Add aircraft
          </button>
          <button
            type="button"
            onClick={() => setAssignOpen(true)}
            disabled={!drones.length || !waylines.length}
            title={
              !waylines.length
                ? 'Save a route in the library first'
                : !drones.length
                  ? 'Add an aircraft first'
                  : undefined
            }
            className="btn-primary px-2 py-1 text-xs"
          >
            <LuPlane className="h-3.5 w-3.5" />
            Assign route
          </button>
        </div>

        {drones.length === 0 ? (
          <p className="rounded-md border border-panel-700 bg-panel-900 px-3 py-8 text-center text-xs text-slate-500">
            No aircraft in the fleet yet.
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {drones.map((drone) => (
              <DroneCard
                key={drone.id}
                drone={drone}
                statuses={meta?.droneStatuses ?? []}
                seriesLabel={seriesLabel(drone)}
                assignmentCount={assignmentCounts[drone.id] ?? 0}
                onRename={(name) => run(() => api.drones.patch(drone.id, { name }))}
                onSetStatus={(status) => run(() => api.drones.patch(drone.id, { status }))}
              />
            ))}
          </ul>
        )}
      </section>

      {/* ------------------------------------------------------- assignments */}
      <section className="min-h-0 flex-1 px-3 pb-3">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-100">
            Assignments ({visibleAssignments.length})
          </h2>

          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              aria-pressed={statusFilter === ''}
              onClick={() => setStatusFilter('')}
              className={`rounded-full border px-2 py-0.5 text-[10px] transition-colors ${
                statusFilter === ''
                  ? 'border-accent bg-accent/15 text-accent'
                  : 'border-panel-600 bg-panel-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              All ({assignments.length})
            </button>
            {statusCounts.map(({ status, count }) => (
              <button
                key={status}
                type="button"
                aria-pressed={statusFilter === status}
                onClick={() => setStatusFilter(statusFilter === status ? '' : status)}
                className={`rounded-full border px-2 py-0.5 text-[10px] transition-colors ${
                  statusFilter === status
                    ? 'border-accent bg-accent/15 text-accent'
                    : 'border-panel-600 bg-panel-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {ASSIGNMENT_STATUS_LABELS[status] ?? status} ({count})
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-panel-700 bg-panel-900">
          <AssignmentTable
            assignments={visibleAssignments}
            nextStatus={meta?.assignmentNextStatus ?? {}}
            onAdvance={(assignment, next) =>
              run(() => api.assignments.setStatus(assignment.id, next))
            }
            onSetStatus={(assignment, status) =>
              run(() => api.assignments.setStatus(assignment.id, status))
            }
            onRemove={handleRemoveAssignment}
          />
        </div>
      </section>

      <AssignDialog
        open={assignOpen}
        waylines={waylines}
        drones={drones}
        onAssign={handleAssign}
        onClose={() => setAssignOpen(false)}
      />
    </div>
  );
}
