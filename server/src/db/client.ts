import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema.js';

const here = dirname(fileURLToPath(import.meta.url));
// И из server/src/db, и из server/dist/db два уровня вверх — это server/
const SERVER_ROOT = resolve(here, '../..');
export const MIGRATIONS_DIR = resolve(SERVER_ROOT, 'drizzle');
export const DEFAULT_DB_PATH = resolve(SERVER_ROOT, '../data/gym.db');

export type DB = ReturnType<typeof openDb>;

export function openDb(path = process.env.DATABASE_PATH ?? DEFAULT_DB_PATH) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  return db;
}
