// Quản lý tài khoản (chỉ admin). GET: danh sách · POST: tạo { email, name, password, role }
import type { APIRoute } from 'astro';
import { createUser, listUsers, requireAdmin } from '../../../../lib/server/admin';
import { handle, ok } from '../../../../lib/server/http';

export const GET: APIRoute = ({ locals }) =>
  handle(() => {
    requireAdmin(locals.user);
    return ok({ users: listUsers() });
  });

export const POST: APIRoute = ({ locals, request }) =>
  handle(async () => {
    requireAdmin(locals.user);
    return ok({ id: await createUser(await request.json().catch(() => ({}))) }, 201);
  });
