// Вход по паролю и сессии. Токен живёт только в httpOnly cookie, в БД — его sha256.
import { createHash, randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { and, eq, gt, lt } from 'drizzle-orm';
import type { DB } from './db/client.js';
import { sessions, users } from './db/schema.js';

export const SESSION_COOKIE = 'gym_session';
export const SESSION_TTL_MS = 90 * 86_400_000;
/** Сессию продлеваем, когда до конца осталось меньше этого: заходишь хотя бы раз в 2 месяца — не разлогинит. */
const RENEW_BEFORE_MS = 60 * 86_400_000;

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

// Хеш-пустышка: проверка пароля несуществующего пользователя занимает столько же времени
let dummyHash: Promise<string> | null = null;

export interface SessionUser {
  id: number;
  username: string;
  displayName: string;
  role: 'admin' | 'user';
}

export function createAuth(db: DB) {
  async function login(username: string, password: string, userAgent?: string) {
    const user = db
      .select()
      .from(users)
      .where(eq(users.username, username.trim().toLowerCase()))
      .get();
    dummyHash ??= hash('dummy-password-for-timing');
    const ok = await verify(user?.passwordHash ?? (await dummyHash), password).catch(() => false);
    if (!user || !user.passwordHash || user.disabled || !ok) return null;
    const token = randomBytes(32).toString('base64url');
    db.insert(sessions)
      .values({
        id: sha256(token),
        userId: user.id,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
        userAgent: userAgent?.slice(0, 200) ?? null,
      })
      .run();
    // Заодно чистим протухшие сессии
    db.delete(sessions).where(lt(sessions.expiresAt, new Date())).run();
    return { token, user: toSessionUser(user) };
  }

  /** Пользователь по токену; renewed=true — срок продлён, cookie нужно выставить заново. */
  function resolve(token: string | undefined): { user: SessionUser; renewed: boolean } | null {
    if (!token) return null;
    const id = sha256(token);
    const row = db
      .select({ s: sessions, u: users })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())))
      .get();
    if (!row || row.u.disabled) return null;
    let renewed = false;
    if (row.s.expiresAt.getTime() - Date.now() < RENEW_BEFORE_MS) {
      db.update(sessions)
        .set({ expiresAt: new Date(Date.now() + SESSION_TTL_MS) })
        .where(eq(sessions.id, id))
        .run();
      renewed = true;
    }
    return { user: toSessionUser(row.u), renewed };
  }

  function logout(token: string | undefined) {
    if (token)
      db.delete(sessions)
        .where(eq(sessions.id, sha256(token)))
        .run();
  }

  /** Задать пароль; все старые сессии пользователя закрываются. */
  async function setPassword(username: string, password: string) {
    const user = db.select().from(users).where(eq(users.username, username)).get();
    if (!user) throw new Error(`Пользователь ${username} не найден`);
    db.update(users)
      .set({ passwordHash: await hash(password) })
      .where(eq(users.id, user.id))
      .run();
    db.delete(sessions).where(eq(sessions.userId, user.id)).run();
  }

  return { login, resolve, logout, setPassword };
}
export type Auth = ReturnType<typeof createAuth>;

function toSessionUser(u: typeof users.$inferSelect): SessionUser {
  return { id: u.id, username: u.username, displayName: u.displayName, role: u.role };
}
