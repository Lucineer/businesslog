/**
 * User store abstraction for businesslog.ai.
 *
 * Provides an {@link InMemoryUserStore} suitable for development and testing,
 * behind a database-agnostic {@link UserStore} interface that can be
 * reimplemented for any persistence layer (Postgres, D1, SQLite, etc.).
 */

import { randomUUID } from 'node:crypto';
import type { User, CreateUserInput, UpdateUserInput, UserRole } from './types.js';
import { UserRole as UserRoleEnum } from './types.js';

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

/**
 * Database-agnostic user store contract.
 *
 * Every method returns data synchronously for the in-memory implementation.
 * A real database adapter would return Promises — the interface is kept
 * Promise-based so adapters share the same signature.
 */
export interface UserStore {
  /** Create a new user and return the persisted record. */
  createUser(input: CreateUserInput): Promise<User>;

  /** Retrieve a user by ID. Returns `undefined` if not found. */
  getUser(id: string): Promise<User | undefined>;

  /** Retrieve a user by email. Returns `undefined` if not found. */
  getUserByEmail(email: string): Promise<User | undefined>;

  /** Apply a partial update to an existing user. Returns the updated record. */
  updateUser(id: string, input: UpdateUserInput): Promise<User | undefined>;

  /** Soft-delete a user (sets `isActive` to `false`). Returns `true` on success. */
  deleteUser(id: string): Promise<boolean>;

  /** List all users, optionally filtered by role and active status. */
  listUsers(filters?: { role?: UserRole; activeOnly?: boolean }): Promise<User[]>;

  /** Return the total number of users, optionally filtered by active status. */
  countUsers(activeOnly?: boolean): Promise<number>;

  /** Verify a user's password. Returns the user record on success, `undefined` otherwise. */
  verifyUserPassword(email: string, password: string): Promise<User | undefined>;
}

// ---------------------------------------------------------------------------
// In-memory implementation
// ---------------------------------------------------------------------------

/**
 * In-memory user store backed by two Maps.
 *
 * - `users` — user records keyed by ID.
 * - `passwords` — bcrypt password hashes keyed by user ID. Never returned
 *   to callers.
 */
export class InMemoryUserStore implements UserStore {
  private readonly users = new Map<string, User>();
  private readonly passwords = new Map<string, string>();

  /** @inheritdoc */
  async createUser(input: CreateUserInput): Promise<User> {
    // Check for duplicate email.
    const existing = [...this.users.values()].find(
      (u) => u.email === input.email,
    );
    if (existing) {
      throw new Error(`[store] A user with email "${input.email}" already exists`);
    }

    // Import hashPassword lazily to avoid circular concerns at module level.
    const { hashPassword } = await import('./auth.js');

    const id = randomUUID();
    const now = new Date();

    const user: User = {
      id,
      email: input.email,
      name: input.name,
      role: input.role ?? UserRoleEnum.Member,
      department: input.department,
      createdAt: now,
      updatedAt: now,
      lastActiveAt: now,
      isActive: true,
    };

    const hashed = await hashPassword(input.password);
    this.passwords.set(id, hashed);
    this.users.set(id, user);

    return user;
  }

  /** @inheritdoc */
  async getUser(id: string): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;

    // Track last activity timestamp.
    user.lastActiveAt = new Date();

    return { ...user };
  }

  /** @inheritdoc */
  async getUserByEmail(email: string): Promise<User | undefined> {
    const user = [...this.users.values()].find(
      (u) => u.email.toLowerCase() === email.toLowerCase(),
    );
    if (!user) return undefined;

    user.lastActiveAt = new Date();
    return { ...user };
  }

  /** @inheritdoc */
  async updateUser(
    id: string,
    input: UpdateUserInput,
  ): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;

    if (input.name !== undefined) user.name = input.name;
    if (input.role !== undefined) user.role = input.role;
    if (input.department !== undefined) user.department = input.department;
    if (input.avatarUrl !== undefined) user.avatarUrl = input.avatarUrl;

    user.updatedAt = new Date();

    return { ...user };
  }

  /** @inheritdoc */
  async deleteUser(id: string): Promise<boolean> {
    const user = this.users.get(id);
    if (!user) return false;

    user.isActive = false;
    user.updatedAt = new Date();
    return true;
  }

  /** @inheritdoc */
  async listUsers(
    filters?: { role?: UserRole; activeOnly?: boolean },
  ): Promise<User[]> {
    let results = [...this.users.values()];

    if (filters?.role) {
      results = results.filter((u) => u.role === filters.role);
    }
    if (filters?.activeOnly) {
      results = results.filter((u) => u.isActive);
    }

    return results.map((u) => ({ ...u }));
  }

  /** @inheritdoc */
  async countUsers(activeOnly?: boolean): Promise<number> {
    if (!activeOnly) return this.users.size;
    return [...this.users.values()].filter((u) => u.isActive).length;
  }

  /** @inheritdoc */
  async verifyUserPassword(
    email: string,
    password: string,
  ): Promise<User | undefined> {
    const user = [...this.users.values()].find(
      (u) => u.email.toLowerCase() === email.toLowerCase() && u.isActive,
    );
    if (!user) return undefined;

    const storedHash = this.passwords.get(user.id);
    if (!storedHash) return undefined;

    const { verifyPassword } = await import('./auth.js');
    const valid = await verifyPassword(password, storedHash);
    if (!valid) return undefined;

    user.lastActiveAt = new Date();
    return { ...user };
  }
}
