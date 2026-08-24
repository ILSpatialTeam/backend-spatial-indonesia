import { Router } from 'express';
import { makePublicController } from './controllers/public.controller.js';
import { makeAuthController } from './controllers/auth.controller.js';
import { makeAdminController } from './controllers/admin.controller.js';
import { publicRoutes } from './routes/public.routes.js';
import { authRoutes } from './routes/auth.routes.js';
import { adminRoutes } from './routes/admin.routes.js';
import { makeRequireAuth } from './middleware/auth.js';
import { ah } from './middleware/async.js';
import { noStore } from './middleware/cache.js';
import { checkConnection } from '../../infrastructure/db/pool.js';

export function buildRouter(container) {
  const { services, tokens, cache, uploadDir, presenceHub } = container;
  const requireAuth = makeRequireAuth(tokens);
  const r = Router();

  // Cek kesehatan benar-benar menyentuh database. Endpoint yang cuma menjawab
  // "ok" tanpa memeriksa apa pun akan tetap hijau saat Postgres mati — dan
  // itulah satu-satunya saat ia dibutuhkan.
  r.get(
    '/health',
    noStore,
    ah(async (_req, res) => {
      const mulai = Date.now();
      const info = await checkConnection();
      res.json({
        status: 'ok',
        database: info.db,
        dbLatencyMs: Date.now() - mulai,
        uptimeSec: Math.round(process.uptime()),
        cacheEntries: cache.size
      });
    })
  );

  r.use('/auth', authRoutes(makeAuthController(services), { requireAuth }));
  r.use(
    '/admin',
    adminRoutes(makeAdminController({ ...services, cache }), { requireAuth, uploadDir })
  );
  // Publik dipasang terakhir supaya rutenya yang bercorak umum (mis. `/:id`)
  // tidak pernah menelan `/auth` atau `/admin`.
  r.use('/', publicRoutes(makePublicController({ ...services, presenceHub })));

  return r;
}
