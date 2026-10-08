import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import * as oidc from 'openid-client';
import { pickLocale } from '@pixel-farm/shared';
import type { Config } from './config.js';
import type { DB } from './db.js';
import { SESSION_COOKIE, SESSION_MS, createSession, deleteSession, touchSession } from './sessions.js';
import { upsertUser } from './users.js';

const FLOW_COOKIE = 'pf_oidc';

declare module 'fastify' {
  interface FastifyRequest {
    userId: number | null;
  }
}

interface FlowState {
  verifier: string;
  state: string;
  nonce: string;
}

export function registerAuth(app: FastifyInstance, cfg: Config, db: DB): void {
  const secure = cfg.publicUrl.startsWith('https://');
  const redirectUri = `${cfg.publicUrl}/auth/callback`;

  const setSessionCookie = (reply: FastifyReply, token: string) =>
    reply.setCookie(SESSION_COOKIE, token, {
      path: '/',
      httpOnly: true,
      secure,
      sameSite: 'lax',
      maxAge: SESSION_MS / 1000,
    });

  // Discovery is lazy so the server boots even when Authelia is unreachable.
  let oidcConfig: Promise<oidc.Configuration> | null = null;
  const getOidc = () => {
    if (!cfg.oidc) throw new Error('OIDC is not configured');
    oidcConfig ??= oidc
      .discovery(new URL(cfg.oidc.issuer), cfg.oidc.clientId, cfg.oidc.clientSecret, oidc.ClientSecretBasic(cfg.oidc.clientSecret))
      .catch((err: unknown) => {
        oidcConfig = null;
        throw err;
      });
    return oidcConfig;
  };

  app.decorateRequest('userId', null);
  app.addHook('onRequest', async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) {
      const s = touchSession(db, token);
      if (s) {
        req.userId = s.userId;
        if (s.refreshed) setSessionCookie(reply, token);
        return;
      }
    }
    if (cfg.devFakeUser) {
      req.userId = upsertUser(db, {
        sub: `dev:${cfg.devFakeUser}`,
        displayName: cfg.devFakeUser,
        locale: pickLocale(req.headers['accept-language']),
        isAdmin: true,
      });
    }
  });

  app.get('/auth/login', async (_req, reply) => {
    if (!cfg.oidc) return reply.code(503).send({ error: 'oidc_not_configured' });
    const config = await getOidc();
    const flow: FlowState = {
      verifier: oidc.randomPKCECodeVerifier(),
      state: oidc.randomState(),
      nonce: oidc.randomNonce(),
    };
    const url = oidc.buildAuthorizationUrl(config, {
      redirect_uri: redirectUri,
      scope: 'openid profile groups',
      code_challenge: await oidc.calculatePKCECodeChallenge(flow.verifier),
      code_challenge_method: 'S256',
      state: flow.state,
      nonce: flow.nonce,
    });
    reply.setCookie(FLOW_COOKIE, JSON.stringify(flow), {
      path: '/auth',
      httpOnly: true,
      secure,
      sameSite: 'lax',
      signed: true,
      maxAge: 600,
    });
    return reply.redirect(url.href);
  });

  app.get('/auth/callback', async (req, reply) => {
    const raw = req.cookies[FLOW_COOKIE];
    const unsigned = raw ? req.unsignCookie(raw) : null;
    reply.clearCookie(FLOW_COOKIE, { path: '/auth' });
    if (!unsigned?.valid || !unsigned.value) return reply.redirect('/?login=expired');
    const flow = JSON.parse(unsigned.value) as FlowState;

    const config = await getOidc();
    let tokens: Awaited<ReturnType<typeof oidc.authorizationCodeGrant>>;
    try {
      tokens = await oidc.authorizationCodeGrant(config, new URL(req.url, cfg.publicUrl), {
        pkceCodeVerifier: flow.verifier,
        expectedState: flow.state,
        expectedNonce: flow.nonce,
        idTokenExpected: true,
      });
    } catch (err) {
      req.log.warn({ err }, 'oidc callback failed');
      return reply.redirect('/?login=failed');
    }
    const idClaims = tokens.claims()!;
    // Authelia may keep profile/groups out of the ID token, so read them from userinfo.
    const info = await oidc.fetchUserInfo(config, tokens.access_token, idClaims.sub);
    const groups = (info.groups ?? idClaims.groups ?? []) as string[];
    const isAdmin = groups.some((g) => cfg.adminGroups.includes(g));
    if (!isAdmin && !groups.some((g) => cfg.playGroups.includes(g))) {
      return reply.redirect('/?login=forbidden');
    }
    const userId = upsertUser(db, {
      sub: idClaims.sub,
      displayName: String(info.name ?? info.preferred_username ?? idClaims.sub),
      locale: pickLocale(req.headers['accept-language']),
      isAdmin,
    });
    setSessionCookie(reply, createSession(db, userId));
    return reply.redirect('/');
  });

  app.post('/auth/logout', async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) deleteSession(db, token);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return reply.code(204).send();
  });
}

export async function requireUser(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (req.userId == null) await reply.code(401).send({ error: 'unauthorized' });
}
