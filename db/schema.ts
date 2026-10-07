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
  spawn: text("spawn"),
  role: text("role").notNull().default("student"),
  muted: integer("muted").notNull().default(0),
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
    submittedTeam: text("submitted_team"),
    revision: integer("revision").notNull().default(1),
    grade: integer("grade"),
    feedback: text("feedback").notNull().default(""),
    reviewer: text("reviewer"),
    gradedAt: integer("graded_at"),
  },
  (t) => [primaryKey({ columns: [t.user, t.challenge] })],
);

export const playerPresence = sqliteTable(
  "player_presence",
  {
    user: text("user")
      .primaryKey()
      .references(() => students.id, { onDelete: "cascade" }),
    map: text("map").notNull(),
    x: integer("x").notNull(),
    y: integer("y").notNull(),
    themeRevision: integer("theme_revision").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    index("idx_player_presence_map_revision_updated").on(
      t.map,
      t.themeRevision,
      t.updatedAt,
    ),
  ],
);
export const presenceSettings = sqliteTable("presence_settings", {
  id: text("id").primaryKey(),
  visibility: text("visibility").notNull(),
  revision: integer("revision").notNull(),
});

export const teamSocialSettings = sqliteTable("team_social_settings", {
  everyoneNames: integer("everyone_names"),
  everyoneScores: integer("everyone_scores"),
  everyoneMessaging: integer("everyone_messaging"),
  id: text("id").primaryKey(),
  names: integer("names").notNull(),
  scores: integer("scores").notNull(),
  messaging: integer("messaging").notNull(),
  revision: integer("revision").notNull(),
});
export const teamMessages = sqliteTable(
  "team_messages",
  {
    id: text("id").primaryKey(),
    senderUser: text("sender_user").references(() => students.id),
    senderTeam: text("sender_team").references(() => teams.id, {
      onDelete: "cascade",
    }),
    recipientTeam: text("recipient_team")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    sender: text("sender").notNull(),
    text: text("text").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    index("idx_team_messages_recipient_created").on(
      t.recipientTeam,
      t.createdAt,
    ),
    index("idx_team_messages_sender_team_created").on(
      t.senderTeam,
      t.createdAt,
    ),
    index("idx_team_messages_sender_user_created").on(
      t.senderUser,
      t.createdAt,
    ),
  ],
);

export const scoreboardSettings = sqliteTable("scoreboard_settings", {
  id: text("id").primaryKey(),
  visibility: text("visibility").notNull(),
  mode: text("mode").notNull(),
  revision: integer("revision").notNull(),
});
export const instructorMessages = sqliteTable(
  "instructor_messages",
  {
    id: text("id").primaryKey(),
    senderUser: text("sender_user")
      .notNull()
      .references(() => students.id),
    team: text("team")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    sender: text("sender").notNull(),
    text: text("text").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    index("idx_instructor_messages_team_created").on(t.team, t.createdAt),
    index("idx_instructor_messages_sender_created").on(
      t.senderUser,
      t.createdAt,
    ),
  ],
);

export const discoveredChallenges = sqliteTable(
  "discovered_challenges",
  {
    user: text("user")
      .notNull()
      .references(() => students.id),
    challenge: text("challenge").notNull(),
  },
  (t) => [primaryKey({ columns: [t.user, t.challenge] })],
);

export const challengeSettings = sqliteTable("challenge_settings", {
  id: text("id").primaryKey(), visibility: text("visibility").notNull(), revision: integer("revision").notNull(),
});

export const answerAttempts = sqliteTable("answer_attempts", {
 id:text("id").primaryKey(), user:text("user").notNull().references(()=>students.id), challenge:text("challenge").notNull(), answer:text("answer").notNull(), question:text("question").notNull(), object:text("object").notNull(), correct:integer("correct").notNull(), submittedTeam:text("submitted_team").notNull(), submittedAt:integer("submitted_at").notNull(),
}, t=>[index("idx_answer_attempts_submitted").on(t.submittedAt),index("idx_answer_attempts_correct_submitted").on(t.correct,t.submittedAt)]);

export const notifications = sqliteTable("notifications", {id:text("id").primaryKey(),title:text("title").notNull(),body:text("body").notNull(),author:text("author").notNull(),scope:text("scope").notNull(),targets:text("targets").notNull(),createdAt:integer("created_at").notNull()});
export const notificationRecipients = sqliteTable("notification_recipients", {notification:text("notification").notNull().references(()=>notifications.id),username:text("username").notNull()},t=>[primaryKey({columns:[t.notification,t.username]}),index("idx_notification_recipient_username").on(t.username)]);
export const notificationReads = sqliteTable("notification_reads", {notification:text("notification").notNull().references(()=>notifications.id),user:text("user").notNull().references(()=>students.id),readAt:integer("read_at").notNull()},t=>[primaryKey({columns:[t.notification,t.user]})]);
export const ctfdImports = sqliteTable("ctfd_imports", {id:text("id").primaryKey(),digest:text("digest").notNull().unique(),createdAt:integer("created_at").notNull(),report:text("report").notNull()});
