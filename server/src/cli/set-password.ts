// Задать пароль пользователю: node server/dist/cli/set-password.js [username]
// В Docker: docker compose exec app node server/dist/cli/set-password.js arthur
// Пароль читается из терминала без эха (или из stdin, если он не терминал). Старые сессии закрываются.
import { createInterface } from 'node:readline';
import { createAuth } from '../auth.js';
import { openDb } from '../db/client.js';
import { seedIfEmpty } from '../db/seed.js';

async function ask(prompt: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: process.stdin.isTTY,
  });
  if (process.stdin.isTTY) {
    // Скрываем ввод: вместо символов ничего не печатаем
    const out = rl as unknown as {
      _writeToOutput: (s: string) => void;
      output: NodeJS.WriteStream;
    };
    out._writeToOutput = (s: string) => {
      if (s.includes(prompt)) out.output.write(prompt);
    };
  }
  const answer = await new Promise<string>((res) => rl.question(prompt, res));
  rl.close();
  if (process.stdin.isTTY) process.stdout.write('\n');
  return answer;
}

const username = process.argv[2] ?? 'arthur';
const db = openDb();
seedIfEmpty(db);
const pass = await ask(`Новый пароль для ${username}: `);
if (pass.length < 8) {
  console.error('Пароль короче 8 символов — не меняю.');
  process.exit(1);
}
if (process.stdin.isTTY) {
  const again = await ask('Ещё раз: ');
  if (again !== pass) {
    console.error('Пароли не совпали.');
    process.exit(1);
  }
}
await createAuth(db).setPassword(username, pass);
console.log(`Готово: пароль для ${username} задан, старые сессии закрыты.`);
