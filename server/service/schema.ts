import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const groups = sqliteTable('groups', {
  name: text('name').primaryKey(),
  id: text('id').notNull().unique(),
  location: text('location').notNull(),
  tokenVersion: integer('token_version').notNull().default(0),
  deleteProtection: integer('delete_protection', { mode: 'boolean' }).notNull().default(false),
});
export const databases = sqliteTable('databases', {
  name: text('name').primaryKey(),
  id: text('id').notNull().unique(),
  group: text('group_name')
    .notNull()
    .references(() => groups.name),
  tokenVersion: integer('token_version').notNull().default(0),
  blockReads: integer('block_reads', { mode: 'boolean' }).notNull().default(false),
  blockWrites: integer('block_writes', { mode: 'boolean' }).notNull().default(false),
  deleteProtection: integer('delete_protection', { mode: 'boolean' }).notNull().default(false),
  parentId: text('parent_id'),
  parentName: text('parent_name'),
  branchedAt: text('branched_at'),
});
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
export type DatabaseRecord = typeof databases.$inferSelect;
export type GroupRecord = typeof groups.$inferSelect;
