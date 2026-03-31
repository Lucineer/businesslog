/**
 * Hono middleware for businesslog.ai authentication, authorization, rate
 * limiting, and activity logging.
 *
 * Every middleware is a standard Hono middleware function and can be composed
 * with `app.use()` or applied to individual routes.
 */

import type { Context, Next } from 'hono';
import { UserRole } from './types.js';
import type { User } from './types.js';
import { verifyAccessToken } from './auth.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Variables added to the Hono context by {@link authMiddleware}. */
export interface AuthContext {
  user: Pick<User, 'id' | 'email' | 'role' | 'isActive'>;
}

/** Structure stored for each user in the rate-limit map. */
interface RateLimitEntry {
  count: number;
  windowStart: number;
}

/** Minimal analytics event logged by {@link activityLogger}. */
interface ActivityEvent {
  userId: string;
  method: string;
  path: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Analytics store (simple in-memory, replace with real sink in production)
// ---------------------------------------------------------------------------

const analyticsBuffer: ActivityEvent[] = [];

/**
 * Retrieve all buffered activity events (useful for tests or a batch flush).
 * Not part of the public API surface — exported for internal use only.
 */
export function drainAnalytics(): ActivityEvent[] {
  const events = [...analyticsBuffer];
  analyticsBuffer.length = 0;
  return events;
}

// ---------------------------------------------------------------------------
// Auth middleware
// ---------------------------------------------------------------------------

/**
 * Extract and verify a Bearer JWT from the Authorization header.
 *
 * On success the decoded user identity is attached to `c.set('user', ...)`.
 * On failure a 401 response is returned immediately.
 */
export async function authMiddleware(c: Context, next: Next): Promise<Response | void> {
  const header = c.req.header('Authorization');
  if (!header) {
    return c.json({ error: 'Missing Authorization header' }, 401);
  }

  const parts = header.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return c.json({ error: 'Invalid Authorization header format. Expected: Bearer <token>' }, 401);
  }

  const token = parts[1];
  try {
    const payload = await verifyAccessToken(token);

    // The user context attached here is intentionally minimal — just enough
    // for downstream middleware and handlers to authorize the request.
    c.set('user', {
      id: payload.userId,
      role: payload.role,
      isActive: true,
    } satisfies AuthContext['user']);

    await next();
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Token verification failed';
    return c.json({ error: message }, 401);
  }
}

// ---------------------------------------------------------------------------
// Role middleware
// ---------------------------------------------------------------------------

/**
 * Create middleware that restricts access to users with one of the given roles.
 *
 * Must be registered **after** {@link authMiddleware} so that `c.get('user')`
 * is populated.
 *
 * @param roles - One or more roles that are permitted to proceed.
 */
export function roleMiddleware(...roles: UserRole[]) {
  const allowed = new Set<UserRole>(roles);

  return async function roleGuard(c: Context, next: Next): Promise<Response | void> {
    const user = c.get('user') as AuthContext['user'] | undefined;

    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    if (!allowed.has(user.role as UserRole)) {
      return c.json({ error: 'Insufficient permissions' }, 403);
    }

    await next();
  };
}

// ---------------------------------------------------------------------------
// Rate-limit middleware
// ---------------------------------------------------------------------------

/**
 * Create per-user rate-limiting middleware.
 *
 * Requests are tracked per user ID (after auth) or per IP (before auth) using
 * a sliding-window counter stored in memory.
 *
 * @param maxRequests - Maximum number of requests allowed within the window.
 * @param windowMs    - Window duration in milliseconds.
 */
export function rateLimitMiddleware(maxRequests: number, windowMs: number) {
  const buckets = new Map<string, RateLimitEntry>();

  // Periodically purge stale entries to prevent unbounded growth.
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of buckets) {
      if (now - entry.windowStart > windowMs) {
        buckets.delete(key);
      }
    }
  }, windowMs);

  // Allow the timer to not prevent process exit.
  if (cleanup && typeof cleanup.unref === 'function') {
    cleanup.unref();
  }

  return async function rateLimiter(
    c: Context,
    next: Next,
  ): Promise<Response | void> {
    // Prefer authenticated user ID; fall back to client IP.
    const authUser = c.get('user') as AuthContext['user'] | undefined;
    const key = authUser?.id ?? c.req.header('x-forwarded-for') ?? 'unknown';

    const now = Date.now();
    let entry = buckets.get(key);

    // Reset the window if it has expired.
    if (!entry || now - entry.windowStart > windowMs) {
      entry = { count: 0, windowStart: now };
      buckets.set(key, entry);
    }

    entry.count += 1;

    if (entry.count > maxRequests) {
      c.header('X-RateLimit-Limit', String(maxRequests));
      c.header('X-RateLimit-Remaining', '0');
      c.header('X-RateLimit-Reset', String(entry.windowStart + windowMs));
      return c.json({ error: 'Rate limit exceeded' }, 429);
    }

    c.header('X-RateLimit-Limit', String(maxRequests));
    c.header('X-RateLimit-Remaining', String(maxRequests - entry.count));
    c.header('X-RateLimit-Reset', String(entry.windowStart + windowMs));

    await next();
  };
}

// ---------------------------------------------------------------------------
// Activity logger middleware
// ---------------------------------------------------------------------------

/**
 * Log authenticated user activity to the analytics buffer.
 *
 * Attaches the HTTP method, path, and a timestamp for every request that
 * passes through auth. This is lightweight and non-blocking — in production,
 * replace the in-memory buffer with a real analytics pipeline (e.g. ClickHouse,
 * PostHog, or a logging sidecar).
 */
export async function activityLogger(
  c: Context,
  next: Next,
): Promise<void> {
  const startTime = Date.now();

  await next();

  const user = c.get('user') as AuthContext['user'] | undefined;
  if (user) {
    analyticsBuffer.push({
      userId: user.id,
      method: c.req.method,
      path: c.req.path,
      timestamp: new Date(startTime).toISOString(),
    });
  }
}
