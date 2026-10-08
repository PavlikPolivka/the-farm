import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { openDb } from './db.js';
import { createSession, touchSession, SESSION_MS } from './sessions.js';
import { upsertUser } from './users.js';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

const setup = async (env: NodeJS.ProcessEnv = {}) => {
  const db = openDb(':memory:');
  app = await buildApp(loadConfig({ NODE_ENV: 'test', ...env }), db);
  return { app, db };
};

describe('auth', () => {
  it('returns 401 without a session', async () => {
    const { app } = await setup();
    const res = await app.inject({ url: '/api/me' });
    expect(res.statusCode).toBe(401);
  });

  it('returns the user for a valid session cookie', async () => {
    const { app, db } = await setup();
    const id = upsertUser(db, { sub: 'abc', displayName: 'Pavel', locale: 'cs', isAdmin: true });
    const token = createSession(db, id);
    const res = await app.inject({ url: '/api/me', cookies: { pf_session: token } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id, displayName: 'Pavel', locale: 'cs', isAdmin: true });
  });

  it('keeps the display name on re-login but updates the admin flag', async () => {
    const { db } = await setup();
    const id = upsertUser(db, { sub: 'abc', displayName: 'Pavel', locale: 'cs', isAdmin: false });
    db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run('Táta', id);
    expect(upsertUser(db, { sub: 'abc', displayName: 'Pavel', locale: 'en', isAdmin: true })).toBe(id);
    expect(db.prepare('SELECT display_name, is_admin FROM users').get()).toEqual({ display_name: 'Táta', is_admin: 1 });
  });

  it('slides the session expiry at most once a day and expires old sessions', async () => {
    const { db } = await setup();
    const id = upsertUser(db, { sub: 'abc', displayName: 'P', locale: 'en', isAdmin: false });
    const t0 = 1_000_000;
    const token = createSession(db, id, t0);
    expect(touchSession(db, token, t0 + 1000)).toEqual({ userId: id, refreshed: false });
    expect(touchSession(db, token, t0 + 2 * 86_400_000)).toEqual({ userId: id, refreshed: true });
    expect(touchSession(db, token, t0 + 2 * 86_400_000 + SESSION_MS + 1)).toBeNull();
  });

  it('uses DEV_FAKE_USER outside production only', async () => {
    const { app } = await setup({ DEV_FAKE_USER: 'pavel' });
    expect((await app.inject({ url: '/api/me' })).json()).toMatchObject({ displayName: 'pavel' });
    expect(loadConfig({ NODE_ENV: 'production', SESSION_SECRET: 'x'.repeat(32), DEV_FAKE_USER: 'pavel' }).devFakeUser).toBeNull();
  });

  it('reads play and admin groups from env with defaults', () => {
    expect(loadConfig({ NODE_ENV: 'test' })).toMatchObject({ playGroups: ['pixel-farm'], adminGroups: ['pixel-farm-admin'] });
    expect(loadConfig({ NODE_ENV: 'test', PLAY_GROUPS: 'family, pixel-farm', ADMIN_GROUPS: 'admins' })).toMatchObject({
      playGroups: ['family', 'pixel-farm'],
      adminGroups: ['admins'],
    });
  });

  it('returns 503 from /auth/login when OIDC is not configured', async () => {
    const { app } = await setup();
    expect((await app.inject({ url: '/auth/login' })).statusCode).toBe(503);
  });

  it('rejects a callback without the flow cookie', async () => {
    const { app } = await setup();
    const res = await app.inject({ url: '/auth/callback?code=x&state=y' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/?login=expired');
  });
});
