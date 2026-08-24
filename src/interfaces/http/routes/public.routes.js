import { Router } from 'express';
import { ah } from '../middleware/async.js';
import { validate } from '../middleware/validate.js';
import { publicCache, noStore, etagJson } from '../middleware/cache.js';
import { limitBaca, limitKiriman } from '../middleware/rate-limit.js';
import * as S from '../schemas/index.js';

// Rute publik: dibaca situs tata surya, tidak butuh autentikasi.
//
// Umur cache dipilih per endpoint, bukan satu angka global:
//   bootstrap & menu  120 dtk — berubah hanya saat admin menyunting
//   artikel & agenda   60 dtk — sama, tapi lebih sering disentuh
//   jejak & sparing     0     — justru "yang baru saja terjadi" isinya
export function publicRoutes(c) {
  const r = Router();
  r.use(limitBaca, etagJson);

  r.get('/bootstrap', publicCache(120), ah(c.bootstrap));
  r.get('/menus', publicCache(120), ah(c.menus));
  r.get('/menus/:id', publicCache(120), validate({ params: S.idParam }), ah(c.menu));

  r.get('/articles', publicCache(60), validate({ query: S.articleListQuery }), ah(c.articles));
  r.get('/articles/:slug', publicCache(60), validate({ params: S.slugParam }), ah(c.article));

  r.get('/taxonomy', publicCache(300), ah(c.taxonomy));
  r.get('/agenda', publicCache(60), ah(c.agenda));
  r.get('/agenda/state', publicCache(60), ah(c.agendaState));
  r.get('/settings', publicCache(300), ah(c.settings));

  // Langit komunitas. Daftarnya boleh di-cache lama — bintang bertambah
  // beberapa per hari, bukan per detik. Tapi "bintang milikku" tidak: ia
  // bergantung pada siapa yang bertanya.
  r.get('/sky/stars', publicCache(120), ah(c.skyStars));
  r.get('/sky/mine', noStore, ah(c.myStar));
  r.post('/sky/stars', noStore, limitKiriman, validate({ body: S.starBody }), ah(c.placeStar));

  r.get('/presence', noStore, ah(c.presence));

  // Aliran presence live. TIDAK memakai limitBaca: koneksinya memang dibuka
  // lama dan hanya satu per pengunjung, jadi menghitungnya sebagai request
  // biasa tidak berarti apa-apa. Batasnya dijaga kapasitas hub (200 tamu).
  r.get('/presence/live', noStore, c.livePresence);
  r.post('/presence/here', noStore, validate({ body: S.hereBody }), c.hereNow);
  r.post('/presence', noStore, limitKiriman, validate({ body: S.presenceBody }), ah(c.recordPresence));

  r.post(
    '/articles/:slug/sparing',
    noStore,
    limitKiriman,
    validate({ params: S.slugParam, body: S.sparingBody }),
    ah(c.submitSparing)
  );
  r.post('/sparing/:id/boost', noStore, limitKiriman, validate({ params: S.uuidParam }), ah(c.boostSparing));

  r.post('/join', noStore, limitKiriman, validate({ body: S.joinBody }), ah(c.join));

  return r;
}
