import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { APP_VERSION } from '@pixel-farm/shared';
import { registerAuth, requireUser } from './auth.js';
import type { Config } from './config.js';
import type { DB } from './db.js';
import { registerBoards } from './boards.js';
import { registerPush } from './push.js';
import { registerSaves } from './saves.js';
import { getMe } from './users.js';

/** Files the browser must always revalidate, so a deploy is picked up on next launch. */
const NO_CACHE = new Set(['/', '/index.html', '/sw.js', '/manifest.webmanifest', '/registerSW.js']);

export async function buildApp(cfg: Config, db: DB, clock: () => number = Date.now): Promise<FastifyInstance> {
  const app = Fastify({ logger: process.env.NODE_ENV === 'test' ? false : { level: 'info' }, trustProxy: true });

  await app.register(cookie, { secret: cfg.sessionSecret });
  registerAuth(app, cfg, db);
  registerPush(app, cfg, db);
  registerSaves(app, db, clock);
  registerBoards(app, db, clock);

  app.get('/healthz', async () => ({ ok: true, version: APP_VERSION }));

  app.get('/api/me', { preHandler: requireUser }, async (req, reply) => {
    const me = getMe(db, req.userId!);
    return me ?? reply.code(401).send({ error: 'unauthorized' });
  });

  if (cfg.staticDir) {
    await app.register(fastifyStatic, {
      root: cfg.staticDir,
      wildcard: false,
      setHeaders(reply, path) {
        const rel = '/' + path.slice(cfg.staticDir!.length).replace(/^\/+/, '');
        reply.header(
          'Cache-Control',
          NO_CACHE.has(rel) ? 'no-cache' : rel.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
        );
      },
    });
  }

  app.setNotFoundHandler(async (req, reply) => {
    if (req.method !== 'GET' || !cfg.staticDir || /^\/(api|auth)(\/|$)/.test(req.url)) {
      return reply.code(404).send({ error: 'not_found' });
    }
    reply.header('Cache-Control', 'no-cache');
    return reply.sendFile('index.html');
  });

  return app;
}
