import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { openDb } from './db.js';
import { runJobs } from './notify.js';
import { awardPrizes } from './prizes.js';
import { nightlyBackup } from './backup.js';
import { sendToUser } from './push.js';

const cfg = loadConfig();
const db = openDb(cfg.dbPath);
const app = await buildApp(cfg, db);

if (!cfg.oidc) app.log.warn('OIDC not configured: /auth/login will return 503');
if (!cfg.vapid) app.log.warn('VAPID keys not configured: push is disabled');
if (cfg.devFakeUser) app.log.warn(`DEV_FAKE_USER active: unauthenticated requests act as "${cfg.devFakeUser}"`);

// Once a minute: hand out prizes for finished days and weeks, then send whatever push is due.
const ticker = setInterval(() => {
  try {
    const given = awardPrizes(db, Date.now());
    if (given.length) app.log.info({ given }, 'prizes awarded');
  } catch (err) {
    app.log.error({ err }, 'awarding prizes failed');
  }
  if (cfg.backup)
    nightlyBackup(db, cfg.backup, Date.now())
      .then((file) => file && app.log.info({ file }, 'nightly backup written'))
      .catch((err: unknown) => app.log.error({ err }, 'nightly backup failed'));
  if (cfg.vapid)
    runJobs(db, Date.now(), (userId, msg) => sendToUser(db, userId, msg)).catch((err: unknown) => app.log.error({ err }, 'push jobs failed'));
}, 60_000);

const shutdown = async () => {
  clearInterval(ticker);
  await app.close();
  db.close();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await app.listen({ port: cfg.port, host: cfg.host });
