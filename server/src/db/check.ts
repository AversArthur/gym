// npm run db:check — печатает содержимое программы, чтобы глазами сверить с прототипом
import { asc, eq } from 'drizzle-orm';
import { openDb } from './client.js';
import { seedIfEmpty } from './seed.js';
import { exercises, programDays, programItems, programs } from './schema.js';

const db = openDb();
seedIfEmpty(db);

const ex = db.select().from(exercises).all();
console.log(`Упражнений: ${ex.length}`);
const [program] = db.select().from(programs).where(eq(programs.isActive, true)).all();
console.log(`Активная программа: ${program?.name}\n`);

for (const day of db.select().from(programDays).orderBy(asc(programDays.position)).all()) {
  console.log(`${day.code} · ${day.title} — ${day.subtitle}`);
  const items = db
    .select()
    .from(programItems)
    .innerJoin(exercises, eq(programItems.exerciseId, exercises.id))
    .where(eq(programItems.dayId, day.id))
    .orderBy(asc(programItems.position))
    .all();
  for (const { program_items: it, exercises: e } of items) {
    const reps =
      it.repMin == null
        ? 'макс'
        : it.repMin === it.repMax
          ? `${it.repMin}`
          : `${it.repMin}–${it.repMax}`;
    const ss = it.supersetGroup ? ` [суперсет ${it.supersetGroup}]` : '';
    console.log(
      `  ${e.nameRu.padEnd(28)} ${it.sets} × ${reps}${it.unit === 'sec' ? ' с' : ''}`.padEnd(48) +
        `отдых ${it.restSec} с, шаг ${it.weightStep} кг, ${e.weightMode}${ss}`,
    );
  }
  console.log();
}
