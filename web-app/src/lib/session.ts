import type { ClubType } from '@/types';
import type { SessionOptions } from 'iron-session';

export type SessionData = {
  club?: ClubType;
};

export const sessionOptions: SessionOptions = {
  password:
    process.env.SESSION_PASSWORD ??
    'dev-only-secret-please-change-me-must-be-at-least-32-characters-long',
  cookieName: 'tmm_session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    httpOnly: true,
    path: '/',
  },
};
