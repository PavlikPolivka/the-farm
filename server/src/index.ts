import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { openDb } from './db.js';

const cfg = loadConfig();
const db = openDb(cfg.dbPath);
const app = await buildApp(cfg, db);

if (!cfg.oidc) app.log.warn('OIDC not configured: /auth/login will return 503');
if (!cfg.vapid) app.log.warn('VAPID keys not configured: push is disabled');
if (cfg.devFakeUser) app.log.warn(`DEV_FAKE_USER active: unauthenticated requests act as "${cfg.devFakeUser}"`);

const shutdown = async () => {
  await app.close();
  db.close();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await app.listen({ port: cfg.port, host: cfg.host });
