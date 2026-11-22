// POST: tạo truyện (multipart: data = JSON, cover = ảnh). JSON có thể kèm chapters[] và overwrite.
import type { APIRoute } from 'astro';
import { createStory } from '../../../../lib/server/admin';
import { handle, ok } from '../../../../lib/server/http';
import { readForm } from './_form';

export const POST: APIRoute = ({ request, locals }) =>
  handle(async () => {
    const { data, cover } = await readForm(request);
    return ok({ slug: await createStory(data, cover, locals.user!) }, 201);
  });
