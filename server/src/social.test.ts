import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { advance, apply, startGame, type FarmState, type Inbox, type Village } from '@pixel-farm/shared';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { openDb } from './db.js';
import { runJobs } from './notify.js';
import type { PushMessage } from './push.js';
import { createSession } from './sessions.js';
import { upsertUser } from './users.js';

// Prague is UTC+2 on this date.
const at = (h: number, m = 0, day = 8) => Date.UTC(2026, 9, day, h - 2, m);
let app: FastifyInstance | undefined;
let now = at(10);
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function setup() {
  const db = openDb(':memory:');
  now = at(10);
  app = await buildApp(loadConfig({ NODE_ENV: 'test' }), db, () => now);
  const player = (name: string, locale: 'cs' | 'en' = 'en') => {
    const id = upsertUser(db, { sub: name, displayName: name, locale, isAdmin: false });
    return { id, cookies: { pf_session: createSession(db, id) } };
  };
  return { app, db, player };
}

type Player = { id: number; cookies: { pf_session: string } };

async function upload(app: FastifyInstance, p: Player, s: FarmState, baseVersion = 0) {
  const res = await app.inject({ method: 'PUT', url: '/api/save', cookies: p.cookies, payload: { baseVersion, state: s } });
  return res.json<{ version: number; clamped: string[] }>();
}

function sender() {
  const sent: { userId: number; msg: PushMessage }[] = [];
  return { sent, send: async (userId: number, msg: PushMessage) => (sent.push({ userId, msg }), 1) };
}

describe('visits', () => {
  it('shows a read-only village, takes one sticker per visit, and lands in the inbox', async () => {
    const { app, player } = await setup();
    const kid = player('Kid');
    const mum = player('Nikola');
    const farm = startGame(now, 1);
    for (let i = 0; i < 7; i++) apply(farm, { type: 'tap', at: now });
    await upload(app, mum, farm);

    const village = (await app.inject({ url: `/api/village/${mum.id}`, cookies: kid.cookies })).json<Village>();
    expect(village).toMatchObject({ id: mum.id, name: 'Nikola', level: 1, giftsLeft: 3, state: { coins: 7 } });
    expect((await app.inject({ url: '/api/village/999', cookies: kid.cookies })).statusCode).toBe(404);

    const { id } = (await app.inject({ method: 'POST', url: '/api/visits', cookies: kid.cookies, payload: { ownerId: mum.id } })).json<{ id: number }>();
    expect((await app.inject({ method: 'POST', url: `/api/visits/${id}/sticker`, cookies: kid.cookies, payload: { sticker: 'heart' } })).statusCode).toBe(204);
    expect((await app.inject({ method: 'POST', url: `/api/visits/${id}/sticker`, cookies: kid.cookies, payload: { sticker: 'sun' } })).statusCode).toBe(409);
    expect((await app.inject({ method: 'POST', url: `/api/visits/${id}/sticker`, cookies: mum.cookies, payload: { sticker: 'sun' } })).statusCode).toBe(409);
    expect((await app.inject({ method: 'POST', url: '/api/visits', cookies: kid.cookies, payload: { ownerId: kid.id } })).statusCode).toBe(400);

    let inbox = (await app.inject({ url: '/api/inbox', cookies: mum.cookies })).json<Inbox>();
    expect(inbox.visits).toEqual([expect.objectContaining({ visitor: { id: kid.id, name: 'Kid' }, sticker: 'heart', seen: false })]);
    await app.inject({ method: 'POST', url: '/api/inbox/seen', cookies: mum.cookies });
    inbox = (await app.inject({ url: '/api/inbox', cookies: mum.cookies })).json<Inbox>();
    expect(inbox.visits[0]!.seen).toBe(true);
  });
});

describe('gifts', () => {
  it('sends within the caps, claims once, and the claimed gift passes the save check', async () => {
    const { app, player } = await setup();
    const dad = player('Pavel');
    const kid = player('Kid');
    // An hour-old farm with some wheat in the barn.
    const dadFarm = startGame(now - 3_600_000, 1);
    advance(dadFarm, now);
    dadFarm.inv.wheat = 200;
    expect((await upload(app, dad, dadFarm)).clamped).toEqual([]);
    const kidFarm = startGame(now, 2);
    await upload(app, kid, kidFarm);

    const send = (gift: object) => app.inject({ method: 'POST', url: '/api/gifts', cookies: dad.cookies, payload: { to: kid.id, gift } });
    expect((await send({ kind: 'item', item: 'wheat', qty: 500 })).statusCode).toBe(409); // not in the barn
    // Two wheat fields make 2/3 coin a second: 10 % of an hour is 240 coins, 120 wheat.
    expect((await send({ kind: 'item', item: 'wheat', qty: 150 })).json()).toMatchObject({ error: 'too_big', cap: 240 });
    const ok = await send({ kind: 'item', item: 'wheat', qty: 5 });
    expect(ok.json()).toMatchObject({ giftsLeft: 2 });
    await send({ kind: 'flower' });
    await send({ kind: 'flower' });
    expect((await send({ kind: 'flower' })).statusCode).toBe(429);
    expect((await app.inject({ method: 'POST', url: '/api/gifts', cookies: dad.cookies, payload: { to: dad.id, gift: { kind: 'flower' } } })).statusCode).toBe(400);

    const inbox = (await app.inject({ url: '/api/inbox', cookies: kid.cookies })).json<Inbox>();
    expect(inbox.gifts.map((g) => g.gift)).toEqual([{ kind: 'item', item: 'wheat', qty: 5 }, { kind: 'flower' }, { kind: 'flower' }]);
    for (const g of inbox.gifts) {
      const claim = await app.inject({ method: 'POST', url: `/api/gifts/${g.id}/claim`, cookies: kid.cookies });
      apply(kidFarm, { type: 'giftClaim', at: now, gift: claim.json().gift });
    }
    expect((await app.inject({ method: 'POST', url: `/api/gifts/${inbox.gifts[0]!.id}/claim`, cookies: kid.cookies })).statusCode).toBe(409);
    expect((await app.inject({ url: '/api/inbox', cookies: kid.cookies })).json<Inbox>().gifts).toEqual([]);
    expect(kidFarm.inv.wheat).toBe(5);
    expect(await upload(app, kid, kidFarm, 1)).toEqual({ version: 2, clamped: [] });

    // Tomorrow the limit resets.
    now += 86_400_000;
    expect((await send({ kind: 'flower' })).statusCode).toBe(200);
  });
});

