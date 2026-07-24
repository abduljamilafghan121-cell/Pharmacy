/**
 * Vercel serverless function entry point.
 *
 * This file re-exports the pre-built Express app bundle produced by
 * `pnpm --filter @workspace/api-server run build`.
 * Vercel includes the pre-built file via `includeFiles` in vercel.json
 * and wraps this export as a serverless handler.
 */
const server = require("../artifacts/api-server/dist/vercel.cjs");

// esbuild exposes the TypeScript default export under `.default` in the
// CommonJS bundle. Export the Express function itself for Vercel.
module.exports = server.default ?? server;
