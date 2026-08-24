import { randomToken, safeEqual } from '../../../infrastructure/security/hashing.js';
import { COOKIE_CSRF } from './auth.js';
import { ForbiddenError } from '../../../shared/errors.js';

// Perlindungan CSRF dengan pola double submit.
//
// Kenapa dibutuhkan: sesi admin dibawa cookie, dan browser melampirkan cookie
// ke setiap permintaan ke domain kita — termasuk permintaan yang dipicu dari
// situs lain. SameSite=Strict sudah menutup sebagian besar kasus, tapi ia
// pengaturan browser, bukan pemeriksaan kita, dan perilakunya berbeda-beda
// antar browser lama. Lapis kedua ini murah.
//
// Cara kerjanya: token acak dikirim sebagai cookie yang boleh dibaca
// JavaScript, dashboard membacanya dan mengirimkannya kembali sebagai header.
// Situs lain tidak bisa membaca cookie domain kita, jadi tidak bisa menyusun
// header yang cocok — meski cookienya sendiri ikut terkirim.
export const HEADER_CSRF = 'x-csrf-token';

const AMAN = new Set(['GET', 'HEAD', 'OPTIONS']);

export const issueCsrfCookie = (res, { secure, domain }) => {
  const token = randomToken(24);
  res.cookie(COOKIE_CSRF, token, {
    httpOnly: false,   // memang harus terbaca JavaScript — itu inti polanya
    secure,
    sameSite: 'strict',
    path: '/',
    ...(domain ? { domain } : {}),
    maxAge: 7 * 24 * 3600 * 1000
  });
  return token;
};

export function csrfGuard(req, _res, next) {
  if (AMAN.has(req.method)) return next();

  // Permintaan ber-Bearer tidak membawa cookie sesi, jadi tidak bisa jadi
  // korban CSRF: penyerang yang sanggup menyetel header Authorization sudah
  // memegang tokennya, dan CSRF tidak lagi jadi soal.
  const header = req.get('authorization');
  if (header?.startsWith('Bearer ')) return next();

  const dariCookie = req.cookies?.[COOKIE_CSRF];
  const dariHeader = req.get(HEADER_CSRF);
  if (!dariCookie || !dariHeader || !safeEqual(dariCookie, dariHeader)) {
    return next(new ForbiddenError('Token CSRF tidak cocok. Muat ulang halaman dashboard.'));
  }
  next();
}
