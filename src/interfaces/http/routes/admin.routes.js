import { Router } from 'express';
import multer from 'multer';
import { randomBytes } from 'node:crypto';
import { ah } from '../middleware/async.js';
import { validate } from '../middleware/validate.js';
import { noStore } from '../middleware/cache.js';
import { csrfGuard } from '../middleware/csrf.js';
import { requireRole } from '../middleware/auth.js';
import { limitTulisAdmin } from '../middleware/rate-limit.js';
import { AppError } from '../../../shared/errors.js';
import * as S from '../schemas/index.js';

// Unggahan berkas.
//
// Tiga lapis pembatasan, karena satu saja tidak cukup:
//   1. `limits` menghentikan berkas raksasa sebelum habis dibaca ke disk.
//   2. `fileFilter` menolak jenis yang tidak masuk daftar putih.
//   3. Nama berkasnya dibangkitkan sendiri — nama kiriman tidak pernah dipakai,
//      jadi tidak ada "../" yang perlu disaring.
const JENIS_BOLEH = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
const MAKS_BYTE = 4 * 1024 * 1024;

const buatUploader = (uploadDir) =>
  multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, uploadDir),
      filename: (_req, file, cb) => {
        // Ekstensi diambil dari jenis MIME yang sudah lolos daftar putih,
        // bukan dari nama berkas kiriman.
        const ext = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp',
                      'image/gif': '.gif', 'image/avif': '.avif' }[file.mimetype] ?? '.bin';
        cb(null, `${Date.now().toString(36)}-${randomBytes(8).toString('hex')}${ext}`);
      }
    }),
    limits: { fileSize: MAKS_BYTE, files: 1 },
    fileFilter: (_req, file, cb) => {
      if (!JENIS_BOLEH.has(file.mimetype)) {
        return cb(new AppError('Hanya gambar JPG, PNG, WebP, GIF, atau AVIF.', {
          status: 415, code: 'UNSUPPORTED_MEDIA_TYPE'
        }));
      }
      cb(null, true);
    }
  });

