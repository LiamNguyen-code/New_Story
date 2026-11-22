import type { APIRoute } from 'astro';
import { SESSION_COOKIE, deleteSession } from '../../../lib/server/auth';
import { ok } from '../../../lib/server/http';

export const POST: APIRoute = ({ cookies }) => {
  deleteSession(cookies.get(SESSION_COOKIE)?.value);
  cookies.delete(SESSION_COOKIE, { path: '/' });
  return ok({});
};
