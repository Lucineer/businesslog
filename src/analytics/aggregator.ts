// aggregator.ts — Data aggregation functions for businesslog.ai analytics

import type {
  AnalyticsEvent,
  MessageStats,
  UserActivityStats,
  TopicStats,
  TaskStats,
  DashboardData,
} from './types.js';
import type { User } from '../users/types.js';
import { UserRole } from '../users/types.js';
import type { AnalyticsCollector } from './collector.js';

// ---------------------------------------------------------------------------
// Stop words for keyword extraction
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'it', 'that', 'this', 'was', 'are',
  'be', 'has', 'had', 'have', 'will', 'would', 'could', 'should', 'may',
  'can', 'do', 'does', 'did', 'not', 'no', 'so', 'if', 'as', 'up', 'out',
  'about', 'into', 'over', 'after', 'then', 'than', 'too', 'very', 'just',
  'also', 'now', 'here', 'there', 'when', 'where', 'how', 'all', 'each',
  'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'only',
  'own', 'same', 'its', 'our', 'we', 'you', 'your', 'they', 'them', 'he',
  'she', 'his', 'her', 'i', 'me', 'my', 'what', 'which', 'who', 'whom',
  'am', 'been', 'being', 'were', 'these', 'those',
]);

// ---------------------------------------------------------------------------
// Aggregation functions
// ---------------------------------------------------------------------------

/**
 * Aggregate message statistics from message events within a date range.
 *
 * Calculates per-user counts, per-day counts, and average response time
 * (time between a sent message and the next received message in the same session).
 */
export function aggregateMessageStats(
  events: AnalyticsEvent[],
  period: { start: Date; end: Date },
): MessageStats {
  const inRange = events.filter(
    (e) =>
      (e.type === 'message_sent' || e.type === 'message_received') &&
      e.timestamp >= period.start &&
      e.timestamp <= period.end,
  );

  const byUser: Record<string, number> = {};
  const byDay: Record<string, number> = {};
  let total = 0;

  for (const event of inRange) {
    total++;
    byUser[event.userId] = (byUser[event.userId] ?? 0) + 1;
    const day = event.timestamp.toISOString().slice(0, 10);
    byDay[day] = (byDay[day] ?? 0) + 1;
  }

  // Calculate average response time (sent -> received, same session)
  const sentBySession = new Map<string, Date>();
  let responseTotal = 0;
  let responseCount = 0;

  const sorted = [...inRange].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
  );

  for (const event of sorted) {
    if (!event.sessionId) continue;
    if (event.type === 'message_sent') {
      sentBySession.set(event.sessionId, event.timestamp);
    } else if (event.type === 'message_received') {
      const sentAt = sentBySession.get(event.sessionId);
      if (sentAt) {
        responseTotal += event.timestamp.getTime() - sentAt.getTime();
        responseCount++;
        sentBySession.delete(event.sessionId);
      }
    }
  }

  return {
    total,
    byUser,
    byDay,
    avgResponseTime: responseCount > 0 ? responseTotal / responseCount : 0,
  };
}

/**
 * Aggregate user activity from events and the user store.
 *
 * Counts active users in the last day, week, and month, broken down by role.
 */
export function aggregateUserActivity(
  events: AnalyticsEvent[],
  users: Map<string, User>,
): UserActivityStats {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 86_400_000);
  const oneWeekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const oneMonthAgo = new Date(now.getTime() - 30 * 86_400_000);

  const activeUsers = new Set<string>();
  const activeByPeriod = { today: new Set<string>(), week: new Set<string>(), month: new Set<string>() };

  for (const event of events) {
    activeUsers.add(event.userId);
    if (event.timestamp >= oneDayAgo) activeByPeriod.today.add(event.userId);
    if (event.timestamp >= oneWeekAgo) activeByPeriod.week.add(event.userId);
    if (event.timestamp >= oneMonthAgo) activeByPeriod.month.add(event.userId);
  }

  const byRole: Record<UserRole, number> = {
    [UserRole.Admin]: 0,
    [UserRole.Member]: 0,
    [UserRole.Viewer]: 0,
  };

  for (const user of users.values()) {
    byRole[user.role] = (byRole[user.role] ?? 0) + 1;
  }

  return {
    totalUsers: users.size,
    activeToday: activeByPeriod.today.size,
    activeThisWeek: activeByPeriod.week.size,
    activeThisMonth: activeByPeriod.month.size,
    byRole,
  };
}

/**
 * Extract topics from message content via simple keyword frequency analysis.
 *
 * Splits content on whitespace, removes stop words and tokens shorter than 3
 * characters, then returns the top 20 keywords with counts and percentages.
 */
export function aggregateTopics(
  messages: { content: string }[],
): TopicStats {
  const freq = new Map<string, number>();
  let totalWords = 0;

  for (const msg of messages) {
    const words = msg.content
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/);

    for (const word of words) {
      if (word.length < 3 || STOP_WORDS.has(word)) continue;
      totalWords++;
      freq.set(word, (freq.get(word) ?? 0) + 1);
    }
  }

  const sorted = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  const topics = sorted.map(([topic, count]) => ({
    topic,
    count,
    percentage: totalWords > 0 ? Math.round((count / totalWords) * 10000) / 100 : 0,
  }));

  return {
    topics,
    totalAnalyzed: messages.length,
  };
}

/**
 * Aggregate task statistics from task events.
 */
export function aggregateTaskStats(events: AnalyticsEvent[]): TaskStats {
  let created = 0;
  let completed = 0;

  for (const event of events) {
    if (event.type === 'task_created') created++;
    if (event.type === 'task_completed') completed++;
  }

  return {
    created,
    completed,
    completionRate: created > 0 ? completed / created : 0,
  };
}

/**
 * Generate the full dashboard payload by combining all aggregation functions.
 */
export function generateDashboardData(
  collector: AnalyticsCollector,
  userStore: Map<string, User>,
  period: { start: Date; end: Date },
): DashboardData {
  const events = collector.getEvents();

  return {
    messageStats: aggregateMessageStats(events, period),
    userActivity: aggregateUserActivity(events, userStore),
    topicStats: aggregateTopics(
      events
        .filter((e) => e.type === 'message_sent' && typeof e.data.content === 'string')
        .map((e) => ({ content: e.data.content as string })),
    ),
    taskStats: aggregateTaskStats(events),
    period,
  };
}
