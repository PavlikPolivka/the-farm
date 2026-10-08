import type { FastifyInstance } from 'fastify';
import webpush from 'web-push';
import type { PushSubscriptionPayload } from '@pixel-farm/shared';
import { requireUser } from './auth.js';
import type { Config } from './config.js';
import type { DB } from './db.js';

export interface PushMessage {
  title: string;
  body: string;
  url?: string;
}

export function registerPush(app: FastifyInstance, cfg: Config, db: DB): void {
  if (cfg.vapid) webpush.setVapidDetails(cfg.vapid.subject, cfg.vapid.publicKey, cfg.vapid.privateKey);

  app.get('/api/push/key', async (_req, reply) => {
    if (!cfg.vapid) return reply.code(503).send({ error: 'push_not_configured' });
    return { publicKey: cfg.vapid.publicKey };
  });

  app.post<{ Body: PushSubscriptionPayload }>(
    '/api/push/subscribe',
    {
      preHandler: requireUser,
      schema: {
        body: {
          type: 'object',
          required: ['endpoint', 'keys'],
          properties: {
            endpoint: { type: 'string', pattern: '^https://' },
            keys: {
              type: 'object',
              required: ['p256dh', 'auth'],
              properties: { p256dh: { type: 'string' }, auth: { type: 'string' } },
            },
          },
        },
      },
    },
    async (req, reply) => {
      db.prepare(
        `INSERT INTO push_subs (endpoint, user_id, keys_json, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, keys_json = excluded.keys_json`,
      ).run(req.body.endpoint, req.userId, JSON.stringify(req.body.keys), Date.now());
      return reply.code(204).send();
    },
  );

  // M0 spike only: push to all of the caller's own devices.
  app.post('/api/push/test', { preHandler: requireUser }, async (req, reply) => {
    if (!cfg.vapid) return reply.code(503).send({ error: 'push_not_configured' });
    const sent = await sendToUser(db, req.userId!, {
      title: 'Pixel Farm',
      body: 'Hello from the farm 🌾',
      url: '/',
    });
    return { sent };
  });
}

/** Sends to every subscription of a user; drops subscriptions the push service reports as gone. */
export async function sendToUser(db: DB, userId: number, msg: PushMessage): Promise<number> {
  const subs = db.prepare('SELECT endpoint, keys_json FROM push_subs WHERE user_id = ?').all(userId) as {
    endpoint: string;
    keys_json: string;
  }[];
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: JSON.parse(s.keys_json) }, JSON.stringify(msg), {
          TTL: 60 * 60,
        });
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) db.prepare('DELETE FROM push_subs WHERE endpoint = ?').run(s.endpoint);
      }
    }),
  );
  return sent;
}
