import { ZodError } from 'zod';
import { AppError, ValidationError, NotFoundError } from '../../../shared/errors.js';
import { logger } from '../../../shared/logger.js';
import { env } from '../../../config/env.js';
import { hashIp } from '../../../infrastructure/security/hashing.js';

// Satu-satunya tempat yang menerjemahkan galat jadi respons HTTP.
//
// Prinsipnya: yang kita lempar sendiri boleh diceritakan, yang tidak terduga
// tidak. Pesan galat Postgres kerap memuat nama tabel, nama kolom, bahkan
// potongan nilai yang gagal — semuanya berguna bagi penyerang dan tidak berguna
// bagi pengunjung.
const KODE_PG = {
  '23505': { status: 409, code: 'CONFLICT', pesan: 'Data dengan nilai unik yang sama sudah ada.' },
  '23503': { status: 409, code: 'CONFLICT', pesan: 'Data ini masih dipakai oleh data lain.' },
  '23514': { status: 422, code: 'VALIDATION_ERROR', pesan: 'Nilai yang dikirim melanggar aturan data.' },
  '22P02': { status: 422, code: 'VALIDATION_ERROR', pesan: 'Format nilai tidak sesuai.' },
  '23502': { status: 422, code: 'VALIDATION_ERROR', pesan: 'Ada kolom wajib yang kosong.' }
};

export function notFoundHandler(req, res, next) {
  next(new NotFoundError(`Rute ${req.method} ${req.path}`));
}

// eslint-disable-next-line no-unused-vars -- Express mengenali error handler
// dari jumlah argumennya; `next` harus tetap ada walau tidak dipakai.
export function errorHandler(err, req, res, next) {
  let keluar = err;

  if (err instanceof ZodError) {
    keluar = new ValidationError(
      Object.fromEntries(err.issues.map((i) => [i.path.join('.') || '_', i.message]))
    );
  } else if (err?.code && KODE_PG[err.code]) {
    const p = KODE_PG[err.code];
    keluar = new AppError(p.pesan, { status: p.status, code: p.code, cause: err });
  } else if (err?.type === 'entity.too.large') {
    keluar = new AppError('Muatan permintaan terlalu besar.', { status: 413, code: 'PAYLOAD_TOO_LARGE' });
  } else if (err?.type === 'entity.parse.failed') {
    keluar = new AppError('Badan permintaan bukan JSON yang valid.', { status: 400, code: 'BAD_JSON' });
  } else if (!(err instanceof AppError)) {
    keluar = new AppError('Terjadi kesalahan di server.', { status: 500, code: 'INTERNAL_ERROR', cause: err });
  }

  const status = keluar.status ?? 500;

  // Setiap kegagalan yang berarti dicatat sebagai kejadian keamanan, bukan
  // hanya ke berkas log. Log bagus untuk menelusuri satu insiden; tabel
  // security_events bagus untuk melihat pola — dan pola itulah yang
  // membedakan "satu orang salah ketik" dari "seseorang sedang mencoba".
  //
  // 404 tidak ikut: pemindai otomatis menghasilkan ribuan per hari dan itu
  // akan menenggelamkan kejadian yang benar-benar perlu dilihat.
  const monitor = req.app?.get('monitor');
  if (monitor && status !== 404) {
    const jenis = {
      RATE_LIMITED: 'rate_limited',
      UNAUTHORIZED: 'unauthorized',
      FORBIDDEN: 'forbidden',
      VALIDATION_ERROR: 'validation_failed',
      UNSUPPORTED_MEDIA_TYPE: 'upload_rejected',
      PAYLOAD_TOO_LARGE: 'upload_rejected'
    }[keluar.code] ?? (status >= 500 ? 'server_error' : null);

    if (jenis) {
      // Origin yang ditolak CORS datang sebagai ForbiddenError; dibedakan di
      // sini supaya di layar pemantauan ia tidak tercampur dengan admin yang
      // mencoba membuka halaman yang bukan haknya.
      const kind = jenis === 'forbidden' && /Origin .* tidak diizinkan/.test(keluar.message)
        ? 'cors_rejected'
        : jenis;
      monitor.catat({
        kind,
        message: keluar.message,
        method: req.method,
        path: req.originalUrl?.slice(0, 300),
        status,
        actorEmail: req.actor?.email ?? null,
        ipHash: hashIp(req.ip, env.ipHashSalt),
        userAgent: req.get('user-agent'),
        requestId: req.id,
        meta: keluar.details ? { details: keluar.details } : {}
      });
    }
  }

  const catat = status >= 500 ? logger.error.bind(logger) : logger.warn.bind(logger);
  catat(
    { err: keluar.cause ?? keluar, status, path: req.originalUrl, method: req.method, reqId: req.id },
    keluar.message
  );

  res.status(status).json({
    error: {
      code: keluar.code ?? 'INTERNAL_ERROR',
      message: keluar.message,
      ...(keluar.details ? { details: keluar.details } : {}),
      // Jejak tumpukan hanya di pengembangan. Di produksi ia memberi tahu
      // penyerang struktur direktori dan versi pustaka yang dipakai.
      ...(env.isProd || status < 500 ? {} : { stack: (keluar.cause ?? keluar).stack })
    }
  });
}
