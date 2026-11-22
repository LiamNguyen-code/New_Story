// PUT: sửa thông tin truyện (multipart, ảnh bìa tuỳ chọn) · DELETE: xoá truyện + toàn bộ chương
import type { APIRoute } from 'astro';
import { deleteStory, updateStory } from '../../../../../lib/server/admin';
import { handle, ok } from '../../../../../lib/server/http';
import { readForm } from '../_form';

export const PUT: APIRoute = ({ params, request }) =>
  handle(async () => {
    const { data, cover } = await readForm(request);
    await updateStory(params.slug!, data, cover);
    return ok({});
  });

export const DELETE: APIRoute = ({ params }) =>
  handle(async () => {
    await deleteStory(params.slug!);
    return ok({});
  });
