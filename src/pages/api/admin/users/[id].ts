// PUT: sửa tên / quyền / đặt lại mật khẩu · DELETE: xoá tài khoản (chỉ admin)
import type { APIRoute } from 'astro';
import { deleteUser, requireAdmin, updateUser } from '../../../../lib/server/admin';
import { deleteUserSessions } from '../../../../lib/server/auth';
import { InputError, handle, ok } from '../../../../lib/server/http';

export const PUT: APIRoute = ({ locals, params, request }) =>
  handle(async () => {
    requireAdmin(locals.user);
    const id = Number(params.id);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    await updateUser(id, body);
    // Đặt lại mật khẩu cho người khác → đăng xuất họ khỏi mọi thiết bị
    if (body.password && id !== locals.user!.id) deleteUserSessions(id);
    return ok({});
  });

export const DELETE: APIRoute = ({ locals, params }) =>
  handle(() => {
    requireAdmin(locals.user);
    if (Number(params.id) === locals.user!.id) throw new InputError('Không thể tự xoá tài khoản của mình.');
    deleteUser(Number(params.id));
    return ok({});
  });
