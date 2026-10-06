import {
  integer,
  sqliteTable,
  text,
  primaryKey,
  index,
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

export const teams = sqliteTable("teams", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  nameKey: text("name_key").notNull().unique(),
  hash: text("hash").notNull(),
  salt: text("salt").notNull(),
});
export const teamMembers = sqliteTable(
  "team_members",
  {
    user: text("user")
      .primaryKey()
      .references(() => students.id),
    team: text("team")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
  },
  (t) => [index("idx_team_members_team").on(t.team)],
);
export const teamSettings = sqliteTable("team_settings", {
  id: text("id").primaryKey(),
  maxMembers: integer("max_members").notNull(),
});

export const themeCatalog = sqliteTable("theme_catalog", {
  id: text("id").primaryKey(),
  payload: text("payload").notNull(),
  revision: integer("revision").notNull(),
});

export const writtenResponses = sqliteTable(
  "written_responses",
  {
    user: text("user")
      .notNull()
      .references(() => students.id),
    challenge: text("challenge").notNull(),
    answer: text("answer").notNull(),
    question: text("question").notNull(),
    object: text("object").notNull(),
    maxPoints: integer("max_points").notNull(),
    hintCost: integer("hint_cost").notNull(),
    submittedAt: integer("submitted_at").notNull(),
    revision: integer("revision").notNull().default(1),
    grade: integer("grade"),
    feedback: text("feedback").notNull().default(""),
    reviewer: text("reviewer"),
    gradedAt: integer("graded_at"),
  },
  (t) => [primaryKey({ columns: [t.user, t.challenge] })],
);
