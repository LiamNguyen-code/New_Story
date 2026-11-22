// Tạo tài khoản quản trị (dùng cho tài khoản admin đầu tiên, hoặc khi quên mật khẩu admin).
// Dùng: npm run user:create -- <email> <mật khẩu> [tên] [--editor]
//   Email đã có → đặt lại mật khẩu cho tài khoản đó.
import { eq } from 'drizzle-orm';
import { hashPassword, normalizeEmail, validatePassword } from '../src/lib/server/auth';
import { db, schema } from '../src/lib/server/db';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const role = process.argv.includes('--editor') ? 'editor' : 'admin';
const [rawEmail, password, name = ''] = args;

if (!rawEmail || !password) {
  console.error('Dùng: npm run user:create -- <email> <mật khẩu> [tên] [--editor]');
  process.exit(1);
}
const pwError = validatePassword(password);
if (pwError) {
  console.error(pwError);
  process.exit(1);
}

const email = normalizeEmail(rawEmail);
const passwordHash = await hashPassword(password);
const existing = db.select().from(schema.users).where(eq(schema.users.email, email)).get();

if (existing) {
  db.update(schema.users).set({ passwordHash, updatedAt: new Date() }).where(eq(schema.users.id, existing.id)).run();
  db.delete(schema.sessions).where(eq(schema.sessions.userId, existing.id)).run();
  console.log(`✓ Đã đặt lại mật khẩu cho ${email}`);
} else {
  db.insert(schema.users).values({ email, name, role, passwordHash }).run();
  console.log(`✓ Đã tạo tài khoản ${role} ${email}`);
}
