import { integer, sqliteTable, text, primaryKey } from 'drizzle-orm/sqlite-core';
export const students = sqliteTable('students', { id:text('id').primaryKey(), username:text('username').notNull().unique(), hash:text('hash').notNull(), salt:text('salt').notNull(), hero:text('hero').notNull() });
export const sessions = sqliteTable('sessions', { token:text('token').primaryKey(), user:text('user').notNull().references(()=>students.id), expires:integer('expires').notNull() });
export const solved = sqliteTable('solved', { user:text('user').notNull().references(()=>students.id), challenge:text('challenge').notNull(), points:integer('points').notNull() }, t=>[primaryKey({columns:[t.user,t.challenge]})]);
