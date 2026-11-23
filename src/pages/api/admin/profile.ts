// POST: tự đổi tên hiển thị { name } — tên này là tên tác giả hiện trên site
import type { APIRoute } from 'astro';
import { updateUser } from '../../../lib/server/admin';
import { bad, handle, ok } from '../../../lib/server/http';

export const POST: APIRoute = ({ locals, request }) =>
  handle(async () => {
    const { name } = (await request.json().catch(() => ({}))) as { name?: unknown };
    if (typeof name !== 'string' || !name.trim()) return bad('Chưa nhập tên hiển thị.');
    await updateUser(locals.user!.id, { name });
    return ok({});
  });
