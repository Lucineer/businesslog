import type { Report, ReportType, Task } from './types.js';

export interface ReportMessage {
  id: string;
  userId: string;
  content: string;
  timestamp: Date;
  channel?: string;
}

export interface ComputedStats {
  messageCount: number;
  taskCompletionRate: number;
  activeUsers: string[];
  topTopics: string[];
  tasksByStatus: Record<string, number>;
  tasksByPriority: Record<string, number>;
}

let reportCounter = 0;

function generateId(): string {
  reportCounter += 1;
  return `rpt_${Date.now()}_${reportCounter}`;
}

export function computeStats(messages: ReportMessage[], tasks: Task[]): ComputedStats {
  const tasksByStatus: Record<string, number> = {};
  const tasksByPriority: Record<string, number> = {};

  for (const task of tasks) {
    tasksByStatus[task.status] = (tasksByStatus[task.status] ?? 0) + 1;
    tasksByPriority[task.priority] = (tasksByPriority[task.priority] ?? 0) + 1;
  }

  const totalTasks = tasks.length || 1;
  const doneTasks = tasks.filter(t => t.status === 'done').length;
  const activeUsers = [...new Set(messages.map(m => m.userId))];

  const wordFreq: Record<string, number> = {};
  for (const msg of messages) {
    const words = msg.content.toLowerCase().split(/\s+/);
    for (const w of words) {
      if (w.length > 4) {
        wordFreq[w] = (wordFreq[w] ?? 0) + 1;
      }
    }
  }
  const topTopics = Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);

  return {
    messageCount: messages.length,
    taskCompletionRate: doneTasks / totalTasks,
    activeUsers,
    topTopics,
    tasksByStatus,
    tasksByPriority,
  };
}

function buildSummary(type: ReportType, stats: ComputedStats, messages: ReportMessage[]): string {
  const period = type.charAt(0).toUpperCase() + type.slice(1);
  const lines = [
    `# ${period} Report`,
    '',
    `**Messages**: ${stats.messageCount}`,
    `**Active Users**: ${stats.activeUsers.length}`,
    `**Task Completion Rate**: ${(stats.taskCompletionRate * 100).toFixed(1)}%`,
    '',
    '## Task Breakdown',
    ...Object.entries(stats.tasksByStatus).map(([s, c]) => `- ${s}: ${c}`),
    '',
    '## Top Topics',
    ...stats.topTopics.slice(0, 5).map(t => `- ${t}`),
  ];
  return lines.join('\n');
}

function generateReport(
  type: ReportType,
  messages: ReportMessage[],
  tasks: Task[],
  userId: string,
): Report {
  const stats = computeStats(messages, tasks);
  const summary = buildSummary(type, stats, messages);

  return {
    id: generateId(),
    type,
    title: `${type.charAt(0).toUpperCase() + type.slice(1)} Report`,
    summary,
    data: { stats, chartData: { tasksByStatus: stats.tasksByStatus, tasksByPriority: stats.tasksByPriority } },
    generatedAt: new Date(),
    generatedBy: userId,
  };
}

export function generateDailyReport(messages: ReportMessage[], tasks: Task[]): Report {
  return generateReport('daily', messages, tasks, 'system');
}

export function generateWeeklyReport(messages: ReportMessage[], tasks: Task[]): Report {
  return generateReport('weekly', messages, tasks, 'system');
}
