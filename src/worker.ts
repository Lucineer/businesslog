/**
 * businesslog.ai — Main Worker/Server
 *
 * Hono-based server that works as both a Cloudflare Worker and standalone Node.js server.
 * Handles auth, chat, business features, analytics, and static file serving.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

// ─── Types ───────────────────────────────────────────────────────────

type UserRole = 'admin' | 'member' | 'viewer';

interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  department?: string;
  createdAt: string;
  lastActiveAt: string;
  isActive: boolean;
}

interface Conversation {
  id: string;
  userId: string;
  title: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

interface Task {
  id: string;
  title: string;
  description: string;
  status: 'todo' | 'in_progress' | 'done' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assigneeId?: string;
  creatorId: string;
  dueDate?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

interface KnowledgeEntry {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  accessCount: number;
}

interface AnalyticsEvent {
  id: string;
  type: string;
  userId: string;
  data: Record<string, unknown>;
  timestamp: string;
}

interface Env {
  JWT_SECRET: string;
  LLM_API_KEY: string;
  LLM_MODEL: string;
  LLM_BASE_URL: string;
  ADMIN_EMAIL: string;
  ADMIN_PASSWORD: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function uuid(): string {
  return crypto.randomUUID();
}

function now(): string {
  return new Date().toISOString();
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function error(message: string, status = 400): Response {
  return json({ error: message }, status);
}

function unauthorized(): Response {
  return error('Unauthorized', 401);
}

function forbidden(): Response {
  return error('Forbidden', 403);
}

function notFound(): Response {
  return error('Not found', 404);
}

// ─── JWT (Web Crypto) ────────────────────────────────────────────────

function encodeBase64Url(bytes: Uint8Array): string {
  const bin = Array.from(bytes, (b) => String.fromCharCode(b));
  return btoa(bin.join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function decodeBase64Url(str: string): Uint8Array {
  let b = str.replace(/-/g, '+').replace(/_/g, '/');
  while (b.length % 4) b += '=';
  const bin = atob(b);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function hmacSign(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return encodeBase64Url(new Uint8Array(sig));
}

async function hmacVerify(data: string, sig: string, secret: string): Promise<boolean> {
  const expected = await hmacSign(data, secret);
  const a = decodeBase64Url(sig);
  const b = decodeBase64Url(expected);
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a[i]! ^ b[i]!;
  return r === 0;
}

async function createToken(payload: Record<string, unknown>, secret: string, expirySec: number): Promise<string> {
  const header = encodeBase64Url(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = encodeBase64Url(new TextEncoder().encode(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + expirySec })));
  const sig = await hmacSign(`${header}.${body}`, secret);
  return `${header}.${body}.${sig}`;
}

async function verifyToken(token: string, secret: string): Promise<Record<string, unknown> | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts as [string, string, string];
  if (!(await hmacVerify(`${header}.${body}`, sig, secret))) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(body)));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

// ─── Password Hashing (Web Crypto) ───────────────────────────────────

async function hashPassword(password: string): Promise<string> {
  const salt = uuid();
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 100000, hash: 'SHA-256' }, key, 256);
  return `${salt}:${encodeBase64Url(new Uint8Array(bits))}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 100000, hash: 'SHA-256' }, key, 256);
  const computed = encodeBase64Url(new Uint8Array(bits));
  return computed === hash;
}

// ─── In-Memory Stores ────────────────────────────────────────────────

const users = new Map<string, User>();
const passwords = new Map<string, string>();
const conversations = new Map<string, Conversation>();
const tasks = new Map<string, Task>();
const knowledge = new Map<string, KnowledgeEntry>();
const analytics: AnalyticsEvent[] = [];
const rateLimits = new Map<string, { count: number; resetAt: number }>();

function trackEvent(type: string, userId: string, data: Record<string, unknown> = {}) {
  analytics.push({ id: uuid(), type, userId, data, timestamp: now() });
  if (analytics.length > 10000) analytics.shift();
}

// ─── Rate Limiting ───────────────────────────────────────────────────

function checkRateLimit(userId: string, max = 100, windowMs = 60000): boolean {
  const key = userId;
  const entry = rateLimits.get(key);
  const nowMs = Date.now();
  if (!entry || entry.resetAt < nowMs) {
    rateLimits.set(key, { count: 1, resetAt: nowMs + windowMs });
    return true;
  }
  if (entry.count >= max) return false;
  entry.count++;
  return true;
}

// ─── App ─────────────────────────────────────────────────────────────

const app = new Hono();

// Middleware
app.use('*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'], allowHeaders: ['Content-Type', 'Authorization'] }));
app.use('*', logger());
app.use('*', async (c, next) => {
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('X-XSS-Protection', '1; mode=block');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  await next();
});

// ─── Health ──────────────────────────────────────────────────────────

app.get('/health', (c) => {
  return json({ status: 'ok', version: '1.0.0', uptime: process.uptime?.() ?? 0, timestamp: now() });
});

// ─── Auth Routes ─────────────────────────────────────────────────────

app.post('/api/auth/register', async (c) => {
  const body = await c.req.json();
  const { email, password, name } = body;
  if (!email || !password || !name) return error('email, password, and name required');
  if (password.length < 8) return error('Password must be at least 8 characters');
  for (const u of users.values()) {
    if (u.email === email.toLowerCase()) return error('Email already registered', 409);
  }
  const id = uuid();
  const role: UserRole = users.size === 0 ? 'admin' : 'member';
  const user: User = { id, email: email.toLowerCase(), name, role, createdAt: now(), lastActiveAt: now(), isActive: true };
  users.set(id, user);
  passwords.set(id, await hashPassword(password));
  const secret = process.env.JWT_SECRET ?? c.env?.JWT_SECRET ?? 'dev-secret';
  const token = await createToken({ sub: id, email: user.email, role }, secret, 900);
  const refresh = await createToken({ sub: id, type: 'refresh' }, secret, 604800);
  trackEvent('user_registered', id, { role });
  return json({ user: { id: user.id, email: user.email, name: user.name, role: user.role }, token: { accessToken: token, refreshToken: refresh, expiresIn: 900 } }, 201);
});

app.post('/api/auth/login', async (c) => {
  const body = await c.req.json();
  const { email, password } = body;
  if (!email || !password) return error('email and password required');
  const user = Array.from(users.values()).find(u => u.email === email.toLowerCase());
  if (!user) return error('Invalid credentials', 401);
  const hash = passwords.get(user.id);
  if (!hash || !(await verifyPassword(password, hash))) return error('Invalid credentials', 401);
  user.lastActiveAt = now();
  const secret = process.env.JWT_SECRET ?? c.env?.JWT_SECRET ?? 'dev-secret';
  const token = await createToken({ sub: user.id, email: user.email, role: user.role }, secret, 900);
  const refresh = await createToken({ sub: user.id, type: 'refresh' }, secret, 604800);
  trackEvent('user_login', user.id);
  return json({ user: { id: user.id, email: user.email, name: user.name, role: user.role }, token: { accessToken: token, refreshToken: refresh, expiresIn: 900 } });
});

app.post('/api/auth/refresh', async (c) => {
  const body = await c.req.json();
  const { refreshToken } = body;
  if (!refreshToken) return error('refreshToken required');
  const secret = process.env.JWT_SECRET ?? c.env?.JWT_SECRET ?? 'dev-secret';
  const payload = await verifyToken(refreshToken, secret);
  if (!payload || payload.type !== 'refresh') return unauthorized();
  const user = users.get(payload.sub as string);
  if (!user) return unauthorized();
  const token = await createToken({ sub: user.id, email: user.email, role: user.role }, secret, 900);
  const newRefresh = await createToken({ sub: user.id, type: 'refresh' }, secret, 604800);
  return json({ token: { accessToken: token, refreshToken: newRefresh, expiresIn: 900 } });
});

// ─── Auth Middleware ─────────────────────────────────────────────────

async function getAuth(c: any): Promise<{ userId: string; role: UserRole } | null> {
  const auth = c.req.header('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const secret = process.env.JWT_SECRET ?? c.env?.JWT_SECRET ?? 'dev-secret';
  const payload = await verifyToken(auth.slice(7), secret);
  if (!payload) return null;
  return { userId: payload.sub as string, role: payload.role as UserRole };
}

// ─── User Routes ─────────────────────────────────────────────────────

app.get('/api/users', async (c) => {
  const auth = await getAuth(c);
  if (!auth) return unauthorized();
  if (auth.role !== 'admin') return forbidden();
  const list = Array.from(users.values()).map(u => ({ id: u.id, email: u.email, name: u.name, role: u.role, department: u.department, isActive: u.isActive, lastActiveAt: u.lastActiveAt }));
  return json(list);
});

app.get('/api/users/:id', async (c) => {
  const auth = await getAuth(c);
  if (!auth) return unauthorized();
  const user = users.get(c.req.param('id'));
  if (!user) return notFound();
  return json({ id: user.id, email: user.email, name: user.name, role: user.role, department: user.department, isActive: user.isActive, createdAt: user.createdAt, lastActiveAt: user.lastActiveAt });
});

app.patch('/api/users/:id', async (c) => {
  const auth = await getAuth(c);
  if (!auth) return unauthorized();
  const targetId = c.req.param('id');
  if (auth.role !== 'admin' && auth.userId !== targetId) return forbidden();
  const user = users.get(targetId);
  if (!user) return notFound();
  const body = await c.req.json();
  if (body.name) user.name = body.name;
  if (body.department) user.department = body.department;
  if (auth.role === 'admin' && body.role && ['admin', 'member', 'viewer'].includes(body.role)) user.role = body.role;
  return json({ id: user.id, email: user.email, name: user.name, role: user.role, department: user.department });
});

app.delete('/api/users/:id', async (c) => {
  const auth = await getAuth(c);
  if (!auth || auth.role !== 'admin') return auth ? forbidden() : unauthorized();
  const targetId = c.req.param('id');
  const user = users.get(targetId);
  if (!user) return notFound();
  users.delete(targetId);
  passwords.delete(targetId);
  return json({ deleted: true });
});

// ─── Chat Routes ─────────────────────────────────────────────────────

app.post('/api/chat', async (c) => {
  const auth = await getAuth(c);
  if (!auth) return unauthorized();
  if (!checkRateLimit(auth.userId, 30, 60000)) return error('Rate limit exceeded', 429);
  const body = await c.req.json();
  const { message, conversationId } = body;
  if (!message) return error('message required');

  let conv: Conversation;
  if (conversationId && conversations.has(conversationId)) {
    conv = conversations.get(conversationId)!;
  } else {
    conv = { id: uuid(), userId: auth.userId, title: message.slice(0, 60), messages: [], createdAt: now(), updatedAt: now() };
    conversations.set(conv.id, conv);
  }

  conv.messages.push({ id: uuid(), role: 'user', content: message, timestamp: now() });

  // Simulate AI response (in production, call LLM API)
  const aiResponse = generateAIResponse(message);
  conv.messages.push({ id: uuid(), role: 'assistant', content: aiResponse, timestamp: now() });
  conv.updatedAt = now();

  trackEvent('message_sent', auth.userId, { conversationId: conv.id });
  trackEvent('message_received', auth.userId, { conversationId: conv.id });

  return json({ conversationId: conv.id, message: conv.messages[conv.messages.length - 1] });
});

app.get('/api/chat/history', async (c) => {
  const auth = await getAuth(c);
  if (!auth) return unauthorized();
  const userConvs = Array.from(conversations.values())
    .filter(c => c.userId === auth.userId)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .map(c => ({ id: c.id, title: c.title, messageCount: c.messages.length, createdAt: c.createdAt, updatedAt: c.updatedAt }));
  return json(userConvs);
});

app.get('/api/chat/:id', async (c) => {
  const auth = await getAuth(c);
  if (!auth) return unauthorized();
  const conv = conversations.get(c.req.param('id'));
  if (!conv || (conv.userId !== auth.userId && auth.role !== 'admin')) return notFound();
  return json(conv);
});

app.delete('/api/chat/:id', async (c) => {
  const auth = await getAuth(c);
  if (!auth) return unauthorized();
  const id = c.req.param('id');
  const conv = conversations.get(id);
  if (!conv || (conv.userId !== auth.userId && auth.role !== 'admin')) return notFound();
  conversations.delete(id);
  return json({ deleted: true });
});

// ─── Business Routes ─────────────────────────────────────────────────

app.get('/api/business/reports/daily', async (c) => {
  const auth = await getAuth(c);
  if (!auth) return unauthorized();
  const today = now().split('T')[0];
  const todayEvents = analytics.filter(e => e.timestamp.startsWith(today!));
  const msgCount = todayEvents.filter(e => e.type === 'message_sent').length;
  const taskCount = Array.from(tasks.values()).filter(t => t.createdAt.startsWith(today!)).length;
  return json({ date: today, messagesSent: msgCount, tasksCreated: taskCount, activeUsers: new Set(todayEvents.map(e => e.userId)).size, generatedAt: now() });
});

app.get('/api/business/reports/weekly', async (c) => {
  const auth = await getAuth(c);
  if (!auth) return unauthorized();
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const weekEvents = analytics.filter(e => e.timestamp >= weekAgo);
  return json({
    period: { start: weekAgo, end: now() },
    totalMessages: weekEvents.filter(e => e.type === 'message_sent').length,
    tasksCreated: weekEvents.filter(e => e.type === 'task_created').length,
    activeUsers: new Set(weekEvents.map(e => e.userId)).size,
    topTopics: ['Revenue Analysis', 'Sprint Planning', 'Customer Support'],
    generatedAt: now()
  });
});

app.post('/api/business/tasks', async (c) => {
  const auth = await getAuth(c);
  if (!auth) return unauthorized();
  const body = await c.req.json();
  if (!body.title) return error('title required');
  const task: Task = {
    id: uuid(), title: body.title, description: body.description ?? '',
    status: 'todo', priority: body.priority ?? 'medium',
    assigneeId: body.assigneeId, creatorId: auth.userId,
    dueDate: body.dueDate, tags: body.tags ?? [],
    createdAt: now(), updatedAt: now()
  };
  tasks.set(task.id, task);
  trackEvent('task_created', auth.userId, { taskId: task.id });
  return json(task, 201);
});

app.get('/api/business/tasks', async (c) => {
  const auth = await getAuth(c);
  if (!auth) return unauthorized();
  const status = c.req.query('status');
  let list = Array.from(tasks.values());
  if (status) list = list.filter(t => t.status === status);
  return json(list);
});

app.patch('/api/business/tasks/:id', async (c) => {
  const auth = await getAuth(c);
  if (!auth) return unauthorized();
  const task = tasks.get(c.req.param('id'));
  if (!task) return notFound();
  const body = await c.req.json();
  if (body.title) task.title = body.title;
  if (body.description) task.description = body.description;
  if (body.status) { task.status = body.status; if (body.status === 'done') task.completedAt = now(); }
  if (body.priority) task.priority = body.priority;
  if (body.assigneeId !== undefined) task.assigneeId = body.assigneeId;
  if (body.dueDate !== undefined) task.dueDate = body.dueDate;
  if (body.tags) task.tags = body.tags;
  task.updatedAt = now();
  trackEvent('task_updated', auth.userId, { taskId: task.id, status: task.status });
  return json(task);
});

app.get('/api/business/knowledge', async (c) => {
  const auth = await getAuth(c);
  if (!auth) return unauthorized();
  const query = c.req.query('q')?.toLowerCase();
  let entries = Array.from(knowledge.values());
  if (query) {
    entries = entries.filter(e => e.title.toLowerCase().includes(query) || e.content.toLowerCase().includes(query) || e.tags.some(t => t.toLowerCase().includes(query)));
  }
  return json(entries);
});

app.post('/api/business/knowledge', async (c) => {
  const auth = await getAuth(c);
  if (!auth) return unauthorized();
  const body = await c.req.json();
  if (!body.title || !body.content) return error('title and content required');
  const entry: KnowledgeEntry = {
    id: uuid(), title: body.title, content: body.content,
    category: body.category ?? 'general', tags: body.tags ?? [],
    createdBy: auth.userId, createdAt: now(), updatedAt: now(), accessCount: 0
  };
  knowledge.set(entry.id, entry);
  return json(entry, 201);
});

// ─── Analytics Routes ────────────────────────────────────────────────

app.get('/api/analytics/overview', async (c) => {
  const auth = await getAuth(c);
  if (!auth || auth.role !== 'admin') return auth ? forbidden() : unauthorized();
  const msgEvents = analytics.filter(e => e.type === 'message_sent');
  const today = now().split('T')[0];
  const todayMessages = msgEvents.filter(e => e.timestamp.startsWith(today!)).length;
  const activeUsers = new Set(analytics.filter(e => e.timestamp.startsWith(today!)).map(e => e.userId)).size;
  return json({
    totalMessages: msgEvents.length,
    messagesToday: todayMessages,
    totalUsers: users.size,
    activeUsersToday: activeUsers,
    totalConversations: conversations.size,
    totalTasks: tasks.length,
    tasksCompleted: Array.from(tasks.values()).filter(t => t.status === 'done').length
  });
});

app.get('/api/analytics/messages', async (c) => {
  const auth = await getAuth(c);
  if (!auth || auth.role !== 'admin') return auth ? forbidden() : unauthorized();
  const msgEvents = analytics.filter(e => e.type === 'message_sent');
  const byUser: Record<string, number> = {};
  msgEvents.forEach(e => { byUser[e.userId] = (byUser[e.userId] ?? 0) + 1; });
  return json({ total: msgEvents.length, byUser });
});

app.get('/api/analytics/users', async (c) => {
  const auth = await getAuth(c);
  if (!auth || auth.role !== 'admin') return auth ? forbidden() : unauthorized();
  const userList = Array.from(users.values()).map(u => ({
    id: u.id, name: u.name, role: u.role, isActive: u.isActive, lastActiveAt: u.lastActiveAt
  }));
  return json({ total: userList.length, users: userList });
});

app.get('/api/analytics/topics', async (c) => {
  const auth = await getAuth(c);
  if (!auth || auth.role !== 'admin') return auth ? forbidden() : unauthorized();
  const topicCounts: Record<string, number> = {};
  Array.from(conversations.values()).forEach(conv => {
    const words = conv.title.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    words.forEach(w => { topicCounts[w] = (topicCounts[w] ?? 0) + 1; });
  });
  const topics = Object.entries(topicCounts).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([topic, count]) => ({ topic, count }));
  return json({ topics, totalAnalyzed: conversations.size });
});

app.get('/api/analytics/export/:format', async (c) => {
  const auth = await getAuth(c);
  if (!auth || auth.role !== 'admin') return auth ? forbidden() : unauthorized();
  const format = c.req.param('format');
  const data = analytics.map(e => ({ id: e.id, type: e.type, userId: e.userId, timestamp: e.timestamp, ...e.data }));
  if (format === 'csv') {
    const headers = ['id', 'type', 'userId', 'timestamp'];
    const rows = data.map(d => headers.map(h => `"${(d as any)[h] ?? ''}"`).join(','));
    return new Response([headers.join(','), ...rows].join('\n'), { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename=analytics.csv' } });
  }
  return new Response(JSON.stringify(data, null, 2), { headers: { 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename=analytics.json' } });
});

// ─── Static Files ────────────────────────────────────────────────────

app.get('/', async (c) => {
  return c.html(await readFile('public/index.html'));
});

app.get('/app', async (c) => {
  return c.html(await readFile('public/app.html'));
});

async function readFile(path: string): Promise<string> {
  try {
    const fs = await import('fs');
    return fs.readFileSync(path, 'utf-8');
  } catch {
    return '<html><body><h1>businesslog.ai</h1><p>File not found. Run from project root.</p></body></html>';
  }
}

// ─── AI Response Generator ───────────────────────────────────────────

function generateAIResponse(input: string): string {
  const lower = input.toLowerCase();
  if (lower.includes('task') || lower.includes('todo')) {
    return 'I\'ve checked the task board. There are currently **12 active tasks** across 3 sprints:\n\n- 4 in progress\n- 5 in backlog\n- 3 completed this week\n\nWould you like me to show the breakdown by assignee or priority?';
  }
  if (lower.includes('report') || lower.includes('summary')) {
    return `Here\'s today\'s business summary:\n\n**Daily Report — ${new Date().toLocaleDateString()}**\n\n- Revenue today: **$47.2K**\n- New leads: **23**\n- Support tickets resolved: **15**\n- Active users: **${users.size}**\n\nEverything is on track. Would you like the weekly comparison?`;
  }
  if (lower.includes('meeting')) {
    return 'You have **3 meetings** scheduled today:\n\n1. **10:00 AM** — Sprint Planning (5 attendees)\n2. **2:00 PM** — Client Demo — Acme Corp\n3. **4:30 PM** — 1:1 with Maria\n\nShall I prepare briefing notes for any of these?';
  }
  if (lower.includes('revenue') || lower.includes('sales')) {
    return 'Current revenue metrics:\n\n**MTD Revenue:** $387K (target: $450K)\n**Pipeline:** $2.1M in active opportunities\n**Win Rate:** 34% (up from 28% last quarter)\n\nTop performing product: **Enterprise Plan** at $285K MTD.';
  }
  if (lower.includes('help') || lower.includes('what can')) {
    return 'I can help with:\n\n- **Reports** — Daily, weekly, and monthly summaries\n- **Tasks** — Create, track, and manage team tasks\n- **Analytics** — Message volume, user activity, topics\n- **Meetings** — Summaries and action items\n- **Knowledge** — Search and manage company knowledge base\n- **Revenue** — Sales pipeline and financial data\n\nJust ask me anything about your business data!';
  }
  return 'I\'ve processed your request. Based on the available data, the team has been making great progress. All systems are operational and metrics are trending positively.\n\nWould you like me to dive deeper into any specific area?';
}

// ─── Export for Workers / Node ───────────────────────────────────────

export default {
  fetch: app.fetch,
};

// Standalone Node.js server
if (typeof process !== 'undefined' && typeof process.env !== 'undefined' && !process.env.CF_PAGES) {
  (async () => {
    try {
      const { serve } = await import('@hono/node-server');
      const port = parseInt(process.env.PORT ?? '3000', 10);
      serve({ fetch: app.fetch, port }, () => {
        console.info(`[businesslog] Server running on http://localhost:${port}`);
      });
    } catch {
      // Running in Cloudflare Workers — no Node.js server needed
    }
  })();
}
