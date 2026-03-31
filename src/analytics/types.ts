// types.ts — Analytics type definitions for businesslog.ai

import type { UserRole } from '../users/types.js';

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

/** Supported analytics event types tracked across the application. */
export type AnalyticsEventType =
  | 'message_sent'
  | 'message_received'
  | 'user_login'
  | 'user_logout'
  | 'task_created'
  | 'task_completed'
  | 'report_generated'
  | 'search_query'
  | 'page_view';

/** A single tracked analytics event. */
export interface AnalyticsEvent {
  /** Unique identifier (UUID v4). */
  id: string;
  /** The type of event that occurred. */
  type: AnalyticsEventType;
  /** ID of the user who triggered the event. */
  userId: string;
  /** Arbitrary key-value payload attached to the event. */
  data: Record<string, unknown>;
  /** When the event occurred. */
  timestamp: Date;
  /** Optional session ID for correlating related events. */
  sessionId?: string;
}

// ---------------------------------------------------------------------------
// Aggregation result types
// ---------------------------------------------------------------------------

/** Message statistics for a given period. */
export interface MessageStats {
  /** Total number of messages in the period. */
  total: number;
  /** Message counts keyed by user ID. */
  byUser: Record<string, number>;
  /** Message counts keyed by ISO date string (YYYY-MM-DD). */
  byDay: Record<string, number>;
  /** Average response time in milliseconds between sent and received. */
  avgResponseTime: number;
}

/** User activity breakdown. */
export interface UserActivityStats {
  /** Total registered users. */
  totalUsers: number;
  /** Users with at least one event today. */
  activeToday: number;
  /** Users active in the last 7 days. */
  activeThisWeek: number;
  /** Users active in the last 30 days. */
  activeThisMonth: number;
  /** User counts broken down by role. */
  byRole: Record<UserRole, number>;
}

/** A single topic extracted from message content. */
export interface TopicEntry {
  /** The keyword or phrase. */
  topic: string;
  /** How many times it appeared. */
  count: number;
  /** Percentage of total analyzed content. */
  percentage: number;
}

/** Topic analysis results. */
export interface TopicStats {
  /** Top extracted topics, sorted by frequency descending. */
  topics: TopicEntry[];
  /** Total number of messages analyzed. */
  totalAnalyzed: number;
}

/** Task completion statistics. */
export interface TaskStats {
  /** Total tasks created in the period. */
  created: number;
  /** Total tasks completed in the period. */
  completed: number;
  /** Completion rate as a fraction (0-1). */
  completionRate: number;
}

/** The full dashboard payload returned to the frontend. */
export interface DashboardData {
  messageStats: MessageStats;
  userActivity: UserActivityStats;
  topicStats: TopicStats;
  taskStats: TaskStats;
  /** The date range this dashboard covers. */
  period: {
    start: Date;
    end: Date;
  };
}

// ---------------------------------------------------------------------------
// Export types
// ---------------------------------------------------------------------------

/** Supported export file formats. */
export type ExportFormat = 'csv' | 'json';

// ---------------------------------------------------------------------------
// Filter types
// ---------------------------------------------------------------------------

/** Optional filters when querying analytics events. */
export interface EventFilters {
  type?: AnalyticsEventType;
  userId?: string;
  since?: Date;
  until?: Date;
}
