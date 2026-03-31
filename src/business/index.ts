// Businesslog — Business features module barrel export

export type {
  ReportType,
  Report,
  TaskStatus,
  TaskPriority,
  Task,
  Meeting,
  KnowledgeEntry,
  CRMContact,
} from './types.js';

export {
  computeStats,
  generateDailyReport,
  generateWeeklyReport,
} from './reports.js';

export type { ReportMessage, ComputedStats } from './reports.js';

export {
  InMemoryTaskStore,
  getTaskStats,
} from './tasks.js';

export type {
  TaskCreateInput,
  TaskUpdateInput,
  TaskFilters,
  TaskStats,
  TaskStore,
} from './tasks.js';

export {
  InMemoryKnowledgeStore,
} from './knowledge.js';

export type {
  KnowledgeCreateInput,
  KnowledgeUpdateInput,
  SearchResult,
  CategoryInfo,
  KnowledgeStore,
} from './knowledge.js';

export {
  InMemoryCRMStore,
  SalesforceIntegration,
  HubSpotIntegration,
} from './crm.js';

export type {
  CRMCreateInput,
  CRMUpdateInput,
  ExternalCRMIntegration,
  CRMStore,
} from './crm.js';
