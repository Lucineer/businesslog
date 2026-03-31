// Businesslog type definitions

export type ReportType = 'daily' | 'weekly' | 'monthly' | 'quarterly';

export interface Report {
  id: string;
  type: ReportType;
  title: string;
  summary: string;
  data: Record<string, unknown>;
  generatedAt: Date;
  generatedBy: string;
}

export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId?: string;
  creatorId: string;
  dueDate?: Date;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export interface Meeting {
  id: string;
  title: string;
  date: Date;
  duration: number; // minutes
  participants: string[]; // userIds
  summary: string;
  actionItems: string[];
  transcript?: string;
  createdAt: Date;
}

export interface KnowledgeEntry {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  accessCount: number;
}

export interface CRMContact {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  notes: string;
  tags: string[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}
