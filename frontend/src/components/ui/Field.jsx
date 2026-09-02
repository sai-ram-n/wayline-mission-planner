/**
 * Small form primitives shared by the settings and action panels.
 *
 * These mirror the control types catalogued in docs/feature-reference.md §5–§6:
 * stepper numbers with coarse/fine buttons, slider + numeric pairs, segmented
 * tabs, toggles and multi-select chips. Every one of them is a controlled input
 * that writes straight through to the mission store, so the map and the stats
 * bar stay in step with the panel.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { LuInfo, LuMinus, LuPlus } from 'react-icons/lu';

const clamp = (value, min, max) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, value));

/**
 * Round away float noise from repeated stepping (0.1 + 0.2 and friends).
 * `decimals` must be raised for values that need real precision — coordinates
 * would be quantised to ~110 m at the default of 3.
 */
const tidy = (value, decimals = 3) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

/* -------------------------------------------------------------------- tooltip */

export function InfoTip({ text }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label="More information"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
        className="text-slate-500 transition-colors hover:text-slate-300"
      >
        <LuInfo className="h-3 w-3" />
      </button>
      {open && (
        <span className="absolute bottom-full left-1/2 z-50 mb-1 w-56 -translate-x-1/2 rounded-md border border-panel-600 bg-panel-800 px-2.5 py-1.5 text-[11px] leading-snug text-slate-300 shadow-xl">
          {text}
        </span>
      )}
    </span>
  );
}

/* ---------------------------------------------------------------------- label */

export function FieldLabel({ children, hint, htmlFor, trailing }) {
  return (
    <div className="mb-1 flex items-center gap-1">
      <label htmlFor={htmlFor} className="text-xs font-medium text-slate-400">
        {children}
      </label>
      <InfoTip text={hint} />
      {trailing && <span className="ml-auto">{trailing}</span>}
    </div>
  );
}

/* -------------------------------------------------------------- number stepper */

/**
 * Numeric input flanked by stepper buttons. `steps` gives the increments offered
 * in each direction — the reference uses a single ±1 for speeds and
 * ±1 / ±10 / ±100 for altitudes and durations.
 */
