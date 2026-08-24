// Log terstruktur. Di pengembangan dibuat enak dibaca manusia; di produksi
// tetap JSON satu baris supaya bisa diambil agregator log apa pun.
//
// Daftar redaksi bukan formalitas: satu `req.headers` yang tercetak utuh sudah
// cukup untuk membocorkan cookie sesi admin ke berkas log.
import pino from 'pino';
import { env } from '../config/env.js';

export const logger = pino({
  level: env.isTest ? 'silent' : env.isProd ? 'info' : 'debug',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.passwordHash',
      '*.password_hash',
      '*.refreshToken'
    ],
    censor: '[disunting]'
  },
  transport: env.isProd ? undefined : { target: 'pino/file', options: { destination: 1 } }
});
