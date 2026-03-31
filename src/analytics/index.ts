// index.ts — Barrel export for the businesslog.ai analytics module

// Types
export type {
  AnalyticsEventType,
  AnalyticsEvent,
  MessageStats,
  UserActivityStats,
  TopicEntry,
  TopicStats,
  TaskStats,
  DashboardData,
  ExportFormat,
  EventFilters,
} from './types.js';

// Collector
export { AnalyticsCollector } from './collector.js';

// Aggregation functions
export {
  aggregateMessageStats,
  aggregateUserActivity,
  aggregateTopics,
  aggregateTaskStats,
  generateDashboardData,
} from './aggregator.js';

// Export utilities
export {
  exportToCSV,
  exportToJSON,
  setContentDispositionHeader,
} from './exporter.js';
