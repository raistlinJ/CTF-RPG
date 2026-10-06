import {
  integer,
  sqliteTable,
  text,
  primaryKey,
} from "drizzle-orm/sqlite-core";
export const students = sqliteTable("students", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  hash: text("hash").notNull(),
  salt: text("salt").notNull(),
  hero: text("hero").notNull(),
  role: text("role").notNull().default("student"),
  disabled: integer("disabled").notNull().default(0),
  managed: integer("managed").notNull().default(0),
  provisioned: integer("provisioned").notNull().default(0),
  revision: integer("revision").notNull().default(0),
});
export const sessions = sqliteTable("sessions", {
  token: text("token").primaryKey(),
  user: text("user")
    .notNull()
    .references(() => students.id),
  expires: integer("expires").notNull(),
});
export const solved = sqliteTable(
  "solved",
  {
    user: text("user")
      .notNull()
      .references(() => students.id),
    challenge: text("challenge").notNull(),
    points: integer("points").notNull(),
  },
  (t) => [primaryKey({ columns: [t.user, t.challenge] })],
);

export const purchasedHints = sqliteTable(
  "purchased_hints",
  {
    user: text("user")
      .notNull()
      .references(() => students.id),
    challenge: text("challenge").notNull(),
    hint: text("hint").notNull(),
    cost: integer("cost").notNull(),
  },
  (t) => [primaryKey({ columns: [t.user, t.challenge, t.hint] })],
);

export const challengeCatalog = sqliteTable("challenge_catalog", {
  id: text("id").primaryKey(),
  payload: text("payload").notNull(),
  revision: integer("revision").notNull(),
});
