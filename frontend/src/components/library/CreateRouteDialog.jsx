/**
 * Create Route dialog — docs/feature-reference.md §1.
 *
 * Lists all seven route types in their three groups, with the four we do not
 * build visibly marked unsupported, and enforces the aircraft compatibility
 * matrix: choosing a route type disables the aircraft that cannot fly it.
 */
import { useEffect, useMemo, useState } from 'react';
import { LuX, LuTriangleAlert } from 'react-icons/lu';
import { ROUTE_TYPE_LABELS } from '../../lib/constants.js';

/** The three groups, in the order the reference dialog shows them. */
const ROUTE_GROUPS = [
  { title: 'Patrol and Inspection Routes', types: ['waypoint', 'patrol'] },
  { title: 'Mapping Routes', types: ['area', 'linear'] },
  { title: 'Detailed Mapping Routes', types: ['slope', 'geometric', 'smart3d'] },
];

export default function CreateRouteDialog({ open, meta, existingNames = [], onCreate, onClose }) {
  const [routeType, setRouteType] = useState('waypoint');
  const [series, setSeries] = useState('M30');
  const [model, setModel] = useState('M30T');
  const [payload, setPayload] = useState(null);
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);

  const unsupported = meta?.unsupportedRouteTypes ?? [];
  const allowedSeries = meta?.routeTypeAircraft?.[routeType] ?? [];

  /** `New <Type> Route(n)`, auto-incrementing past any name already in use. */
  const suggestedName = useMemo(() => {
    const label = ROUTE_TYPE_LABELS[routeType] ?? routeType;
    const base = `New ${label}`;
    let n = 1;
    // eslint-disable-next-line no-loop-func
    while (existingNames.includes(`${base}(${n})`)) n += 1;
    return `${base}(${n})`;
  }, [routeType, existingNames]);

  useEffect(() => {
    if (!open) return;
    setRouteType('waypoint');
    setSeries('M30');
    setModel('M30T');
    setPayload(null);
    setNameTouched(false);
  }, [open]);

  // Keep the name in step with the route type until the user edits it.
  useEffect(() => {
    if (!nameTouched) setName(suggestedName);
  }, [suggestedName, nameTouched]);

  // Selecting an incompatible route type moves the aircraft to the first that fits.
  useEffect(() => {
    if (!allowedSeries.length || allowedSeries.includes(series)) return;
    const next = allowedSeries[0];
    setSeries(next);
    setModel(Object.keys(meta?.aircraft?.[next]?.models ?? {})[0] ?? '');
  }, [allowedSeries, series, meta]);

  if (!open || !meta) return null;

  const seriesEntries = Object.entries(meta.aircraft ?? {});
  const models = Object.entries(meta.aircraft?.[series]?.models ?? {});
  const seriesEntry = meta.aircraft?.[series];
  const isUnsupported = unsupported.includes(routeType);
  const canSubmit = !isUnsupported && !!name.trim() && !!model;

  const submit = (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    onCreate({
      route_type: routeType,
      aircraft_series: series,
      aircraft_model: model,
      payload_model: payload,
      name: name.trim(),
    });
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4">
      <form onSubmit={submit} className="panel flex max-h-[90vh] w-full max-w-2xl flex-col shadow-2xl">
        <div className="panel-header shrink-0">
          <h2 className="text-sm font-semibold text-slate-100">Create Route</h2>
          <button type="button" onClick={onClose} className="btn-ghost p-1" aria-label="Close">
            <LuX className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {/* ------------------------------------------------------ route type */}
          {ROUTE_GROUPS.map((group) => (
            <fieldset key={group.title}>
              <legend className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {group.title}
              </legend>
              <div className="grid grid-cols-3 gap-2">
                {group.types.map((type) => {
                  const blocked = unsupported.includes(type);
                  const active = routeType === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setRouteType(type)}
                      title={blocked ? 'Documented but not supported in this build' : undefined}
                      className={`rounded-md border px-2 py-2 text-left text-[11px] transition-colors ${
                        active
                          ? 'border-accent bg-accent/15 text-slate-100'
                          : 'border-panel-700 bg-panel-800 text-slate-300 hover:border-panel-600'
                      } ${blocked ? 'opacity-50' : ''}`}
                    >
                      <span className="block truncate font-medium">
                        {ROUTE_TYPE_LABELS[type] ?? type}
                      </span>
                      {blocked && (
                        <span className="mt-0.5 block text-[10px] text-amber-400/80">
                          Not supported
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ))}

          {isUnsupported && (
            <p className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-2 text-[11px] leading-snug text-amber-300">
              <LuTriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              This route type is documented in the feature reference but is out of scope for this
              build. Choose Waypoint, Area or Linear to continue.
            </p>
          )}

          {/* -------------------------------------------------------- aircraft */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="label">Aircraft</span>
              <div className="space-y-1">
                {seriesEntries.map(([key, entry]) => {
                  const compatible = allowedSeries.includes(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={!compatible}
                      title={
                        compatible
                          ? undefined
                          : `${entry.label} cannot fly a ${ROUTE_TYPE_LABELS[routeType] ?? routeType}`
                      }
                      onClick={() => {
                        setSeries(key);
                        setModel(Object.keys(entry.models ?? {})[0] ?? '');
                        setPayload(null);
                      }}
                      className={`w-full truncate rounded-md border px-2 py-1.5 text-left text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
                        series === key
                          ? 'border-accent bg-accent/15 text-slate-100'
                          : 'border-panel-700 bg-panel-800 text-slate-300 enabled:hover:border-panel-600'
                      }`}
                    >
                      {entry.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <span className="label">Model</span>
              <div className="space-y-1">
                {models.length === 0 && (
                  <p className="text-[11px] text-slate-500">No models for this series.</p>
                )}
                {models.map(([key, entry]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setModel(key)}
                    className={`w-full truncate rounded-md border px-2 py-1.5 text-left text-[11px] transition-colors ${
                      model === key
                        ? 'border-accent bg-accent/15 text-slate-100'
                        : 'border-panel-700 bg-panel-800 text-slate-300 hover:border-panel-600'
                    }`}
                  >
                    {entry.label}
                  </button>
                ))}
              </div>

              {/* The M400 carries a payload picker rather than fixed lenses (§1). */}
              {seriesEntry?.payloads && (
                <div className="mt-2">
                  <span className="label">Payload</span>
                  <select
                    className="input py-1 text-xs"
                    value={payload ?? ''}
                    onChange={(event) => setPayload(event.target.value || null)}
                  >
                    <option value="">Select a payload</option>
                    {Object.entries(seriesEntry.payloads).map(([group, options]) => (
                      <optgroup key={group} label={group}>
                        {options.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* ------------------------------------------------------------ name */}
          <div>
            <label className="label" htmlFor="new-route-name">
              Route Name
            </label>
            <input
              id="new-route-name"
              className="input"
              value={name}
              maxLength={120}
              onChange={(event) => {
                setName(event.target.value);
                setNameTouched(true);
              }}
            />
          </div>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-panel-700 px-4 py-3">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={!canSubmit}>
            OK
          </button>
        </div>
      </form>
    </div>
  );
}
