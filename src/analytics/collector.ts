// collector.ts — Event collection and storage for businesslog.ai analytics

import { randomUUID } from 'node:crypto';
import type {
  AnalyticsEvent,
  AnalyticsEventType,
  EventFilters,
  ExportFormat,
} from './types.js';
import { exportToCSV, exportToJSON } from './exporter.js';

/** Maximum number of events retained in memory. Oldest are pruned first. */
const MAX_EVENTS = 10_000;

/**
 * In-memory analytics event collector.
 *
 * Tracks user actions, messages, and system events for aggregation and export.
 * Events are stored in a Map keyed by ID for O(1) lookup and stable pruning.
 */
export class AnalyticsCollector {
  private events: Map<string, AnalyticsEvent> = new Map();

  /**
   * Track a new analytics event.
   *
   * @returns The created event (with generated id and timestamp).
   */
  track(
    type: AnalyticsEventType,
    userId: string,
    data: Record<string, unknown> = {},
    sessionId?: string,
  ): AnalyticsEvent {
    const event: AnalyticsEvent = {
      id: randomUUID(),
      type,
      userId,
      data,
      timestamp: new Date(),
      ...(sessionId ? { sessionId } : {}),
    };

    this.events.set(event.id, event);
    this.enforceLimit();
    return event;
  }

  /**
   * Retrieve events matching optional filters.
   *
   * Results are sorted by timestamp ascending.
   */
  getEvents(filters?: EventFilters): AnalyticsEvent[] {
    let results = Array.from(this.events.values());

    if (filters) {
      if (filters.type) {
        results = results.filter((e) => e.type === filters.type);
      }
      if (filters.userId) {
        results = results.filter((e) => e.userId === filters.userId);
      }
      if (filters.since) {
        results = results.filter((e) => e.timestamp >= filters.since!);
      }
      if (filters.until) {
        results = results.filter((e) => e.timestamp <= filters.until!);
      }
    }

    return results.sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
    );
  }

  /**
   * Count events with optional type, user, and date filters.
   */
  getEventCount(type?: AnalyticsEventType, userId?: string, since?: Date): number {
    let count = 0;
    for (const event of this.events.values()) {
      if (type && event.type !== type) continue;
      if (userId && event.userId !== userId) continue;
      if (since && event.timestamp < since) continue;
      count++;
    }
    return count;
  }

  /**
   * Remove all events older than the given date.
   *
   * @returns The number of pruned events.
   */
  prune(olderThan: Date): number {
    let pruned = 0;
    for (const [id, event] of this.events) {
      if (event.timestamp < olderThan) {
        this.events.delete(id);
        pruned++;
      }
    }
    return pruned;
  }

  /**
   * Export all stored events in the specified format.
   */
  exportEvents(format: ExportFormat): string {
    const all = this.getEvents();
    if (format === 'csv') {
      return exportToCSV(all as unknown as Record<string, unknown>[]);
    }
    return exportToJSON(all);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /** Enforce the MAX_EVENTS ceiling by dropping the oldest entries. */
  private enforceLimit(): void {
    if (this.events.size <= MAX_EVENTS) return;

    const sorted = Array.from(this.events.values()).sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
    );

    const excess = this.events.size - MAX_EVENTS;
    for (let i = 0; i < excess; i++) {
      this.events.delete(sorted[i].id);
    }
  }
}
