import { integer, sqliteTable, text, index } from 'drizzle-orm/sqlite-core'

export const trips = sqliteTable('trips', {
  id: text('id').primaryKey(), ownerId: text('owner_id').notNull(), inputJson: text('input_json').notNull(),
  resultJson: text('result_json'), status: text('status').notNull().default('draft'),
  revision: integer('revision').notNull().default(1), createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(),
}, (table) => [index('trips_owner_updated').on(table.ownerId, table.updatedAt)])
export const aiRequests = sqliteTable('ai_requests', {
  id: text('id').primaryKey(), ownerId: text('owner_id').notNull(), tripId: text('trip_id').notNull(),
  revision: integer('revision').notNull(), startedAt: integer('started_at').notNull(), status: text('status').notNull().default('pending'),
}, (table) => [index('requests_owner_time').on(table.ownerId, table.startedAt), index('requests_time').on(table.startedAt)])
