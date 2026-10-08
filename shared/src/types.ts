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
