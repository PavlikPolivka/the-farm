import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { openDb } from './db.js';
import { runJobs } from './notify.js';
import { sendToUser } from './push.js';

const cfg = loadConfig();
const db = openDb(cfg.dbPath);
const app = await buildApp(cfg, db);

if (!cfg.oidc) app.log.warn('OIDC not configured: /auth/login will return 503');
if (!cfg.vapid) app.log.warn('VAPID keys not configured: push is disabled');
if (cfg.devFakeUser) app.log.warn(`DEV_FAKE_USER active: unauthenticated requests act as "${cfg.devFakeUser}"`);

// The notification queue: send whatever is due, once a minute.
const ticker = cfg.vapid
  ? setInterval(() => {
      runJobs(db, Date.now(), (userId, msg) => sendToUser(db, userId, msg)).catch((err: unknown) => app.log.error({ err }, 'push jobs failed'));
    }, 60_000)
  : null;

const shutdown = async () => {
  if (ticker) clearInterval(ticker);
  await app.close();
  db.close();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await app.listen({ port: cfg.port, host: cfg.host });