export function adminRoutes(c, { requireAuth, uploadDir }) {
  const r = Router();
  const upload = buatUploader(uploadDir);

  // Empat lapis yang berlaku untuk seluruh rute admin, dipasang sekali di sini
  // supaya tidak ada rute baru yang bisa lupa memakainya.
  r.use(noStore, requireAuth, csrfGuard, limitTulisAdmin);

  r.get('/dashboard', ah(c.dashboard));

  // ── menu ──────────────────────────────────────────────────────────────────
  r.get('/menus', ah(c.menuList));
  r.post('/menus/reorder', validate({ body: S.reorderBody }), ah(c.menuReorder));
  r.get('/menus/:id', validate({ params: S.idParam }), ah(c.menuGet));
  r.post('/menus', validate({ body: S.menuCreateBody }), ah(c.menuCreate));
  r.patch('/menus/:id', validate({ params: S.idParam, body: S.menuUpdateBody }), ah(c.menuUpdate));
  r.delete('/menus/:id', validate({ params: S.idParam }), ah(c.menuDelete));

  // ── artikel ───────────────────────────────────────────────────────────────
  r.get('/articles', validate({ query: S.articleAdminQuery }), ah(c.articleList));
  r.post('/articles/preview', validate({ body: S.previewBody }), ah(c.articlePreview));
  r.get('/articles/:id', validate({ params: S.uuidParam }), ah(c.articleGet));
  r.post('/articles', validate({ body: S.articleCreateBody }), ah(c.articleCreate));
  r.patch('/articles/:id', validate({ params: S.uuidParam, body: S.articleUpdateBody }), ah(c.articleUpdate));
  r.delete('/articles/:id', validate({ params: S.uuidParam }), ah(c.articleDelete));

  // ── agenda ────────────────────────────────────────────────────────────────
  r.get('/agenda', ah(c.agendaList));
  r.post('/agenda', validate({ body: S.agendaCreateBody }), ah(c.agendaCreate));
  r.patch('/agenda/:id', validate({ params: S.idParam, body: S.agendaUpdateBody }), ah(c.agendaUpdate));
  r.delete('/agenda/:id', validate({ params: S.idParam }), ah(c.agendaDelete));

  // ── moderasi sparing ──────────────────────────────────────────────────────
  r.get('/sparing', validate({ query: S.moderationQuery }), ah(c.sparingList));
  r.patch('/sparing/:id', validate({ params: S.uuidParam, body: S.moderationBody }), ah(c.sparingModerate));
  r.delete('/sparing/:id', validate({ params: S.uuidParam }), ah(c.sparingDelete));

  // ── pendaftaran Gabung ────────────────────────────────────────────────────
  r.get('/submissions', validate({ query: S.submissionQuery }), ah(c.submissionList));
  r.patch('/submissions/:id', validate({ params: S.uuidParam, body: S.submissionBody }), ah(c.submissionUpdate));
  r.delete('/submissions/:id', validate({ params: S.uuidParam }), ah(c.submissionDelete));

  // ── taksonomi ─────────────────────────────────────────────────────────────
  r.get('/taxonomy', ah(c.taxonomy));
  r.put('/taxonomy/categories', validate({ body: S.categoryBody }), ah(c.categoryUpsert));
  r.delete('/taxonomy/categories/:id', validate({ params: S.idParam }), ah(c.categoryDelete));
  r.put('/taxonomy/frequencies', validate({ body: S.frequencyBody }), ah(c.frequencyUpsert));

  // ── pengaturan ────────────────────────────────────────────────────────────
  r.get('/settings', ah(c.settings));
  r.put('/settings/:id', validate({ params: S.idParam, body: S.settingBody }), ah(c.settingSet));

  // ── media ─────────────────────────────────────────────────────────────────
  r.get('/media', validate({ query: S.pagination }), ah(c.mediaList));
  r.post('/media', upload.single('file'), ah(c.mediaUpload));
  r.delete('/media/:id', validate({ params: S.uuidParam }), ah(c.mediaDelete));

  // ── langit komunitas ──────────────────────────────────────────────────────
  r.get('/sky', validate({ query: S.starQuery }), ah(c.skyList));
  r.patch('/sky/:id', validate({ params: S.uuidParam, body: S.moderationBody }), ah(c.skyModerate));
  r.delete('/sky/:id', validate({ params: S.uuidParam }), ah(c.skyDelete));

  // ── jejak audit ───────────────────────────────────────────────────────────
  r.get('/audit', validate({ query: S.auditQuery }), ah(c.auditList));

  // ── pemantauan ────────────────────────────────────────────────────────────
  // Kesehatan database dan kejadian keamanan hanya untuk owner: keduanya
  // memuat rincian infrastruktur dan pola serangan yang tidak perlu dilihat
  // seorang editor artikel.
  r.get('/monitor', requireRole('owner'), validate({ query: S.monitorQuery }), ah(c.monitorOverview));
  r.get('/monitor/events', requireRole('owner'), validate({ query: S.eventQuery }), ah(c.monitorEvents));
  r.get('/monitor/database', requireRole('owner'), ah(c.monitorDatabase));

  // ── akun admin: hanya owner ───────────────────────────────────────────────
  r.get('/users', requireRole('owner'), ah(c.userList));
  r.post('/users', requireRole('owner'), validate({ body: S.userCreateBody }), ah(c.userCreate));
  r.patch('/users/:id', requireRole('owner'), validate({ params: S.uuidParam, body: S.userUpdateBody }), ah(c.userUpdate));
  r.delete('/users/:id', requireRole('owner'), validate({ params: S.uuidParam }), ah(c.userDelete));

  r.post('/cache/clear', requireRole('owner'), ah(c.cacheClear));

  return r;
}
