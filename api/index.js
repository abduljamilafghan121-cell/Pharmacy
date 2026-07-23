/**
 * Vercel serverless function entry point.
 *
 * This file re-exports the pre-built Express app bundle produced by
 * `pnpm --filter @workspace/api-server run build`.
 * Vercel includes the pre-built file via `includeFiles` in vercel.json
 * and wraps this export as a serverless handler.
 */
export { default } from "../artifacts/api-server/dist/vercel.mjs";
