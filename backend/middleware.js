/** Shared route helpers: async wrapping, Zod validation and the error handler. */

/** Wrap an async handler so rejected promises reach the error middleware. */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/** Validate req.body against a Zod schema, replacing it with the parsed value. */
export const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({
      error: 'Validation failed',
      details: result.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      })),
    });
  }
  req.body = result.data;
  next();
};

export function notFound(req, res) {
  res.status(404).json({ error: `No route for ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars -- Express identifies error middleware by arity
export function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({
    error: err.expose || status < 500 ? err.message : 'Internal server error',
    ...(err.details ? { details: err.details } : {}),
  });
}

/** Throw a client error that the handler above will surface verbatim. */
export function httpError(status, message, details) {
  const err = new Error(message);
  err.status = status;
  err.expose = true;
  // Optional field-level detail, surfaced the same way Zod failures are.
  if (details) err.details = details;
  return err;
}
