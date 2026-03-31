/**
 * Public barrel export for the businesslog.ai users module.
 *
 * Import everything from this single entry point:
 *
 * ```ts
 * import { UserRole, InMemoryUserStore, authMiddleware } from './users/index.js';
 * ```
 */

// Types & permissions
export {
  UserRole,
  ROLE_PERMISSIONS,
} from './types.js';
export type {
  User,
  CreateUserInput,
  UpdateUserInput,
  AuthToken,
  LoginResponse,
  Permission,
} from './types.js';

// Auth utilities
export {
  TOKEN_ALGORITHM,
  generateTokenPair,
  verifyAccessToken,
  verifyRefreshToken,
  hashPassword,
  verifyPassword,
} from './auth.js';

// User store
export { InMemoryUserStore } from './store.js';
export type { UserStore } from './store.js';

// Hono middleware
export {
  authMiddleware,
  roleMiddleware,
  rateLimitMiddleware,
  activityLogger,
  drainAnalytics,
} from './middleware.js';
export type { AuthContext } from './middleware.js';
