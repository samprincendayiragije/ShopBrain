import app from "./app";
import { logger } from "./lib/logger";

// Read PORT from environment. In some deployment environments PORT may not be set —
// fall back to a safe default (3000) instead of crashing the process.
const rawPort = process.env["PORT"];

let port = 3000;

if (rawPort) {
  const parsed = Number(rawPort);
  if (Number.isNaN(parsed) || parsed <= 0) {
    logger.error({ rawPort }, `Invalid PORT value: "${rawPort}"; falling back to ${port}`);
  } else {
    port = parsed;
  }
} else {
  logger.warn({ defaultPort: port }, "PORT environment variable not provided; using default port");
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
