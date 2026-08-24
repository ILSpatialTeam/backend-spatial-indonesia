import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { env } from './config/env.js';
import { logger } from './shared/logger.js';
import { buildContainer } from './container.js';
import { buildRouter } from './interfaces/http/router.js';
import { errorHandler, notFoundHandler } from './interfaces/http/middleware/error.js';
import { ForbiddenError } from './shared/errors.js';
import { openapiSpec } from './interfaces/http/openapi/index.js';

const ADMIN_DIR = fileURLToPath(new URL('../admin/', import.meta.url));
const UPLOAD_DIR = fileURLToPath(new URL('../uploads/', import.meta.url));
const QUILL_DIR = fileURLToPath(new URL('../node_modules/quill/dist/', import.meta.url));

export function createApp({ container = buildContainer() } = {}) {
  const app = express();

  // Di belakang reverse proxy, req.ip harus dibaca dari X-Forwarded-For —
  // kalau tidak, semua pembatas laju melihat satu IP yang sama dan seluruh
  // pengunjung berbagi satu jatah.
  //
  // Nilainya angka, tidak pernah `true`: mempercayai seluruh rantai proxy
  // berarti klien bisa memalsukan IP-nya sendiri hanya dengan menambahkan
  // header. Jumlah hop berbeda tiap deployment, jadi dibaca dari lingkungan —
  // lihat TRUST_PROXY di config/env.js dan DEPLOYMENT.md.
  app.set('trust proxy', env.TRUST_PROXY);
  app.disable('x-powered-by');
  // ETag bawaan Express dimatikan: endpoint publik memasangnya sendiri lewat
  // res.sendCached(), dan dua mekanisme ETag pada respons yang sama saling
  // menimpa dengan cara yang sulit ditebak.
  app.set('etag', false);

  app.use((req, res, next) => {
    req.id = req.get('x-request-id') || randomUUID();
    res.set('X-Request-Id', req.id);
    next();
  });

  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => req.id,
      // Cek kesehatan dipanggil tiap beberapa detik oleh pemantau. Tanpa ini,
      // log produksi isinya 90% baris yang sama.
      autoLogging: { ignore: (req) => req.url === '/api/v1/health' }
    })
  );

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          // Dashboard memuat Quill dari berkas lokal, bukan CDN — jadi tidak
          // ada host luar yang perlu diizinkan sama sekali.
          scriptSrc: ["'self'"],
          // Quill menyuntikkan gaya inline saat merender editor.
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          fontSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          // Helmet memasang upgrade-insecure-requests secara bawaan. Di
          // pengembangan itu dimatikan eksplisit (null): dashboard dilayani
          // lewat http polos, dan direktif ini cuma bikin bingung saat ada
          // sumber daya yang tiba-tiba dicoba lewat https.
          upgradeInsecureRequests: env.isProd ? [] : null
        }
      },
      crossOriginEmbedderPolicy: false,
      // Gambar yang diunggah admin dipakai frontend yang berbeda origin.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      hsts: env.isProd ? { maxAge: 31_536_000, includeSubDomains: true, preload: true } : false
    })
  );

  // Origin milik server ini sendiri selalu diizinkan. Bukan kelonggaran:
  // permintaan dengan Origin yang sama dengan origin kita memang same-origin,
  // dan tidak ada situs lain yang bisa memalsukannya — browser yang mengisi
  // header itu, bukan halaman.
  //
  // Ini juga bukan sekadar teori. Skrip `<script type="module">` diambil
  // browser dalam mode CORS dan tetap membawa header Origin walau same-origin,
  // jadi tanpa baris ini dashboard-nya sendiri gagal memuat modulnya.
  const originSendiri = new URL(env.PUBLIC_URL).origin;
  const originBoleh = new Set([...env.corsOrigins, originSendiri]);

  app.use(
    cors({
      // Daftar putih, bukan `origin: true`. Dengan credentials menyala,
      // memantulkan origin apa pun sama saja membiarkan situs mana pun
      // memanggil API ini memakai cookie sesi pengunjung.
      origin(origin, cb) {
        // Tanpa origin = curl, Postman, atau permintaan dari server. Tidak ada
        // cookie yang ikut, jadi tidak ada yang perlu dilindungi.
        if (!origin) return cb(null, true);
        if (originBoleh.has(origin)) return cb(null, true);
        // Ditolak sebagai 403, bukan 500: permintaannya memang tidak berhak,
        // bukan servernya yang rusak — dan galat 500 palsu membuat pemantauan
        // berbunyi untuk sesuatu yang berjalan sesuai rencana.
        cb(new ForbiddenError(`Origin ${origin} tidak diizinkan memanggil API ini.`));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      // `If-None-Match` wajib ada di sini. Ia bukan header yang masuk daftar
      // aman bawaan CORS, jadi memakainya memicu preflight — dan kalau tidak
      // diizinkan di sini, preflight-nya lolos tapi permintaan sebenarnya
      // dibatalkan browser tanpa satu pun galat di konsol. Persis itu yang
      // membuat frontend diam-diam berhenti memperbarui datanya.
      allowedHeaders: [
        'Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Request-Id',
        'If-None-Match', 'Accept'
      ],
      exposedHeaders: ['X-Request-Id', 'ETag'],
      maxAge: 86_400
    })
  );

  app.use(compression({
    // SSE tidak boleh dikompresi.
    //
    // Kompresi bekerja dengan menahan data sampai buffer-nya cukup penuh untuk
    // dikirim. Untuk response biasa itu tepat; untuk aliran yang mengirim
    // beberapa puluh byte tiap beberapa detik, artinya pesannya tertahan di
    // server sampai entah kapan — dan gejalanya adalah fitur presence yang
    // tampak mati total tanpa satu pun error di mana pun.
    filter: (req, res) => {
      if (res.getHeader('Content-Type') === 'text/event-stream') return false;
      return compression.filter(req, res);
    }
  }));
  app.use(cookieParser());
  // Batas ukuran badan permintaan. Artikel panjang butuh ruang, tapi 1 MB
  // sudah jauh di atas tulisan terpanjang yang masuk akal — dan tanpa batas,
  // satu permintaan besar bisa menghabiskan memori proses.
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '256kb' }));

  // ── berkas statis ─────────────────────────────────────────────────────────
  app.use(
    '/uploads',
    express.static(UPLOAD_DIR, {
      maxAge: '30d',
      immutable: true,
      index: false,
      // Berkas apa pun di folder unggahan disajikan sebagai unduhan biasa,
      // tidak pernah dirender browser. Kalau suatu hari ada berkas HTML lolos
      // ke sini, ia tidak akan bisa mengeksekusi apa pun di origin kita.
      setHeaders: (res) => res.set('X-Content-Type-Options', 'nosniff')
    })
  );
  app.use('/admin/vendor/quill', express.static(QUILL_DIR, { maxAge: '7d', index: false }));
  app.use('/admin', express.static(ADMIN_DIR, { index: 'index.html', maxAge: 0 }));

  // ── dokumentasi ───────────────────────────────────────────────────────────
  app.get('/api/v1/openapi.json', (_req, res) => res.json(openapiSpec));
  app.use(
    '/docs',
    swaggerUi.serve,
    swaggerUi.setup(openapiSpec, {
      customSiteTitle: 'Spatial Indonesia API',
      swaggerOptions: { persistAuthorization: true, docExpansion: 'list', tryItOutEnabled: true }
    })
  );

  // Middleware galat butuh service pemantauan tapi tidak boleh mengimpornya —
  // ia dibuat oleh composition root, bukan oleh modul HTTP. `app.set` adalah
  // wadah bawaan Express untuk itu, dan middleware membacanya lewat `req.app`.
  app.set('monitor', container.services.monitoring);

  // ── API ───────────────────────────────────────────────────────────────────
  app.use('/api/v1', buildRouter(container));

  app.get('/', (_req, res) =>
    res.json({
      name: 'Spatial Indonesia API',
      docs: '/docs',
      openapi: '/api/v1/openapi.json',
      admin: '/admin',
      health: '/api/v1/health'
    })
  );

  app.use(notFoundHandler);
  app.use(errorHandler);

  return { app, container };
}
