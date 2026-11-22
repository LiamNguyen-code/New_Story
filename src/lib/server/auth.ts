// Đăng nhập email + mật khẩu: mật khẩu băm scrypt, phiên lưu trong bảng sessions, cookie httpOnly.
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { eq, lt } from 'drizzle-orm';
import { db, schema } from './db';

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const SESSION_COOKIE = 'story_session';
const SESSION_DAYS = 30;

export type User = Pick<typeof schema.users.$inferSelect, 'id' | 'email' | 'name' | 'role'>;

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [algo, salt, hash] = stored.split('$');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scryptAsync(password, Buffer.from(salt, 'base64'), expected.length);
  return timingSafeEqual(actual, expected);
}

export function validatePassword(password: string) {
  if (password.length < 8) return 'Mật khẩu cần ít nhất 8 ký tự.';
  return null;
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

const tokenId = (token: string) => createHash('sha256').update(token).digest('hex');

/** Kiểm tra email + mật khẩu. Trả về user nếu đúng. */
export async function checkLogin(email: string, password: string): Promise<User | null> {
  const user = db.select().from(schema.users).where(eq(schema.users.email, normalizeEmail(email))).get();
  // Vẫn băm khi không có user để thời gian phản hồi giống nhau (không lộ email nào tồn tại)
  const ok = await verifyPassword(password, user?.passwordHash ?? 'scrypt$AAAAAAAAAAAAAAAAAAAAAA==$' + 'A'.repeat(86) + '==');
  return user && ok ? { id: user.id, email: user.email, name: user.name, role: user.role } : null;
}

/** Tạo phiên mới, trả về token để đặt vào cookie. */
export function createSession(userId: number) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, new Date())).run();
  db.insert(schema.sessions).values({ id: tokenId(token), userId, expiresAt }).run();
  return { token, expiresAt };
}

export function getSessionUser(token: string | undefined): User | null {
  if (!token) return null;
  const row = db
    .select({ id: schema.users.id, email: schema.users.email, name: schema.users.name, role: schema.users.role, expiresAt: schema.sessions.expiresAt })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(eq(schema.sessions.id, tokenId(token)))
    .get();
  if (!row || row.expiresAt.getTime() < Date.now()) return null;
  const { expiresAt: _, ...user } = row;
  return user;
}

export function deleteSession(token: string | undefined) {
  if (token) db.delete(schema.sessions).where(eq(schema.sessions.id, tokenId(token))).run();
}

export function deleteUserSessions(userId: number) {
  db.delete(schema.sessions).where(eq(schema.sessions.userId, userId)).run();
}
