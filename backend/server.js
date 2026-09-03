import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';

import { errorHandler, notFound } from './middleware.js';
import assignmentsRouter from './routes/assignments.js';
import dronesRouter from './routes/drones.js';
import foldersRouter from './routes/folders.js';
import waylinesRouter from './routes/waylines.js';
import * as constants from './constants.js';
import { VERSION, BUILD_DATE, APP_NAME } from '../version.js';

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || true }));
app.use(express.json({ limit: '5mb' }));
// KMZ uploads arrive as a raw binary body rather than multipart, which keeps the
// import endpoint dependency-free.
app.use(
  express.raw({
    type: ['application/vnd.google-earth.kmz', 'application/octet-stream', 'application/zip'],
    limit: '10mb',
  })
);

app.get('/api/health', (req, res) =>
  res.json({ status: 'ok', app: APP_NAME, version: VERSION, buildDate: BUILD_DATE })
);

/**
 * Enums, labels, defaults and the aircraft catalogue, so the frontend renders
 * dropdowns from one shared source rather than duplicating the domain model.
 */
app.get('/api/meta', (req, res) =>
  res.json({
    version: VERSION,
    buildDate: BUILD_DATE,
    routeTypes: constants.ROUTE_TYPES,
    unsupportedRouteTypes: constants.UNSUPPORTED_ROUTE_TYPES,
    aircraft: constants.AIRCRAFT,
    routeTypeAircraft: constants.ROUTE_TYPE_AIRCRAFT,
    finishActions: constants.FINISH_ACTIONS,
    finishActionLabels: constants.FINISH_ACTION_LABELS,
    flyToWaylineModes: constants.FLY_TO_WAYLINE_MODES,
    flyToWaylineModeLabels: constants.FLY_TO_WAYLINE_MODE_LABELS,
    heightModes: constants.HEIGHT_MODES,
    headingModes: constants.HEADING_MODES,
    headingModeLabels: constants.HEADING_MODE_LABELS,
    gimbalPitchModes: constants.GIMBAL_PITCH_MODES,
    gimbalPitchModeLabels: constants.GIMBAL_PITCH_MODE_LABELS,
    turnModes: constants.TURN_MODES,
    turnModeLabels: constants.TURN_MODE_LABELS,
    photoModes: constants.PHOTO_MODES,
    photoCollections: constants.PHOTO_COLLECTIONS,
    actionTypes: constants.ACTION_TYPES,
    actionLabels: constants.ACTION_LABELS,
    actionsWithMediaParams: constants.ACTIONS_WITH_MEDIA_PARAMS,
    actionsWithoutParams: constants.ACTIONS_WITHOUT_PARAMS,
    photoActions: constants.PHOTO_ACTIONS,
    defaultSettings: constants.DEFAULT_SETTINGS,
    defaultMappingSettings: constants.DEFAULT_MAPPING_SETTINGS,
    mappingSensors: constants.MAPPING_SENSORS,
    defaultMappingSensor: constants.DEFAULT_MAPPING_SENSOR,
    defaultLinearSettings: constants.DEFAULT_LINEAR_SETTINGS,
    assignmentStatuses: constants.ASSIGNMENT_STATUSES,
    assignmentNextStatus: constants.ASSIGNMENT_NEXT_STATUS,
    droneStatuses: constants.DRONE_STATUSES,
  })
);

app.use('/api/waylines', waylinesRouter);
app.use('/api/folders', foldersRouter);
app.use('/api/drones', dronesRouter);
app.use('/api/assignments', assignmentsRouter);

app.use(notFound);
app.use(errorHandler);

if (process.env.NODE_ENV !== 'test') {
  // Express takes (port, host, callback). Defaults to all interfaces so the API
  // is reachable from the LAN; set HOST=127.0.0.1 to keep it loopback-only.
  app.listen(PORT, process.env.HOST || '0.0.0.0', () => {
    console.log(`${APP_NAME} API v${VERSION} listening on http://localhost:${PORT}/api`);
  });
}

export default app;
