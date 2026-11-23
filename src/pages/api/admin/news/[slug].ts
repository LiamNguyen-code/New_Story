// GET: 1 tin · PUT: sửa (multipart, ảnh bìa tuỳ chọn) · DELETE: xoá tin + ảnh của tin
import type { APIRoute } from 'astro';
import { deleteNews, getNewsItem, updateNews } from '../../../../lib/server/news';
import { handle, ok } from '../../../../lib/server/http';
import { readForm } from '../stories/_form';

export const GET: APIRoute = ({ params, locals }) => handle(() => ok({ item: getNewsItem(params.slug!, locals.user!) }));

export const PUT: APIRoute = ({ params, request, locals }) =>
  handle(async () => {
    const { data, cover } = await readForm(request);
    await updateNews(params.slug!, data, cover, locals.user!);
    return ok({});
  });

export const DELETE: APIRoute = ({ params, locals }) =>
  handle(async () => {
    await deleteNews(params.slug!, locals.user!);
    return ok({});
  });
