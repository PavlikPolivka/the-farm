export type Locale = 'cs' | 'en';

/** Response of GET /api/me. */
export interface Me {
  id: number;
  displayName: string;
  locale: Locale;
  isAdmin: boolean;
}

export interface PushSubscriptionPayload {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** GET /api/save, and the server copy sent back on a conflict. version 0 = no save yet. */
export interface SaveResponse {
  version: number;
  state: unknown;
}

/** PUT /api/save */
export interface SaveUpload {
  /** The server version this save was built on. */
  baseVersion: number;
  state: unknown;
}

/** PUT /api/save, accepted. `state` is present only when the server clamped the upload. */
export interface SaveAccepted {
  version: number;
  clamped: string[];
  state?: unknown;
}

export const BOARD_IDS = ['allTime', 'week', 'daily', 'minigames', 'collector', 'achievements'] as const;
export type BoardId = (typeof BOARD_IDS)[number];

export interface BoardRow {
  userId: number;
  name: string;
  /** Competition ranking: ties share a rank (1, 1, 3). */
  rank: number;
  value: number;
  /** allTime: lifetime coins next to the prestige level. */
  detail?: number;
}

/** GET /api/leaderboards/:board. Minigame Bests has one section per game; the rest have one. */
export interface Board {
  board: BoardId;
  sections: { game?: string; rows: BoardRow[] }[];
}

/** GET /api/family: everyone who has played, the caller first. */
export interface FamilyMember {
  id: number;
  name: string;
  level: number;
  lifetimeCoins: number;
  weekCoins: number;
  /** Last accepted save, ms since epoch; null before the first sync. */
  lastSeen: number | null;
  /** Won yesterday's daily challenge: wears the crown today. */
  crown: boolean;
}

/** Daily challenge state for the caller. `crown` is yesterday's winner, who wears it today. */
export interface DailyInfo {
  day: string;
  game: import('./games/engine.js').GameId;
  status: 'open' | 'started' | 'done';
  score: number | null;
  rank: number | null;
  players: number;
  crown: { userId: number; name: string } | null;
}

/** GET /api/games */
export interface GamesInfo {
  daily: DailyInfo;
  games: { id: import('./games/engine.js').GameId; best: number | null; rewardsLeft: number }[];
}

/** POST /api/daily/start */
export interface DailyStart {
  day: string;
  game: import('./games/engine.js').GameId;
  seed: number;
}

/** POST /api/minigame/result and /api/daily/result */
export interface PlayResult {
  score: number;
  best: number;
  /** Apply with the farm's `reward` action. null once today's rewards are used up. */
  reward: { id: number; coins: number; xp: number } | null;
  rewardsLeft: number;
  rank?: number;
}

/** GET /api/village/:userId: someone's farm as of their last sync, read-only. */
export interface Village {
  id: number;
  name: string;
  level: number;
  crown: boolean;
  /** The farm save (FarmState); the client catches it up to now for display. */
  state: unknown;
  updatedAt: number;
  /** Gifts the caller may still send this player today. */
  giftsLeft: number;
}

export interface InboxGift {
  id: number;
  from: { id: number; name: string };
  gift: import('./sim/social.js').Gift;
  createdAt: number;
}

export interface InboxVisit {
  id: number;
  visitor: { id: number; name: string };
  sticker: import('./sim/social.js').Sticker | null;
  createdAt: number;
  seen: boolean;
}

/** GET /api/inbox: unclaimed gifts and the last week's visits. */
export interface Inbox {
  gifts: InboxGift[];
  visits: InboxVisit[];
}

export const PUSH_TYPES = ['gift', 'visit', 'ready'] as const;
export type PushType = (typeof PUSH_TYPES)[number];

/** Per-player notification settings (GET/PUT /api/push/prefs). */
export interface PushPrefs {
  types: Record<PushType, boolean>;
  /** Prague wall-clock "HH:MM"; equal start and end turns quiet hours off. */
  quiet: { start: string; end: string };
}

export const DEFAULT_PUSH_PREFS: PushPrefs = {
  types: { gift: true, visit: true, ready: true },
  quiet: { start: '20:00', end: '08:00' },
};