export function NumberStepper({
  label,
  hint,
  value,
  onChange,
  min,
  max,
  steps = [1],
  unit,
  disabled = false,
  /** Decimal places kept when committing — raise for coordinates. */
  decimals = 3,
}) {
  const id = useId();
  const [draft, setDraft] = useState(String(value ?? ''));
  const focused = useRef(false);

  // Track external changes (undo, loading a mission) unless the user is typing.
  useEffect(() => {
    if (!focused.current) setDraft(String(value ?? ''));
  }, [value]);

  const commit = (raw) => {
    const parsed = Number(raw);
    if (raw === '' || Number.isNaN(parsed)) {
      setDraft(String(value ?? ''));
      return;
    }
    const next = tidy(clamp(parsed, min, max), decimals);
    setDraft(String(next));
    if (next !== value) onChange(next);
  };

  const bump = (delta) => {
    const next = tidy(clamp((Number(value) || 0) + delta, min, max), decimals);
    if (next !== value) onChange(next);
    setDraft(String(next));
  };

  const descending = [...steps].sort((a, b) => b - a);

  return (
    <div>
      {label && <FieldLabel htmlFor={id} hint={hint}>{label}</FieldLabel>}
      <div className="flex items-stretch gap-1">
        {descending.map((step) => (
          <button
            key={`minus-${step}`}
            type="button"
            disabled={disabled || (min != null && value <= min)}
            onClick={() => bump(-step)}
            title={`−${step}`}
            className="btn-secondary shrink-0 px-1.5 py-1 text-[10px] font-mono leading-none"
          >
            {steps.length === 1 ? <LuMinus className="h-3 w-3" /> : `-${step}`}
          </button>
        ))}

        <div className="relative min-w-0 flex-1">
          <input
            id={id}
            type="number"
            inputMode="decimal"
            className="input py-1 text-center font-mono text-xs"
            value={draft}
            disabled={disabled}
            onFocus={() => {
              focused.current = true;
            }}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={(e) => {
              focused.current = false;
              commit(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
          />
          {unit && (
            <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[10px] text-slate-500">
              {unit}
            </span>
          )}
        </div>

        {[...descending].reverse().map((step) => (
          <button
            key={`plus-${step}`}
            type="button"
            disabled={disabled || (max != null && value >= max)}
            onClick={() => bump(step)}
            title={`+${step}`}
            className="btn-secondary shrink-0 px-1.5 py-1 text-[10px] font-mono leading-none"
          >
            {steps.length === 1 ? <LuPlus className="h-3 w-3" /> : `+${step}`}
          </button>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- slider + value */

/** Slider paired with a numeric stepper, as used by every angle and zoom editor. */
export function SliderField({ label, hint, value, onChange, min, max, step = 1, unit, disabled }) {
  return (
    <div>
      {label && <FieldLabel hint={hint}>{label}</FieldLabel>}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value ?? 0}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="mb-1.5 w-full accent-accent"
      />
      <NumberStepper
        value={value}
        onChange={onChange}
        min={min}
        max={max}
        unit={unit}
        disabled={disabled}
      />
    </div>
  );
}

/* ------------------------------------------------------------- segmented tabs */

export function SegmentedTabs({ label, hint, value, options, onChange, disabled }) {
  return (
    <div>
      {label && <FieldLabel hint={hint}>{label}</FieldLabel>}
      <div role="tablist" className="flex rounded-md border border-panel-600 bg-panel-800 p-0.5">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={active}
              title={option.hint}
              disabled={disabled}
              onClick={() => onChange(option.value)}
              className={`min-w-0 flex-1 truncate rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                active ? 'bg-accent text-white' : 'text-slate-400 hover:text-slate-200'
              } disabled:opacity-40`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- select */

export function SelectField({ label, hint, value, options, onChange, disabled }) {
  const id = useId();
  return (
    <div>
      {label && <FieldLabel htmlFor={id} hint={hint}>{label}</FieldLabel>}
      <select
        id={id}
        className="input py-1 text-xs"
        value={value ?? ''}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/* -------------------------------------------------------------------- toggle */

export function ToggleField({ label, hint, value, onChange, disabled }) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={!!value}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!value)}
        className={`relative h-4 w-7 shrink-0 rounded-full transition-colors disabled:opacity-40 ${
          value ? 'bg-accent' : 'bg-panel-600'
        }`}
      >
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${
            value ? 'translate-x-3.5' : 'translate-x-0.5'
          }`}
        />
      </button>
      <span className="min-w-0 flex-1 truncate text-xs text-slate-300">{label}</span>
      <InfoTip text={hint} />
    </div>
  );
}

/* --------------------------------------------------------------------- chips */

/** Multi-select chips — the WIDE / ZOOM / IR camera selector. */
export function ChipGroup({ label, hint, value = [], options, onChange, disabled, note }) {
  const toggle = (chip) => {
    const next = value.includes(chip) ? value.filter((v) => v !== chip) : [...value, chip];
    // At least one sensor must stay selected, as on the reference editor.
    if (next.length) onChange(next);
  };

  return (
    <div>
      {label && <FieldLabel hint={hint}>{label}</FieldLabel>}
      <div className="flex flex-wrap gap-1">
        {options.map((option) => {
          const active = value.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              disabled={disabled}
              onClick={() => toggle(option.value)}
              className={`rounded border px-2 py-0.5 text-[10px] font-medium tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                active
                  ? 'border-accent bg-accent/20 text-accent'
                  : 'border-panel-600 bg-panel-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {note && <p className="mt-1 text-[10px] leading-snug text-slate-500">{note}</p>}
    </div>
  );
}

/* ---------------------------------------------------------------- disclosure */

export function Section({ title, children, defaultOpen = true, right }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-panel-800">
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-1.5 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-200"
        >
          <span
            className={`inline-block text-[8px] transition-transform ${open ? 'rotate-90' : ''}`}
          >
            ▶
          </span>
          <span className="truncate">{title}</span>
        </button>
        {right && <div className="pr-2">{right}</div>}
      </div>
      {open && <div className="space-y-3 px-3 pb-3">{children}</div>}
    </section>
  );
}
