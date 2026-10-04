// Онлайн-бэкап SQLite (тот же механизм, что sqlite3 .backup): node server/dist/cli/backup.js
// Пишет BACKUP_DIR/gym-YYYY-MM-DD.db, хранит последние BACKUP_KEEP (30).
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { DEFAULT_DB_PATH } from '../db/client.js';

const src = process.env.DATABASE_PATH ?? DEFAULT_DB_PATH;
const dir =
  process.env.BACKUP_DIR ?? resolve(dirname(fileURLToPath(import.meta.url)), '../../../backups');
const keep = Number(process.env.BACKUP_KEEP ?? 30);

mkdirSync(dir, { recursive: true });
const name = `gym-${new Date().toISOString().slice(0, 10)}.db`;
const dest = join(dir, name);
const db = new Database(src, { readonly: true, fileMustExist: true });
await db.backup(dest);
db.close();

// Копия наследует WAL-режим; переводим в обычный, чтобы бэкап был одним файлом без -wal/-shm
const check = new Database(dest);
check.pragma('journal_mode = DELETE');
const integrity = check.pragma('integrity_check', { simple: true });
const workouts = check.prepare('select count(*) n from workouts').get() as { n: number };
check.close();
if (integrity !== 'ok') {
  console.error(`Бэкап ${dest} повреждён: ${integrity}`);
  process.exit(1);
}

const old = readdirSync(dir)
  .filter((f) => /^gym-\d{4}-\d{2}-\d{2}\.db$/.test(f))
  .sort()
  .reverse()
  .slice(keep);
old.forEach((f) => rmSync(join(dir, f)));
console.log(
  `${new Date().toISOString()} бэкап ${name}: ${workouts.n} тренировок, удалено старых: ${old.length}`,
);
