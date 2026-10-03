import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { DAY_CODES, EQUIPMENT, REP_UNITS, ROLES, WEIGHT_MODES } from '@gym/shared';

const createdAt = () =>
  integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`);

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  // null, пока вход не настроен (фаза 9)
  passwordHash: text('password_hash'),
  displayName: text('display_name').notNull(),
  role: text('role', { enum: ROLES }).notNull().default('user'),
  disabled: integer('disabled', { mode: 'boolean' }).notNull().default(false),
  createdAt: createdAt(),
});

export const sessions = sqliteTable(
  'sessions',
  {
    // sha256 от токена из cookie; сам токен в БД не храним
    id: text('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    userAgent: text('user_agent'),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

export const exercises = sqliteTable(
  'exercises',
  {
    id: text('id').primaryKey(),
    // null = общее упражнение из сида
    ownerId: integer('owner_id').references(() => users.id, { onDelete: 'cascade' }),
    nameRu: text('name_ru').notNull(),
    nameEn: text('name_en'),
    equipment: text('equipment', { enum: EQUIPMENT }).notNull(),
    muscle: text('muscle'),
    cues: text('cues', { mode: 'json' }).$type<string[]>().notNull().default([]),
    animKey: text('anim_key'),
    weightMode: text('weight_mode', { enum: WEIGHT_MODES }).notNull(),
    archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [index('exercises_owner_idx').on(t.ownerId)],
);

export const programs = sqliteTable(
  'programs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index('programs_user_idx').on(t.userId)],
);

export const programDays = sqliteTable(
  'program_days',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    programId: integer('program_id')
      .notNull()
      .references(() => programs.id, { onDelete: 'cascade' }),
    code: text('code', { enum: DAY_CODES }).notNull(),
    title: text('title').notNull(),
    subtitle: text('subtitle'),
    position: integer('position').notNull(),
  },
  (t) => [uniqueIndex('program_days_code_uq').on(t.programId, t.code)],
);

export const programItems = sqliteTable(
  'program_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    dayId: integer('day_id')
      .notNull()
      .references(() => programDays.id, { onDelete: 'cascade' }),
    exerciseId: text('exercise_id')
      .notNull()
      .references(() => exercises.id),
    position: integer('position').notNull(),
    sets: integer('sets').notNull(),
    // оба null = «макс»
    repMin: integer('rep_min'),
    repMax: integer('rep_max'),
    unit: text('unit', { enum: REP_UNITS }).notNull().default('reps'),
    // одинаковое число в пределах дня = суперсет
    supersetGroup: integer('superset_group'),
    // отдых после этого упражнения; у первого в суперсете 0
    restSec: integer('rest_sec').notNull(),
    weightStep: real('weight_step').notNull(),
  },
  (t) => [index('program_items_day_idx').on(t.dayId, t.position)],
);

export const workouts = sqliteTable(
  'workouts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // set null: удаление дня из программы не стирает историю
    programDayId: integer('program_day_id').references(() => programDays.id, {
      onDelete: 'set null',
    }),
    // буква дня на момент тренировки, чтобы история читалась без программы
    dayCode: text('day_code', { enum: DAY_CODES }),
    clientId: text('client_id').unique(),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
    finishedAt: integer('finished_at', { mode: 'timestamp_ms' }),
    notes: text('notes'),
    bodyweightKg: real('bodyweight_kg'),
  },
  (t) => [index('workouts_user_started_idx').on(t.userId, t.startedAt)],
);

export const workoutSets = sqliteTable(
  'workout_sets',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    workoutId: integer('workout_id')
      .notNull()
      .references(() => workouts.id, { onDelete: 'cascade' }),
    exerciseId: text('exercise_id')
      .notNull()
      .references(() => exercises.id),
    setIndex: integer('set_index').notNull(),
    weight: real('weight'),
    reps: integer('reps'),
    durationSec: integer('duration_sec'),
    rir: integer('rir'),
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }).notNull(),
    // uuid с клиента для идемпотентной офлайн-синхронизации
    clientId: text('client_id').notNull().unique(),
  },
  (t) => [
    index('workout_sets_workout_idx').on(t.workoutId),
    index('workout_sets_exercise_idx').on(t.exerciseId, t.completedAt),
  ],
);

export const bodyweightLog = sqliteTable(
  'bodyweight_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    date: text('date').notNull(), // YYYY-MM-DD
    kg: real('kg').notNull(),
  },
  (t) => [uniqueIndex('bodyweight_user_date_uq').on(t.userId, t.date)],
);
