/**
 * Authentication utilities for businesslog.ai.
 *
 * Uses the `jose` library for JWT signing/verification (edge-friendly, no
 * native addons) and `bcryptjs` for password hashing (pure JS, works
 * everywhere including Cloudflare Workers).
 */

import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import type { UserRole } from './types.js';
import type { AuthToken } from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** JWT signing algorithm used for all tokens. */
export const TOKEN_ALGORITHM = 'HS256' as const;

/** Access token time-to-live in seconds (15 minutes). */
const ACCESS_TTL_SECONDS = 15 * 60;

/** Refresh token time-to-live in seconds (7 days). */
const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

let _secret: Uint8Array | null = null;

/**
 * Returns the JWT secret derived from the `JWT_SECRET` environment variable.
 * Cached after first call for the lifetime of the process.
 *
 * @throws {Error} If `JWT_SECRET` is not set in the environment.
 */
function getSecret(): Uint8Array {
  if (_secret) return _secret;
  const raw = process.env.JWT_SECRET;
  if (!raw) {
    throw new Error(
      '[auth] JWT_SECRET environment variable is required but not set',
    );
  }
  _secret = new TextEncoder().encode(raw);
  return _secret;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate an access/refresh token pair for the given user.
 *
 * @param userId - The unique user identifier to encode in the token payload.
 * @param role   - The user's role, included so middleware can authorize
 *                 without an extra database lookup.
 * @returns An {@link AuthToken} with both tokens and expiry info.
 */
export async function generateTokenPair(
  userId: string,
  role: UserRole,
): Promise<AuthToken> {
  const secret = getSecret();

  const accessToken = await new SignJWT({ userId, role })
    .setProtectedHeader({ alg: TOKEN_ALGORITHM })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
    .sign(secret);

  const refreshToken = await new SignJWT({ userId, role, type: 'refresh' })
    .setProtectedHeader({ alg: TOKEN_ALGORITHM })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${REFRESH_TTL_SECONDS}s`)
    .sign(secret);

  return {
    accessToken,
    refreshToken,
    expiresIn: ACCESS_TTL_SECONDS,
  };
}

/**
 * Verify and decode an access token.
 *
 * @param token - The raw JWT string from the Authorization header.
 * @returns The decoded payload containing `userId` and `role`.
 * @throws {Error} If the token is missing, malformed, or expired.
 */
export async function verifyAccessToken(
  token: string,
): Promise<{ userId: string; role: UserRole }> {
  const secret = getSecret();

  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: [TOKEN_ALGORITHM],
    });

    const userId = payload.sub as string;
    const role = payload.role as UserRole;

    if (!userId || !role) {
      throw new Error('Token payload is missing required fields');
    }

    return { userId, role };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Access token verification failed';
    throw new Error(`[auth] ${message}`);
  }
}

/**
 * Verify and decode a refresh token.
 *
 * @param token - The raw refresh JWT string.
 * @returns The decoded payload containing `userId` and `role`.
 * @throws {Error} If the token is missing, malformed, expired, or not a
 *                 refresh token.
 */
export async function verifyRefreshToken(
  token: string,
): Promise<{ userId: string; role: UserRole }> {
  const secret = getSecret();

  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: [TOKEN_ALGORITHM],
    });

    if (payload.type !== 'refresh') {
      throw new Error('Provided token is not a refresh token');
    }

    const userId = payload.sub as string;
    const role = payload.role as UserRole;

    if (!userId || !role) {
      throw new Error('Token payload is missing required fields');
    }

    return { userId, role };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Refresh token verification failed';
    throw new Error(`[auth] ${message}`);
  }
}

/**
 * Hash a plaintext password using bcrypt.
 *
 * Uses a cost factor of 12 which balances security and performance for
 * typical server hardware.
 *
 * @param password - The plaintext password to hash.
 * @returns The bcrypt hash string.
 */
export async function hashPassword(password: string): Promise<string> {
  const SALT_ROUNDS = 12;
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verify a plaintext password against a stored bcrypt hash.
 *
 * @param password - The plaintext password attempt.
 * @param hash     - The stored bcrypt hash to compare against.
 * @returns `true` if the password matches, `false` otherwise.
 */
export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
