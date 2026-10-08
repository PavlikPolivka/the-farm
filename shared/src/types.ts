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
}
