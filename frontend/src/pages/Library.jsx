/**
 * Flight Route Library — docs/feature-reference.md §2.
 *
 * Folder tree and route list on the left, map preview of the selected route on
 * the right, with the same four metrics the reference shows beneath it.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LuArrowDownWideNarrow,
  LuArrowUpWideNarrow,
  LuMapPin,
  LuPlus,
  LuSearch,
  LuSpline,
  LuSquareDashed,
  LuX,
} from 'react-icons/lu';

import api from '../api.js';
import useMissionStore from '../store.js';
import MapCanvas from '../components/editor/MapCanvas.jsx';
import StatsBar from '../components/editor/StatsBar.jsx';
import RouteCard from '../components/library/RouteCard.jsx';
import CreateRouteDialog from '../components/library/CreateRouteDialog.jsx';
import FolderTree from '../components/library/FolderTree.jsx';
import ErrorBanner from '../components/ui/ErrorBanner.jsx';
import Spinner from '../components/ui/Spinner.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { computeStats } from '../lib/geo.js';
import { polygonArea } from '../lib/routegen.js';

/** The route-type filter strip. Only the types we build are offered. */
const ROUTE_TYPE_FILTERS = [
  { value: 'waypoint', label: 'Waypoint Route', icon: LuMapPin },
  { value: 'area', label: 'Area Route', icon: LuSquareDashed },
  { value: 'linear', label: 'Linear Route', icon: LuSpline },
];

