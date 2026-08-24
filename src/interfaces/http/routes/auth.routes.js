import { Router } from 'express';
import { ah } from '../middleware/async.js';
import { validate } from '../middleware/validate.js';
import { noStore } from '../middleware/cache.js';
import { limitLogin } from '../middleware/rate-limit.js';
import { csrfGuard } from '../middleware/csrf.js';
import * as S from '../schemas/index.js';

export function authRoutes(c, { requireAuth }) {
  const r = Router();
  r.use(noStore);

  r.post('/login', limitLogin, validate({ body: S.loginBody }), ah(c.login));
  // Refresh tidak butuh access token yang masih hidup — justru dipanggil saat
  // yang lama sudah kedaluwarsa. Yang membuktikan identitas di sini adalah
  // cookie refresh, dan CSRF tetap dijaga karena ini permintaan POST bercookie.
  r.post('/refresh', csrfGuard, ah(c.refresh));
  r.post('/logout', csrfGuard, ah(c.logout));

  r.get('/me', requireAuth, ah(c.me));
  r.post(
    '/change-password',
    requireAuth,
    csrfGuard,
    validate({ body: S.changePasswordBody }),
    ah(c.changePassword)
  );

  return r;
}
