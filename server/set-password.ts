/** Установка пароля админки: npm run set-password  (или npm run set-password -- "мойПароль") */
import { createInterface } from 'node:readline/promises';
import { setPassword, MIN_PASSWORD } from './auth.ts';

let pw = process.argv[2];
if (!pw) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  pw = await rl.question(`Новый пароль админки (не короче ${MIN_PASSWORD} символов): `);
  rl.close();
}
try {
  setPassword(pw.trim());
  console.log('Пароль сохранён в data/auth.json (в виде хэша). Можно входить в админку.');
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
