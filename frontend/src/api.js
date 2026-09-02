/**
 * Axios client and typed-ish wrappers for the backend API.
 *
 * Requests go to /api and Vite proxies them to the backend in development, so
 * no base URL or CORS configuration is needed in the browser.
 */
import axios from 'axios';

export const client = axios.create({
  baseURL: '/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * Turn an axios failure into an Error carrying a message worth showing a user.
 * Zod validation failures come back with a `details` array; surface the first
 * few field messages rather than a bare "Request failed with status code 400".
 */
function toFriendlyError(error) {
  if (error.response) {
    const { status, data } = error.response;
    if (Array.isArray(data?.details) && data.details.length) {
      const fields = data.details
        .slice(0, 3)
        .map((d) => (d.path ? `${d.path}: ${d.message}` : d.message))
        .join('; ');
      const more = data.details.length > 3 ? ` (+${data.details.length - 3} more)` : '';
      return Object.assign(new Error(`${data.error || 'Validation failed'} — ${fields}${more}`), {
        status,
        details: data.details,
      });
    }
    return Object.assign(new Error(data?.error || `Request failed (${status})`), { status });
  }
  if (error.request) {
    return new Error('Cannot reach the server. Is the backend running on port 3001?');
  }
  return error;
}

client.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(toFriendlyError(error))
);

const unwrap = (promise) => promise.then((r) => r.data);

export const api = {
  health: () => unwrap(client.get('/health')),
  meta: () => unwrap(client.get('/meta')),

  waylines: {
    list: (params) => unwrap(client.get('/waylines', { params })),
    get: (id) => unwrap(client.get(`/waylines/${id}`)),
    create: (payload) => unwrap(client.post('/waylines', payload)),
    update: (id, payload) => unwrap(client.put(`/waylines/${id}`, payload)),
    patch: (id, fields) => unwrap(client.patch(`/waylines/${id}`, fields)),
    duplicate: (id, name) => unwrap(client.post(`/waylines/${id}/duplicate`, name ? { name } : {})),
    remove: (id) => unwrap(client.delete(`/waylines/${id}`)),

    /** Direct download URL — the browser fetches it so the file never passes through JS. */
    kmzUrl: (id) => `/api/waylines/${id}/kmz`,

    /** Upload a .kmz as a raw binary body; no multipart parsing needed server-side. */
    importKmz: (file, name) =>
      unwrap(
        client.post('/waylines/import', file, {
          params: name ? { name } : undefined,
          headers: { 'Content-Type': 'application/vnd.google-earth.kmz' },
          timeout: 30000,
        })
      ),
  },

  folders: {
    list: () => unwrap(client.get('/folders')),
    create: (payload) => unwrap(client.post('/folders', payload)),
    remove: (id) => unwrap(client.delete(`/folders/${id}`)),
  },

  drones: {
    list: () => unwrap(client.get('/drones')),
    create: (payload) => unwrap(client.post('/drones', payload)),
    patch: (id, fields) => unwrap(client.patch(`/drones/${id}`, fields)),
  },

  assignments: {
    list: () => unwrap(client.get('/assignments')),
    create: (waylineId, droneIds) =>
      unwrap(client.post('/assignments', { wayline_id: waylineId, drone_ids: droneIds })),
    setStatus: (id, status) => unwrap(client.patch(`/assignments/${id}`, { status })),
    remove: (id) => unwrap(client.delete(`/assignments/${id}`)),
  },
};

export default api;