describe('notifications', () => {
  it('sends a gift message right away by day and holds it until 08:00 at night', async () => {
    const { app, db, player } = await setup();
    const [a, b] = [player('Pavel'), player('Nikola', 'cs')];
    const { sent, send } = sender();
    await app.inject({ method: 'POST', url: '/api/gifts', cookies: a.cookies, payload: { to: b.id, gift: { kind: 'flower' } } });
    await runJobs(db, now, send);
    expect(sent).toEqual([{ userId: b.id, msg: expect.objectContaining({ title: 'Dárek! 🎁', body: expect.stringContaining('Pavel') }) }]);

    now = at(21);
    await app.inject({ method: 'POST', url: '/api/gifts', cookies: a.cookies, payload: { to: b.id, gift: { kind: 'flower' } } });
    expect(await runJobs(db, at(23), send)).toEqual([]);
    expect(await runJobs(db, at(7, 59, 9), send)).toEqual([]);
    expect(await runJobs(db, at(8, 0, 9), send)).toEqual([expect.objectContaining({ type: 'gift', result: 'sent' })]);
  });

  it('batches visits: one message an hour, naming everyone', async () => {
    const { app, db, player } = await setup();
    const [owner, kid, dad] = [player('Nikola'), player('Kid'), player('Pavel')];
    const { sent, send } = sender();
    const visit = (p: Player) => app.inject({ method: 'POST', url: '/api/visits', cookies: p.cookies, payload: { ownerId: owner.id } });
    await visit(kid);
    await visit(dad);
    await runJobs(db, now, send);
    expect(sent.map((s) => s.msg.body)).toEqual(['Kid and Pavel visited your farm.']);

    now += 10 * 60_000;
    await visit(kid);
    expect(await runJobs(db, now, send)).toEqual([]);
    expect(await runJobs(db, at(11, 1), send)).toEqual([expect.objectContaining({ type: 'visit', result: 'sent' })]);
    expect(sent[1]!.msg.body).toBe('Kid visited your farm.');
  });

  it('tells a player their crops are ready, unless they played since, at most twice a day', async () => {
    const { app, db, player } = await setup();
    const p = player('Kid');
    const { sent, send } = sender();
    const farm = startGame(now, 1);
    apply(farm, { type: 'plant', at: now, field: 0, crop: 'wheat' });
    apply(farm, { type: 'plant', at: now, field: 1, crop: 'wheat' });
    let version = (await upload(app, p, farm)).version;
    await runJobs(db, now + 5_000, send);
    expect(sent).toEqual([]);
    await runJobs(db, now + 7_000, send);
    expect(sent.map((s) => s.msg.title)).toEqual(['Crops are ready 🌾']);

    // Played (synced) after the crops got ripe: no message.
    for (let round = 0; round < 3; round++) {
      now += 60_000;
      apply(farm, { type: 'harvest', at: now, field: 0 });
      apply(farm, { type: 'harvest', at: now, field: 1 });
      apply(farm, { type: 'plant', at: now, field: 0, crop: 'wheat' });
      apply(farm, { type: 'plant', at: now, field: 1, crop: 'wheat' });
      version = (await upload(app, p, farm, version)).version;
      await runJobs(db, now + 7_000, send);
    }
    expect(sent).toHaveLength(2);

    const [last] = db.prepare("SELECT result FROM jobs WHERE type = 'ready' ORDER BY id DESC LIMIT 1").all() as { result: string }[];
    expect(last!.result).toBe('capped');
  });

  it('respects switched-off types and validates prefs', async () => {
    const { app, db, player } = await setup();
    const [a, b] = [player('Pavel'), player('Nikola')];
    const prefs = { types: { gift: false, visit: true, ready: true }, quiet: { start: '21:00', end: '07:00' } };
    expect((await app.inject({ method: 'PUT', url: '/api/push/prefs', cookies: b.cookies, payload: prefs })).json()).toEqual(prefs);
    expect((await app.inject({ url: '/api/push/prefs', cookies: b.cookies })).json()).toEqual(prefs);
    expect((await app.inject({ method: 'PUT', url: '/api/push/prefs', cookies: b.cookies, payload: { ...prefs, quiet: { start: '25:00', end: '7' } } })).statusCode).toBe(400);
    await app.inject({ method: 'POST', url: '/api/gifts', cookies: a.cookies, payload: { to: b.id, gift: { kind: 'flower' } } });
    const { sent, send } = sender();
    expect(await runJobs(db, now, send)).toEqual([expect.objectContaining({ result: 'off' })]);
    expect(sent).toEqual([]);
  });
});
