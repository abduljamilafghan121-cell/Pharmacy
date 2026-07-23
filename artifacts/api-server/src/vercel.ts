/**
 * Vercel serverless entry point.
 * Exports the Express app without starting an HTTP server — Vercel wraps it
 * as a serverless function handler automatically.
 */
export { default } from "./app.js";
