import { jsonb, pgTable, text, timestamp, boolean, bigserial } from 'drizzle-orm/pg-core'

export const tickets = pgTable('tickets', {
  id: text('id').primaryKey(),
  subject: text('subject').notNull(),
  customer: text('customer').notNull(),
  customerEmail: text('customer_email'),
  originalMessage: text('original_message').notNull(),
  category: text('category').notNull(),
  tags: jsonb('tags').notNull().default([]),
  priority: text('priority').notNull(),
  riskLevel: text('risk_level').notNull(),
  status: text('status').notNull(),
  channel: text('channel').notNull(),
  team: text('team').notNull().default('Human Support'),
  assignee: text('assignee'),
  isDemo: boolean('is_demo').notNull().default(false),
  aiAnalysis: jsonb('ai_analysis'),
  resolutionSummary: text('resolution_summary'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const ticketEvents = pgTable('ticket_events', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  ticketId: text('ticket_id').notNull(),
  eventType: text('event_type').notNull(),
  actor: text('actor').notNull(),
  visibility: text('visibility').notNull().default('internal'),
  body: text('body'),
  metadata: jsonb('metadata').notNull().default({}),
  idempotencyKey: text('idempotency_key'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const supportAgents = pgTable('support_agents', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  team: text('team').notNull(),
  skills: jsonb('skills').notNull().default([]),
  availability: text('availability').notNull().default('available'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
