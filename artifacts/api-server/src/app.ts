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
app.use(
  cors({
    origin: true,          // echo back the request Origin (same-origin passes through too)
    allowedHeaders: ["Authorization", "Content-Type", "Accept"],
    credentials: true,
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

  const message = getDbErrorMessage(err);
  res.status(500).json({ error: message });
});

export default app;
