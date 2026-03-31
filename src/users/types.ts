/**
 * User types and role-based permission definitions for businesslog.ai.
 *
 * All user-facing interfaces and the ROLE_PERMISSIONS constant live here
 * so the rest of the module can import a single source of truth.
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Supported user roles, ordered by privilege (admin > member > viewer). */
export enum UserRole {
  Admin = 'admin',
  Member = 'member',
  Viewer = 'viewer',
}

// ---------------------------------------------------------------------------
// Core interfaces
// ---------------------------------------------------------------------------

/** A persisted user record. Password is intentionally excluded. */
export interface User {
  /** Unique identifier (UUID v4). */
  id: string;
  /** Unique email address, used as login identifier. */
  email: string;
  /** Display name. */
  name: string;
  /** Assigned role governing access. */
  role: UserRole;
  /** Optional avatar URL (external or uploaded). */
  avatarUrl?: string;
  /** Department or team the user belongs to. */
  department?: string;
  /** Timestamp when the user was first created. */
  createdAt: Date;
  /** Timestamp of the most recent profile update. */
  updatedAt: Date;
  /** Timestamp of last authenticated activity. */
  lastActiveAt: Date;
  /** Whether the account is currently active. */
  isActive: boolean;
}

/** Payload for creating a new user. */
export interface CreateUserInput {
  email: string;
  password: string;
  name: string;
  role?: UserRole;
  department?: string;
}

/** Partial payload for updating an existing user. */
export interface UpdateUserInput {
  name?: string;
  role?: UserRole;
  department?: string;
  avatarUrl?: string;
}

// ---------------------------------------------------------------------------
// Auth / token types
// ---------------------------------------------------------------------------

/** A pair of JWT access and refresh tokens with expiry metadata. */
export interface AuthToken {
  /** Short-lived access token (15 min). */
  accessToken: string;
  /** Long-lived refresh token (7 days). */
  refreshToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
}

/** Successful login response containing the authenticated user and tokens. */
export interface LoginResponse {
  /** User record (never includes password). */
  user: Omit<User, never>;
  /** JWT token pair. */
  token: AuthToken;
}

// ---------------------------------------------------------------------------
// Permission model
// ---------------------------------------------------------------------------

/** A grant linking a resource name to the actions allowed on it. */
export interface Permission {
  /** Resource identifier (e.g. "chat", "tasks", "admin.settings"). */
  resource: string;
  /** Allowed actions on the resource (e.g. "read", "write", "delete"). */
  actions: string[];
}

/**
 * Role-to-permission mapping.
 *
 * - **admin** — unrestricted access to every resource.
 * - **member** — can interact with chat, tasks, and knowledge but cannot
 *   manage users or system settings.
 * - **viewer** — read-only access across permitted resources.
 */
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  [UserRole.Admin]: [
    { resource: 'admin.settings', actions: ['read', 'write', 'delete'] },
    { resource: 'admin.users', actions: ['read', 'write', 'delete'] },
    { resource: 'admin.billing', actions: ['read', 'write'] },
    { resource: 'chat', actions: ['read', 'write', 'delete'] },
    { resource: 'tasks', actions: ['read', 'write', 'delete'] },
    { resource: 'knowledge', actions: ['read', 'write', 'delete'] },
    { resource: 'analytics', actions: ['read', 'export'] },
    { resource: 'integrations', actions: ['read', 'write', 'delete'] },
  ],
  [UserRole.Member]: [
    { resource: 'chat', actions: ['read', 'write'] },
    { resource: 'tasks', actions: ['read', 'write'] },
    { resource: 'knowledge', actions: ['read', 'write'] },
    { resource: 'analytics', actions: ['read'] },
  ],
  [UserRole.Viewer]: [
    { resource: 'chat', actions: ['read'] },
    { resource: 'tasks', actions: ['read'] },
    { resource: 'knowledge', actions: ['read'] },
  ],
};
