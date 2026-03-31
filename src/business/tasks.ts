import type { Task, TaskStatus, TaskPriority } from './types.js';

export interface TaskCreateInput {
  title: string;
  description?: string;
  priority?: TaskPriority;
  assigneeId?: string;
  creatorId: string;
  dueDate?: Date;
  tags?: string[];
}

export interface TaskUpdateInput {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: string;
  dueDate?: Date;
  tags?: string[];
}

export interface TaskFilters {
  status?: TaskStatus;
  assigneeId?: string;
  priority?: TaskPriority;
  tags?: string[];
}

export interface TaskStats {
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  overdue: number;
  total: number;
}

const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  todo: ['in_progress', 'cancelled'],
  in_progress: ['done', 'cancelled'],
  done: [],
  cancelled: [],
};

let taskCounter = 0;

function generateId(): string {
  taskCounter += 1;
  return `task_${Date.now()}_${taskCounter}`;
}

export interface TaskStore {
  create(input: TaskCreateInput): Task;
  get(id: string): Task | undefined;
  update(id: string, updates: TaskUpdateInput): Task | undefined;
  delete(id: string): boolean;
  list(filters?: TaskFilters): Task[];
  countByStatus(): Record<TaskStatus, number>;
}

export class InMemoryTaskStore implements TaskStore {
  private tasks = new Map<string, Task>();

  create(input: TaskCreateInput): Task {
    const now = new Date();
    const task: Task = {
      id: generateId(),
      title: input.title,
      description: input.description ?? '',
      status: 'todo',
      priority: input.priority ?? 'medium',
      assigneeId: input.assigneeId,
      creatorId: input.creatorId,
      dueDate: input.dueDate,
      tags: input.tags ?? [],
      createdAt: now,
      updatedAt: now,
    };
    this.tasks.set(task.id, task);
    return task;
  }

  get(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  update(id: string, updates: TaskUpdateInput): Task | undefined {
    const task = this.tasks.get(id);
    if (!task) return undefined;

    if (updates.status !== undefined && updates.status !== task.status) {
      const allowed = VALID_TRANSITIONS[task.status];
      if (!allowed.includes(updates.status)) {
        throw new Error(`Invalid transition: ${task.status} -> ${updates.status}`);
      }
    }

    const now = new Date();
    const updated: Task = {
      ...task,
      ...updates,
      updatedAt: now,
      completedAt: updates.status === 'done' ? now : task.completedAt,
    };
    this.tasks.set(id, updated);
    return updated;
  }

  delete(id: string): boolean {
    return this.tasks.delete(id);
  }

  list(filters?: TaskFilters): Task[] {
    let results = [...this.tasks.values()];
    if (filters?.status) results = results.filter(t => t.status === filters.status);
    if (filters?.assigneeId) results = results.filter(t => t.assigneeId === filters.assigneeId);
    if (filters?.priority) results = results.filter(t => t.priority === filters.priority);
    if (filters?.tags?.length) {
      results = results.filter(t => filters.tags!.some(tag => t.tags.includes(tag)));
    }
    return results;
  }

  countByStatus(): Record<TaskStatus, number> {
    const counts: Record<TaskStatus, number> = { todo: 0, in_progress: 0, done: 0, cancelled: 0 };
    for (const task of this.tasks.values()) {
      counts[task.status] += 1;
    }
    return counts;
  }
}

export function getTaskStats(store: InMemoryTaskStore): TaskStats {
  const all = store.list();
  const byStatus: Record<string, number> = {};
  const byPriority: Record<string, number> = {};
  const now = new Date();

  for (const task of all) {
    byStatus[task.status] = (byStatus[task.status] ?? 0) + 1;
    byPriority[task.priority] = (byPriority[task.priority] ?? 0) + 1;
  }

  const overdue = all.filter(t => t.dueDate && t.dueDate < now && t.status !== 'done' && t.status !== 'cancelled').length;

  return { byStatus, byPriority, overdue, total: all.length };
}
