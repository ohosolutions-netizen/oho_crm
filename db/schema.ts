import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
export const roles = sqliteTable('roles', { id: text('id').primaryKey(), name: text('name').notNull(), parentId: text('parent_id') });
export const profiles = sqliteTable('profiles', { id: text('id').primaryKey(), name: text('name').notNull(), permissions: text('permissions').notNull() });
export const users = sqliteTable('users', {
  id: text('id').primaryKey(), email: text('email').notNull(), name: text('name').notNull(), authId: text('auth_id'),
  roleId: text('role_id').notNull().references(() => roles.id), profileId: text('profile_id').notNull().references(() => profiles.id),
  active: integer('active').notNull().default(1),
}, (t) => [uniqueIndex('user_email_unique').on(t.email), uniqueIndex('user_auth_unique').on(t.authId)]);
export const records = sqliteTable('records', {
  id: text('id').primaryKey(), module: text('module').notNull(), title: text('title').notNull(),
  ownerId: text('owner_id').notNull().references(() => users.id), companyId: text('company_id'), data: text('data').notNull(),
  createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(),
});
export const audit = sqliteTable('audit', {
  id: text('id').primaryKey(), actorId: text('actor_id').notNull(), action: text('action').notNull(),
  target: text('target').notNull(), details: text('details').notNull(), createdAt: text('created_at').notNull(),
});
export const settings = sqliteTable('settings', { key: text('key').primaryKey(), value: text('value').notNull() });
