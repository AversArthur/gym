import { beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { buildApp } from './app.js';
import { createAuth, SESSION_COOKIE } from './auth.js';
import { openDb, type DB } from './db/client.js';
import { sessions, users } from './db/schema.js';
import { seedIfEmpty } from './db/seed.js';

let db: DB;
let app: FastifyInstance;
const PASS = 'correct horse battery';

beforeEach(async () => {
  db = openDb(':memory:');
  seedIfEmpty(db);
  await createAuth(db).setPassword('arthur', PASS);
  app = await buildApp({ db, cookieSecure: true });
});

const login = (password = PASS, username = 'arthur', headers: Record<string, string> = {}) =>
  app.inject({ method: 'POST', url: '/api/login', payload: { username, password }, headers });

const cookieOf = (res: { cookies: { name: string; value: string }[] }) =>
  res.cookies.find((c) => c.name === SESSION_COOKIE)?.value;

describe('вход', () => {
  it('без сессии API закрыт, health открыт', async () => {
    expect((await app.inject({ url: '/api/program/active' })).statusCode).toBe(401);
    expect((await app.inject({ url: '/api/health' })).statusCode).toBe(200);
  });

  it('неверный пароль и несуществующий пользователь — 401 без cookie', async () => {
    const a = await login('wrong');
    const b = await login(PASS, 'nobody');
    expect([a.statusCode, b.statusCode]).toEqual([401, 401]);
    expect(cookieOf(a)).toBeUndefined();
  });

  it('успешный вход: httpOnly secure cookie на 90 дней, дальше API доступен', async () => {
    const res = await login(PASS, '  Arthur ');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ username: 'arthur', role: 'admin' });
    const c = res.cookies.find((x) => x.name === SESSION_COOKIE)!;
    expect(c).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax', path: '/' });
    expect(c.maxAge).toBe(90 * 86400);
    const cookies = { [SESSION_COOKIE]: c.value };
    expect((await app.inject({ url: '/api/program/active', cookies })).statusCode).toBe(200);
    expect((await app.inject({ url: '/api/me', cookies })).json()).toMatchObject({
      username: 'arthur',
    });
    // В БД лежит хеш, а не сам токен
    expect(db.select().from(sessions).all()[0]!.id).not.toBe(c.value);
  });

  it('выход закрывает сессию', async () => {
    const token = cookieOf(await login())!;
    const cookies = { [SESSION_COOKIE]: token };
    expect((await app.inject({ method: 'POST', url: '/api/logout', cookies })).statusCode).toBe(
      204,
    );
    expect((await app.inject({ url: '/api/me', cookies })).statusCode).toBe(401);
  });

  it('лимит: 5 попыток в минуту, шестая — 429', async () => {
    const codes = [];
    for (let i = 0; i < 6; i++) codes.push((await login('wrong')).statusCode);
    expect(codes).toEqual([401, 401, 401, 401, 401, 429]);
  });

  it('чужой Origin на изменяющий запрос — 403, свой — пропускается', async () => {
    const token = cookieOf(await login())!;
    const cookies = { [SESSION_COOKIE]: token };
    const body = { date: '2026-10-04', kg: 74 };
    const evil = await app.inject({
      method: 'POST',
      url: '/api/bodyweight',
      payload: body,
      cookies,
      headers: { origin: 'https://evil.example', host: 'gym.example' },
    });
    const nul = await app.inject({
      method: 'POST',
      url: '/api/bodyweight',
      payload: body,
      cookies,
      headers: { origin: 'null', host: 'gym.example' },
    });
    const own = await app.inject({
      method: 'POST',
      url: '/api/bodyweight',
      payload: body,
      cookies,
      headers: { origin: 'https://gym.example', host: 'gym.example' },
    });
    expect([evil.statusCode, nul.statusCode, own.statusCode]).toEqual([403, 403, 200]);
  });

  it('сессия продлевается, если до конца меньше 60 дней', async () => {
    const token = cookieOf(await login())!;
    db.update(sessions)
      .set({ expiresAt: new Date(Date.now() + 10 * 86_400_000) })
      .run();
    const res = await app.inject({ url: '/api/me', cookies: { [SESSION_COOKIE]: token } });
    expect(cookieOf(res)).toBe(token);
    expect(db.select().from(sessions).get()!.expiresAt.getTime()).toBeGreaterThan(
      Date.now() + 89 * 86_400_000,
    );
  });

  it('протухшая сессия и отключённый пользователь не проходят', async () => {
    const token = cookieOf(await login())!;
    db.update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .run();
    expect(
      (await app.inject({ url: '/api/me', cookies: { [SESSION_COOKIE]: token } })).statusCode,
    ).toBe(401);
    db.update(users).set({ disabled: true }).where(eq(users.username, 'arthur')).run();
    expect((await login()).statusCode).toBe(401);
  });

  it('смена пароля закрывает все сессии', async () => {
    const token = cookieOf(await login())!;
    await createAuth(db).setPassword('arthur', 'new password 123');
    expect(
      (await app.inject({ url: '/api/me', cookies: { [SESSION_COOKIE]: token } })).statusCode,
    ).toBe(401);
    expect((await login('new password 123')).statusCode).toBe(200);
  });
});
