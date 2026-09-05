import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { getDbErrorMessage } from "./lib/api-errors";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
// CORS is locked to an explicit allow-list instead of echoing back whatever
// Origin a request sends. Requests without an Origin header (same-origin
// browsers, native/CLI clients) are always allowed — browsers only send
// Origin on genuinely cross-origin requests, which is exactly what we gate.
// The desktop app renders from file://, which sends "Origin: null"; that is
// allowed by default (CORS_ALLOW_NULL_ORIGIN=false to disable). The web SPA
// is same-origin through the root /api rewrites, so its session rides on the
// httpOnly pharma_token cookie — browsers send same-origin cookies regardless
// of CORS. Desktop/mobile call cross-origin with an explicit Authorization
// header — not cookies — so credentials stays false.
const allowedOrigins = (process.env["CORS_ORIGINS"] ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const allowNullOrigin = process.env["CORS_ALLOW_NULL_ORIGIN"] !== "false";

const isLocalhost = (origin: string): boolean => {
  try {
    const host = new URL(origin).hostname;
    return host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost");
  } catch {
    return false;
  }
};

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowNullOrigin && origin === "null") return cb(null, true);
      // http://localhost:* / http://127.0.0.1:* are dev renderers running on
      // the user's own machine (electron-vite dev server, vite dev server).
      // A browser can only send this Origin from a page actually served from
      // localhost, so it is not an open proxy risk.
      if (isLocalhost(origin)) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      const error = new Error(`Origin not allowed by CORS policy: ${origin}`);
      (error as { status?: number }).status = 403;
      return cb(error, false);
    },
    allowedHeaders: ["Authorization", "Content-Type", "Accept"],
    credentials: false,
  }),
);
// Raise the JSON body limit to 4 MB so that base64-encoded logo images
// and prescription attachments (stored as data URIs, ~33% larger than
// the original binary) don't hit the default 100 KB Express limit.
app.use(express.json({ limit: "4mb" }));
app.use(express.urlencoded({ extended: true, limit: "4mb" }));

app.use("/api", router);

// Global error handler — catches any unhandled error from routes/middleware
// and returns a friendly JSON message instead of crashing.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, "Unhandled error");

  // JWT errors
  if (err && typeof err === "object" && "name" in err) {
    const name = (err as { name: string }).name;
    if (name === "JsonWebTokenError") {
      res.status(401).json({ error: "Invalid or expired session. Please log in again." });
      return;
    }
    if (name === "TokenExpiredError") {
      res.status(401).json({ error: "Your session has expired. Please log in again." });
      return;
    }
  }

  // SyntaxError from malformed JSON body
  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({ error: "Invalid JSON in request body." });
    return;
  }

  // CORS policy rejections are client-configuration errors, not server faults
  if (
    err &&
    typeof err === "object" &&
    "status" in err &&
    (err as { status: number }).status === 403
  ) {
    res.status(403).json({ error: "Origin not allowed by CORS policy." });
    return;
  }

  const message = getDbErrorMessage(err);
  res.status(500).json({ error: message });
});

export default app;