export default function Library() {
  const navigate = useNavigate();
  const meta = useMissionStore((s) => s.meta);

  const [waylines, setWaylines] = useState([]);
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState('');
  const [seriesFilter, setSeriesFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [sort, setSort] = useState('newest');
  const [folderId, setFolderId] = useState(null);

  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState(null);

  /* --------------------------------------------------------------- loading */

  const refresh = useCallback(async () => {
    try {
      const [list, folderList] = await Promise.all([api.waylines.list(), api.folders.list()]);
      setWaylines(list);
      setFolders(folderList);
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

  // Load the full route only when one is selected — the list carries just a path.
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    api.waylines
      .get(selectedId)
      .then(setDetail)
      .catch((err) => setError(err.message))
      .finally(() => setDetailLoading(false));
  }, [selectedId]);

  /* -------------------------------------------------------------- filtering */

  // Filtering is done here rather than server-side so typing stays instant; the
  // list is small and already in memory.
  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const matchingFolderIds = new Set(
      folders.filter((f) => f.name.toLowerCase().includes(needle)).map((f) => f.id)
    );

    let items = waylines.filter((w) => {
      if (folderId !== null && w.folder_id !== folderId) return false;
      if (seriesFilter && w.aircraft_series !== seriesFilter) return false;
      if (typeFilter && w.route_type !== typeFilter) return false;
      if (!needle) return true;
      // The reference searches folder names as well as route names.
      return (
        w.name.toLowerCase().includes(needle) ||
        (w.description ?? '').toLowerCase().includes(needle) ||
        (w.folder_id && matchingFolderIds.has(w.folder_id))
      );
    });

    items = [...items].sort((a, b) => {
      const diff = new Date(b.updated_at) - new Date(a.updated_at);
      return sort === 'newest' ? diff : -diff;
    });
    return items;
  }, [waylines, folders, search, seriesFilter, typeFilter, sort, folderId]);

  const folderCounts = useMemo(() => {
    const counts = {};
    for (const w of waylines) {
      if (w.folder_id) counts[w.folder_id] = (counts[w.folder_id] ?? 0) + 1;
    }
    return counts;
  }, [waylines]);

  const modelLabel = useCallback(
    (wayline) =>
      meta?.aircraft?.[wayline.aircraft_series]?.models?.[wayline.aircraft_model]?.label ??
      wayline.aircraft_model,
    [meta]
  );

  /* ---------------------------------------------------------- card actions */

  /** Every mutation refreshes the list, so the UI can never drift from the server. */
  const run = async (work) => {
    try {
      await work();
      await refresh();
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRename = (wayline, name) => run(() => api.waylines.patch(wayline.id, { name }));

  const handleToggleLock = (wayline) =>
    run(() => api.waylines.patch(wayline.id, { locked: !wayline.locked }));

  const handleDuplicate = (wayline) => run(() => api.waylines.duplicate(wayline.id));

  const handleDelete = (wayline) =>
    run(async () => {
      // eslint-disable-next-line no-alert
      if (!window.confirm(`Delete "${wayline.name}"? This cannot be undone.`)) return;
      await api.waylines.remove(wayline.id);
      if (selectedId === wayline.id) setSelectedId(null);
    });

  const handleMove = (wayline, targetFolderId) =>
    run(async () => {
      await api.waylines.patch(wayline.id, { folder_id: targetFolderId });
      setMoveTarget(null);
    });

  const handleCreateFolder = (sibling) =>
    run(async () => {
      // eslint-disable-next-line no-alert
      const name = window.prompt(sibling ? 'New sibling folder name' : 'New subfolder name');
      if (!name?.trim()) return;
      const selected = folders.find((f) => f.id === folderId);
      const parent_id = sibling ? (selected?.parent_id ?? null) : (folderId ?? null);
      await api.folders.create({ name: name.trim(), parent_id });
    });

  const handleDeleteFolder = (folder) =>
    run(async () => {
      // The exact warning the reference shows, because the backend cascades too.
      // eslint-disable-next-line no-alert
      const ok = window.confirm(
        'All flight routes within this folder and related subfolders will be deleted. ' +
          'Confirm deletion?'
      );
      if (!ok) return;
      await api.folders.remove(folder.id);
      if (folderId === folder.id) setFolderId(null);
    });

  const handleCreateRoute = ({ route_type, aircraft_series, aircraft_model, payload_model, name }) => {
    setCreateOpen(false);
    const params = new URLSearchParams({
      type: route_type,
      series: aircraft_series,
      model: aircraft_model,
      name,
    });
    if (payload_model) params.set('payload', payload_model);
    if (folderId) params.set('folder', folderId);
    navigate(`/editor?${params.toString()}`);
  };

  /* ------------------------------------------------------------- preview */

  const previewStats = useMemo(
    () => (detail ? computeStats(detail.waypoints, detail.settings) : null),
    [detail]
  );
  const previewArea = useMemo(() => {
    if (!detail?.geometry?.vertices?.length) return null;
    return detail.geometry.kind === 'area' ? polygonArea(detail.geometry.vertices) : null;
  }, [detail]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner label="Loading library…" />
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* ------------------------------------------------------- folder column */}
      <aside className="flex w-52 shrink-0 flex-col border-r border-panel-700 bg-panel-900">
        <FolderTree
          folders={folders}
          counts={folderCounts}
          totalCount={waylines.length}
          selectedId={folderId}
          onSelect={setFolderId}
          onCreate={handleCreateFolder}
          onDelete={handleDeleteFolder}
        />
      </aside>

      {/* --------------------------------------------------------- route list */}
      <section className="flex w-96 shrink-0 flex-col border-r border-panel-700 bg-panel-950">
        <div className="shrink-0 space-y-2 border-b border-panel-700 p-2">
          <div className="flex items-center gap-2">
            <h1 className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-100">
              Route ({visible.length})
            </h1>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="btn-primary px-2 py-1 text-xs"
            >
              <LuPlus className="h-3.5 w-3.5" />
              Create Route
            </button>
          </div>

          <div className="relative">
            <LuSearch className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              className="input py-1 pl-7 pr-7 text-xs"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search folder names or flight route names"
              aria-label="Search routes"
            />
            {search && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setSearch('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-500 hover:text-slate-300"
              >
                <LuX className="h-3 w-3" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1">
            <select
              className="input min-w-0 flex-1 py-1 text-[11px]"
              value={seriesFilter}
              onChange={(event) => setSeriesFilter(event.target.value)}
              aria-label="Filter by aircraft"
            >
              <option value="">All Models</option>
              {Object.entries(meta?.aircraft ?? {}).map(([key, entry]) => (
                <option key={key} value={key}>
                  {entry.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setSort((s) => (s === 'newest' ? 'oldest' : 'newest'))}
              title={sort === 'newest' ? 'Sorted New-Old' : 'Sorted Old-New'}
              className="btn-secondary shrink-0 px-2 py-1 text-[11px]"
            >
              {sort === 'newest' ? (
                <LuArrowDownWideNarrow className="h-3.5 w-3.5" />
              ) : (
                <LuArrowUpWideNarrow className="h-3.5 w-3.5" />
              )}
              {sort === 'newest' ? 'New-Old' : 'Old-New'}
            </button>
          </div>

          <div className="flex gap-1">
            {ROUTE_TYPE_FILTERS.map((filter) => {
              const active = typeFilter === filter.value;
              return (
                <button
                  key={filter.value}
                  type="button"
                  title={filter.label}
                  aria-pressed={active}
                  onClick={() => setTypeFilter(active ? '' : filter.value)}
                  className={`flex min-w-0 flex-1 items-center justify-center gap-1 rounded border px-1.5 py-1 text-[10px] transition-colors ${
                    active
                      ? 'border-accent bg-accent/15 text-accent'
                      : 'border-panel-700 bg-panel-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <filter.icon className="h-3 w-3 shrink-0" />
                  <span className="truncate">{filter.label.replace(' Route', '')}</span>
                </button>
              );
            })}
          </div>
        </div>

        {error && (
          <div className="shrink-0 p-2">
            <ErrorBanner message={error} onDismiss={() => setError(null)} />
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {visible.length === 0 ? (
            <p className="px-2 py-8 text-center text-xs text-slate-500">
              {waylines.length === 0
                ? 'No saved routes yet. Create one to get started.'
                : 'No routes match these filters.'}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {visible.map((wayline) => (
                <RouteCard
                  key={wayline.id}
                  wayline={wayline}
                  modelLabel={modelLabel(wayline)}
                  selected={wayline.id === selectedId}
                  onSelect={setSelectedId}
                  onOpen={(id) => navigate(`/editor/${id}`)}
                  onRename={(name) => handleRename(wayline, name)}
                  onMove={() => setMoveTarget(wayline)}
                  onDuplicate={() => handleDuplicate(wayline)}
                  onToggleLock={() => handleToggleLock(wayline)}
                  onDelete={() => handleDelete(wayline)}
                />
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ------------------------------------------------------- map preview */}
      <div className="relative flex min-w-0 flex-1 flex-col">
        {detail ? (
          <>
            <div className="flex shrink-0 items-center gap-2 border-b border-panel-700 bg-panel-900 px-3 py-2">
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-sm font-semibold text-slate-100">{detail.name}</h2>
                {detail.description && (
                  <p className="truncate text-[11px] text-slate-500">{detail.description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => navigate(`/editor/${detail.id}`)}
                className="btn-primary shrink-0 px-2 py-1 text-xs"
              >
                Open in editor
              </button>
            </div>

            <div className="shrink-0 border-b border-panel-700 bg-panel-900">
              <StatsBar stats={previewStats} area={previewArea} />
            </div>

            <div className="min-h-0 flex-1">
              <MapCanvas
                key={detail.id}
                waypoints={detail.waypoints}
                takeoffPoint={detail.settings?.takeOffRefPoint ?? null}
                geometry={detail.geometry}
                fitTrigger={detail.id}
                readOnly
              />
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center">
            {detailLoading ? (
              <Spinner label="Loading route…" />
            ) : (
              <EmptyState
                icon={LuMapPin}
                title="No route selected"
                message="Select a route to preview it here. Double-click a card to open it in the editor."
              />
            )}
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------ dialogs */}
      <CreateRouteDialog
        open={createOpen}
        meta={meta}
        existingNames={waylines.map((w) => w.name)}
        onCreate={handleCreateRoute}
        onClose={() => setCreateOpen(false)}
      />

      {moveTarget && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4">
          <div className="panel w-full max-w-sm shadow-2xl">
            <div className="panel-header">
              <h2 className="min-w-0 truncate text-sm font-semibold text-slate-100">
                Move “{moveTarget.name}”
              </h2>
              <button
                type="button"
                onClick={() => setMoveTarget(null)}
                className="btn-ghost p-1"
                aria-label="Close"
              >
                <LuX className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-72 space-y-1 overflow-y-auto p-3">
              <button
                type="button"
                onClick={() => handleMove(moveTarget, null)}
                className="w-full truncate rounded-md border border-panel-700 bg-panel-800 px-2 py-1.5 text-left text-xs text-slate-300 hover:border-panel-600"
              >
                No folder
              </button>
              {folders.map((folder) => (
                <button
                  key={folder.id}
                  type="button"
                  onClick={() => handleMove(moveTarget, folder.id)}
                  className="w-full truncate rounded-md border border-panel-700 bg-panel-800 px-2 py-1.5 text-left text-xs text-slate-300 hover:border-panel-600"
                >
                  {folder.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
