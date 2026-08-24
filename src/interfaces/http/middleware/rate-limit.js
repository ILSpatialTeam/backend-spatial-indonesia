import rateLimit from 'express-rate-limit';
import { RateLimitError } from '../../../shared/errors.js';

// Tiga batas dengan alasan berbeda, bukan satu angka untuk semuanya.
//
// Endpoint baca boleh longgar — situsnya memang untuk dibuka. Login harus
// ketat karena itu satu-satunya pintu ke dashboard. Kiriman publik di
// tengah-tengah: cukup untuk orang yang antusias, tidak cukup untuk skrip.
const buat = (opsi) =>
  rateLimit({
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, _res, next, options) => next(new RateLimitError(options.message)),
    ...opsi
  });

export const limitBaca = buat({
  windowMs: 60_000,
  limit: 300,
  message: 'Terlalu banyak permintaan. Tunggu sebentar.'
});

export const limitLogin = buat({
  windowMs: 15 * 60_000,
  limit: 10,
  // Percobaan yang berhasil tidak ikut dihitung, jadi orang yang memang tahu
  // kata sandinya tidak pernah terkunci gara-gara sering masuk-keluar.
  skipSuccessfulRequests: true,
  message: 'Terlalu banyak percobaan masuk. Coba lagi dalam 15 menit.'
});

export const limitKiriman = buat({
  windowMs: 10 * 60_000,
  limit: 8,
  message: 'Terlalu banyak kiriman dari alamat ini. Coba lagi nanti.'
});

export const limitTulisAdmin = buat({
  windowMs: 60_000,
  limit: 120,
  message: 'Terlalu banyak perubahan sekaligus.'
});
