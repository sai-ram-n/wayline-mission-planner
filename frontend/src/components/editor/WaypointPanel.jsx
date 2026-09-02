/**
 * Per-waypoint settings — feature-reference §11.2, backed by the WPML waypoint
 * fields in §7.
 *
 * Each of altitude, speed, heading and turn behaviour can either inherit the
 * route-level value or be overridden here; that is exactly what the WPML
 * `useGlobal*` flags encode, so the toggles map one-to-one onto the saved data.
 */
import useMissionStore from '../../store.js';
import {
  NumberStepper,
  SelectField,
  Section,
  SliderField,
  ToggleField,
} from '../ui/Field.jsx';

const HINTS = {
  poi: 'The aircraft keeps its nose pointed at this coordinate as it flies to the waypoint.',
  dampingDist:
    'How far before the waypoint the aircraft starts its turn. Only used by the turn modes that ' +
    'fly through a waypoint rather than stopping at it.',
  straightLine: 'Fly a straight line into this waypoint rather than a curved path.',
};

/** Turn modes that actually use the damping distance (the "pass through" ones). */
const PASS_THROUGH_MODES = ['coordinateTurn', 'toPointAndPassWithContinuityCurvature'];

export default function WaypointPanel({ index, disabled = false }) {
  const mission = useMissionStore((s) => s.mission);
  const meta = useMissionStore((s) => s.meta);
  const updateWaypoint = useMissionStore((s) => s.updateWaypoint);

  const waypoint = mission.waypoints[index];
  if (!waypoint || !meta) return null;

  const settings = mission.settings ?? {};
  const set = (key) => (value) => updateWaypoint(index, { [key]: value });
  const options = (values, labels) =>
    values.map((value) => ({ value, label: labels?.[value] ?? value }));

  const headingMode = waypoint.use_global_heading
    ? settings.headingMode
    : waypoint.heading_mode;
  const turnMode = waypoint.use_global_turn ? settings.turnMode : waypoint.turn_mode;

  return (
    <div className="text-slate-200">
      <Section title={`Waypoint ${index + 1}`}>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="label">Latitude</span>
            <p className="truncate font-mono text-[11px] text-slate-300">
              {waypoint.lat.toFixed(6)}
            </p>
          </div>
          <div>
            <span className="label">Longitude</span>
            <p className="truncate font-mono text-[11px] text-slate-300">
              {waypoint.lng.toFixed(6)}
            </p>
          </div>
        </div>
        <p className="text-[10px] leading-snug text-slate-500">
          Drag the marker on the map to reposition this waypoint.
        </p>
      </Section>

      {/* ------------------------------------------------------------ altitude */}
      <Section title="Altitude and speed">
        <ToggleField
          label="Use route altitude"
          value={!!waypoint.use_global_height}
          onChange={(value) =>
            updateWaypoint(index, {
              use_global_height: value,
              // Adopt the inherited value so the map does not jump on toggle.
              height: value ? (settings.globalHeight ?? waypoint.height) : waypoint.height,
            })
          }
          disabled={disabled}
        />
        <NumberStepper
          label={`Altitude (${settings.heightMode ?? 'ASL'})`}
          value={waypoint.use_global_height ? settings.globalHeight : waypoint.height}
          onChange={set('height')}
          min={-200}
          max={1500}
          steps={[10, 100]}
          unit="m"
          disabled={disabled || !!waypoint.use_global_height}
        />

        <ToggleField
          label="Use route speed"
          value={!!waypoint.use_global_speed}
          onChange={(value) =>
            updateWaypoint(index, {
              use_global_speed: value,
              speed: value ? null : (waypoint.speed ?? settings.autoFlightSpeed ?? 10),
            })
          }
          disabled={disabled}
        />
        <NumberStepper
          label="Flight Speed"
          value={
            waypoint.use_global_speed
              ? (settings.autoFlightSpeed ?? 10)
              : (waypoint.speed ?? settings.autoFlightSpeed ?? 10)
          }
          onChange={set('speed')}
          min={1}
          max={15}
          unit="m/s"
          disabled={disabled || !!waypoint.use_global_speed}
        />
      </Section>

      {/* ------------------------------------------------------------- heading */}
      <Section title="Heading">
        <ToggleField
          label="Use route heading"
          value={!!waypoint.use_global_heading}
          onChange={(value) =>
            updateWaypoint(index, {
              use_global_heading: value,
              heading_mode: value ? waypoint.heading_mode : (headingMode ?? 'followWayline'),
            })
          }
          disabled={disabled}
        />
        <SelectField
          label="Aircraft Yaw"
          value={headingMode}
          options={options(meta.headingModes, meta.headingModeLabels)}
          onChange={set('heading_mode')}
          disabled={disabled || !!waypoint.use_global_heading}
        />

        {headingMode === 'manually' && (
          <SliderField
            label="Heading Angle"
            value={waypoint.heading_angle ?? 0}
            onChange={set('heading_angle')}
            min={-180}
            max={180}
            unit="°"
            disabled={disabled || !!waypoint.use_global_heading}
          />
        )}

        {headingMode === 'towardPOI' && (
          <div className="space-y-2">
            <p className="text-[10px] leading-snug text-slate-500">{HINTS.poi}</p>
            <NumberStepper
              label="POI latitude"
              value={waypoint.poi_lat ?? 0}
              onChange={set('poi_lat')}
              min={-90}
              max={90}
              disabled={disabled}
            />
            <NumberStepper
              label="POI longitude"
              value={waypoint.poi_lng ?? 0}
              onChange={set('poi_lng')}
              min={-180}
              max={180}
              disabled={disabled}
            />
            <NumberStepper
              label="POI altitude"
              value={waypoint.poi_alt ?? 0}
              onChange={set('poi_alt')}
              min={-200}
              max={1500}
              steps={[10]}
              unit="m"
              disabled={disabled}
            />
          </div>
        )}
      </Section>

      {/* ---------------------------------------------------------------- turn */}
      <Section title="Turn behaviour" defaultOpen={false}>
        <ToggleField
          label="Use route waypoint type"
          value={!!waypoint.use_global_turn}
          onChange={(value) =>
            updateWaypoint(index, {
              use_global_turn: value,
              turn_mode: value ? waypoint.turn_mode : (turnMode ?? settings.turnMode),
            })
          }
          disabled={disabled}
        />
        <SelectField
          label="Waypoint Type"
          value={turnMode}
          options={options(meta.turnModes, meta.turnModeLabels)}
          onChange={set('turn_mode')}
          disabled={disabled || !!waypoint.use_global_turn}
        />
        <NumberStepper
          label="Turn Damping Distance"
          hint={HINTS.dampingDist}
          value={waypoint.turn_damping_dist ?? 0.2}
          onChange={set('turn_damping_dist')}
          min={0}
          max={1000}
          disabled={disabled || !PASS_THROUGH_MODES.includes(turnMode)}
        />
        <ToggleField
          label="Straight line into waypoint"
          hint={HINTS.straightLine}
          value={!!waypoint.use_straight_line}
          onChange={set('use_straight_line')}
          disabled={disabled}
        />
      </Section>
    </div>
  );
}
