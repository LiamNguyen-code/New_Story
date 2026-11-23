// GET: danh sách tin (+ slug của mọi tin để tránh trùng) · POST: tạo tin (multipart: data = JSON { slug, body, data }, cover = ảnh bìa)
import type { APIRoute } from 'astro';
import { createNews, listNews, listNewsSlugs } from '../../../../lib/server/news';
import { handle, ok } from '../../../../lib/server/http';
import { readForm } from '../stories/_form';

export const GET: APIRoute = ({ locals }) => handle(() => ok({ news: listNews(locals.user!), slugs: listNewsSlugs() }));

export const POST: APIRoute = ({ request, locals }) =>
  handle(async () => {
    const { data, cover } = await readForm(request);
    return ok({ slug: await createNews(data, cover, locals.user!) }, 201);
  });
