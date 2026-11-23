// PUT: sửa chương { data: { number, title, draft, seoDescription }, body } · DELETE: xoá chương
import type { APIRoute } from 'astro';
import { deleteChapter, updateChapter } from '../../../../lib/server/admin';
import { handle, ok } from '../../../../lib/server/http';

export const PUT: APIRoute = ({ params, request, locals }) =>
  handle(async () => {
    updateChapter(Number(params.id), await request.json().catch(() => ({})), locals.user!);
    return ok({});
  });

export const DELETE: APIRoute = ({ params, locals }) =>
  handle(() => {
    deleteChapter(Number(params.id), locals.user!);
    return ok({});
  });
