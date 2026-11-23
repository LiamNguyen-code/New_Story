// GET: danh sách chương (kèm nội dung) · POST: thêm chương { chapters: [{ data: { number, title, draft? }, body }] }
import type { APIRoute } from 'astro';
import { addChapters, listChapters } from '../../../../../lib/server/admin';
import { handle, ok } from '../../../../../lib/server/http';

export const GET: APIRoute = ({ params, locals }) => handle(() => ok({ chapters: listChapters(params.slug!, locals.user!) }));

export const POST: APIRoute = ({ params, request, locals }) =>
  handle(async () => {
    const body = (await request.json().catch(() => ({}))) as { chapters?: unknown };
    return ok({ ids: addChapters(params.slug!, body.chapters, locals.user!) }, 201);
  });
