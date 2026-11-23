// PUT: sửa thông tin truyện (multipart, ảnh bìa tuỳ chọn) · DELETE: xoá truyện + toàn bộ chương
import type { APIRoute } from 'astro';
import { deleteStory, updateStory } from '../../../../../lib/server/admin';
import { handle, ok } from '../../../../../lib/server/http';
import { readForm } from '../_form';

export const PUT: APIRoute = ({ params, request, locals }) =>
  handle(async () => {
    const { data, cover } = await readForm(request);
    await updateStory(params.slug!, data, cover, locals.user!);
    return ok({});
  });

export const DELETE: APIRoute = ({ params, locals }) =>
  handle(async () => {
    await deleteStory(params.slug!, locals.user!);
    return ok({});
  });
