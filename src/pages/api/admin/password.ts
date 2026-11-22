// POST: tự đổi mật khẩu { current, password }
import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { hashPassword, validatePassword, verifyPassword } from '../../../lib/server/auth';
import { db, schema } from '../../../lib/server/db';
import { bad, handle, ok } from '../../../lib/server/http';

export const POST: APIRoute = ({ locals, request }) =>
  handle(async () => {
    const { current, password } = (await request.json().catch(() => ({}))) as { current?: string; password?: string };
    const user = db.select().from(schema.users).where(eq(schema.users.id, locals.user!.id)).get();
    if (!user || !current || !(await verifyPassword(current, user.passwordHash))) return bad('Mật khẩu hiện tại không đúng.');
    const error = validatePassword(password ?? '');
    if (error) return bad(error);
    db.update(schema.users)
      .set({ passwordHash: await hashPassword(password!), updatedAt: new Date() })
      .where(eq(schema.users.id, user.id))
      .run();
    return ok({});
  });
