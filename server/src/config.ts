export interface Config {
  port: number;
  host: string;
  publicUrl: string;
  dbPath: string;
  sessionSecret: string;
  staticDir: string | null;
  oidc: { issuer: string; clientId: string; clientSecret: string } | null;
  vapid: { publicKey: string; privateKey: string; subject: string } | null;
  /** Authelia groups allowed to play / to administer. Admins may always play. */
  playGroups: string[];
  adminGroups: string[];
  /** Dev-only: treat every unauthenticated request as this user. Ignored in production. */
  devFakeUser: string | null;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const production = env.NODE_ENV === 'production';
  const sessionSecret = env.SESSION_SECRET || (production ? '' : 'dev-only-insecure-secret-change-me!');
  if (sessionSecret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters');

  const oidc =
    env.OIDC_ISSUER && env.OIDC_CLIENT_ID && env.OIDC_CLIENT_SECRET
      ? { issuer: env.OIDC_ISSUER, clientId: env.OIDC_CLIENT_ID, clientSecret: env.OIDC_CLIENT_SECRET }
      : null;
  const vapid =
    env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY
      ? {
          publicKey: env.VAPID_PUBLIC_KEY,
          privateKey: env.VAPID_PRIVATE_KEY,
          subject: env.VAPID_SUBJECT ?? 'mailto:admin@ppolivka.com',
        }
      : null;

  return {
    port: Number(env.PORT ?? 3000),
    host: env.HOST ?? '0.0.0.0',
    publicUrl: (env.PUBLIC_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
    dbPath: env.DB_PATH ?? './data/farm.db',
    sessionSecret,
    staticDir: env.STATIC_DIR ?? null,
    oidc,
    vapid,
    playGroups: list(env.PLAY_GROUPS, ['pixel-farm']),
    adminGroups: list(env.ADMIN_GROUPS, ['pixel-farm-admin']),
    devFakeUser: !production && env.DEV_FAKE_USER ? env.DEV_FAKE_USER : null,
  };
}

function list(value: string | undefined, fallback: string[]): string[] {
  const items = (value ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return items.length ? items : fallback;
}
