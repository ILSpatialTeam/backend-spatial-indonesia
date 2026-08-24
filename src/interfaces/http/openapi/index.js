import { components } from './components.js';
import { env } from '../../../config/env.js';

const err = (ref) => ({ $ref: `#/components/responses/${ref}` });
const json = (schema) => ({ content: { 'application/json': { schema } } });
const ok = (description, schema) => ({ 200: { description, ...json(schema) } });
const arrayOf = (name) => ({ type: 'array', items: { $ref: `#/components/schemas/${name}` } });
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });

const body = (schema, required = true) => ({
  required,
  content: { 'application/json': { schema } }
});

// Parameter yang berulang di banyak endpoint daftar.
const qLimit = { name: 'limit', in: 'query', schema: { type: 'integer', default: 50, maximum: 100 } };
const qOffset = { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } };
const pId = (nama, contoh) => ({
  name: nama, in: 'path', required: true, schema: { type: 'string' }, example: contoh
});

// Endpoint admin selalu sama pola keamanannya, jadi dibungkus satu helper —
// supaya tidak ada satu pun yang terdokumentasi seolah bisa dipanggil terbuka.
const adminOp = (op) => ({
  ...op,
  tags: op.tags ?? ['Admin'],
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  responses: {
    ...op.responses,
    401: err('TidakBerhak'),
    403: err('TidakBerhak'),
    422: err('Validasi')
  }
});

export const openapiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Spatial Indonesia API',
    version: '1.0.0',
    description: `
REST API untuk situs tata surya interaktif Spatial Indonesia.

### Dua kelompok endpoint

**Publik** (\`/api/v1/*\`) — dibaca situsnya, tanpa autentikasi, agresif di-cache.
Yang paling penting adalah \`GET /bootstrap\`: satu panggilan yang membawa seluruh
isi situs. Endpoint lain ada untuk pemakaian granular, tapi frontend memakai
bootstrap supaya tata suryanya tidak menunggu tujuh permintaan selesai.

**Admin** (\`/api/v1/admin/*\`) — CRUD dari dashboard, wajib masuk.

### Autentikasi

\`POST /auth/login\` memasang tiga cookie: \`si_access\` (JWT pendek, httpOnly),
\`si_refresh\` (bisa dicabut, httpOnly, hanya dikirim ke \`/api/v1/auth\`), dan
\`si_csrf\` (terbaca JavaScript). Setiap permintaan yang mengubah data lewat
cookie wajib mengirim ulang nilai \`si_csrf\` sebagai header \`X-CSRF-Token\`.

Untuk mencoba dari halaman ini, pakai tombol **Authorize** dengan skema
\`bearerAuth\` dan tempel \`accessToken\` dari respons login — jalur Bearer tidak
memerlukan CSRF.

### Artikel: dibaca di sini atau di Medium

Setiap artikel punya \`source\`. Yang \`internal\` isinya ada di \`bodyHtml\`
(HTML tersanitasi dari editor WYSIWYG dashboard). Yang \`medium\` tidak punya isi
sama sekali — hanya \`externalUrl\`. Field \`href\` dan \`external\` di respons
daftar sudah menyimpulkan keduanya, jadi frontend tidak perlu tahu aturannya.
    `.trim(),
    contact: { name: 'Spatial Indonesia' },
    license: { name: 'Hak cipta dilindungi' }
  },
  servers: [
    { url: `${env.PUBLIC_URL}/api/v1`, description: 'Server ini' }
  ],
  tags: [
    { name: 'Publik', description: 'Dibaca situs. Tanpa autentikasi.' },
    { name: 'Partisipasi', description: 'Kiriman dari pengunjung: sparing, jejak, pendaftaran.' },
    { name: 'Kebersamaan', description: 'Presence live dan langit komunitas — bagian multiplayer situs.' },
    { name: 'Auth', description: 'Masuk, keluar, dan sesi dashboard.' },
    { name: 'Admin', description: 'CRUD dari dashboard. Wajib masuk.' }
  ],
  components,
  paths: {
    '/health': {
      get: {
        tags: ['Publik'],
        summary: 'Cek kesehatan proses dan database',
        responses: ok('Sehat', { type: 'object' })
      }
    },

    // ── publik ───────────────────────────────────────────────────────────────
    '/bootstrap': {
      get: {
        tags: ['Publik'],
        summary: 'Seluruh isi situs dalam satu panggilan',
        description:
          'Dipakai frontend saat memuat. Mendukung ETag: kunjungan berikutnya ' +
          'berakhir 304 tanpa badan respons kalau tidak ada yang berubah.',
        responses: {
          ...ok('Isi situs', ref('Bootstrap')),
          304: { description: 'Tidak berubah sejak ETag yang dikirim.' }
        }
      }
    },
    '/menus': {
      get: { tags: ['Publik'], summary: 'Tujuh menu beserta isi panelnya', responses: ok('Daftar menu', arrayOf('Panel')) }
    },
    '/menus/{id}': {
      get: {
        tags: ['Publik'],
        summary: 'Satu menu',
        parameters: [pId('id', 'program')],
        responses: { ...ok('Menu', ref('Panel')), 404: err('TidakAda') }
      }
    },
    '/articles': {
      get: {
        tags: ['Publik'],
        summary: 'Daftar artikel terbit',
        description: 'Tanpa `bodyHtml` — isi artikel hanya ikut di endpoint detail.',
        parameters: [
          { name: 'category', in: 'query', schema: { type: 'string' }, example: 'teknis' },
          qLimit, qOffset
        ],
        responses: ok('Daftar artikel', arrayOf('ArticleSummary'))
      }
    },
    '/articles/{slug}': {
      get: {
        tags: ['Publik'],
        summary: 'Satu artikel lengkap dengan sparing-nya',
        parameters: [pId('slug', 'frame-budget-vr')],
        responses: { ...ok('Artikel', ref('ArticleDetail')), 404: err('TidakAda') }
      }
    },
    '/articles/{slug}/sparing': {
      post: {
        tags: ['Partisipasi'],
        summary: 'Kirim sparing baru',
        description:
          'Kalau moderasi menyala (`insight.sparing_moderation`), sparing masuk ' +
          'antrean dan belum tampil. Respons memuat `moderated` supaya frontend ' +
          'bisa mengatakannya apa adanya.',
        parameters: [pId('slug', 'frame-budget-vr')],
        requestBody: body({
          type: 'object',
          required: ['frequencyId', 'authorName', 'text'],
          properties: {
            frequencyId: { type: 'string', enum: ['sinyal', 'observasi', 'sonde', 'anomali'] },
            authorName: { type: 'string', minLength: 2, maxLength: 60 },
            text: { type: 'string', minLength: 8, maxLength: 2000 },
            anchor: { type: 'array', items: { type: 'integer' }, minItems: 2, maxItems: 2 }
          }
        }),
        responses: {
          201: { description: 'Diterima', ...json({ type: 'object', properties: { sparing: ref('Sparing'), moderated: { type: 'boolean' } } }) },
          404: err('TidakAda'),
          422: err('Validasi'),
          429: err('TerlaluSering')
        }
      }
    },
    '/sparing/{id}/boost': {
      post: {
        tags: ['Partisipasi'],
        summary: 'Naikkan boost satu sparing',
        parameters: [pId('id', '0f2f…')],
        responses: { ...ok('Boost baru', { type: 'object' }), 404: err('TidakAda'), 429: err('TerlaluSering') }
      }
    },
    '/taxonomy': {
      get: { tags: ['Publik'], summary: 'Kategori artikel dan frekuensi sparing', responses: ok('Taksonomi', { type: 'object' }) }
    },
    '/agenda': {
      get: { tags: ['Publik'], summary: 'Agenda terbit', responses: ok('Daftar agenda', arrayOf('AgendaEvent')) }
    },
    '/agenda/state': {
      get: {
        tags: ['Publik'],
        summary: 'Acara berikutnya, sebelumnya, dan kemajuan di antaranya',
        description:
          'Frontend menghitung ini sendiri dari `/agenda` karena dibutuhkan tiap frame. ' +
          'Endpoint ini untuk panel di dalam headset dan pratinjau dashboard.',
        responses: ok('Keadaan agenda', ref('AgendaState'))
      }
    },
    '/presence': {
      get: {
        tags: ['Publik'],
        summary: 'Jejak penjelajah terakhir',
        responses: ok('Jejak', arrayOf('Trail'))
      },
      post: {
        tags: ['Partisipasi'],
        summary: 'Catat lintasan kunjungan',
        description: 'Id planet yang tidak dikenali dibuang, bukan ditolak.',
        requestBody: body({
          type: 'object',
          required: ['path'],
          properties: { path: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 12 } }
        }),
        responses: { 201: { description: 'Tercatat', ...json({ type: 'object' }) }, 422: err('Validasi'), 429: err('TerlaluSering') }
      }
    },
    '/join': {
      post: {
        tags: ['Partisipasi'],
        summary: 'Kirim formulir Gabung',
        requestBody: body({
          type: 'object',
          required: ['name', 'email'],
          properties: {
            name: { type: 'string' }, email: { type: 'string', format: 'email' },
            focus: { type: 'string' }, message: { type: 'string' }
          }
        }),
        responses: {
          201: { description: 'Terkirim', ...json({ type: 'object' }) },
          409: { description: 'Email ini sudah punya pendaftaran yang belum ditangani.', ...json(ref('Error')) },
          422: err('Validasi'),
          429: err('TerlaluSering')
        }
      }
    },
    '/presence/live': {
      get: {
        tags: ['Kebersamaan'],
        summary: 'Aliran presence live (Server-Sent Events)',
        description:
          'Membuka koneksi SSE yang tetap terbuka selama pengunjung ada di halaman.\n\n' +
          'Jenis kejadian yang dikirim:\n\n' +
          '- `hello` — pesan pertama: `{ id, warna, tamu[] }`. Berisi id pengunjung ini ' +
          'dan snapshot siapa saja yang sudah ada. Tanpa snapshot awal, layar akan kosong ' +
          'sampai orang pertama kebetulan berpindah planet.\n' +
          '- `join` — seseorang masuk (`PresenceGuest`). Tidak dikirim ke dirinya sendiri.\n' +
          '- `move` — seseorang pindah planet (`PresenceGuest`, lengkap dengan `dari`). ' +
          'Ini **juga** dikirim ke pengirimnya; klien yang menyaring dirinya sendiri.\n' +
          '- `leave` — seseorang pergi: `{ id }`.\n' +
          '- Komentar `: ping` tiap 20 detik supaya proxy tidak menutup koneksi.\n\n' +
          'Endpoint ini sengaja **tidak** kena rate limit baca: koneksinya memang ' +
          'dibuka lama, dan menghitungnya sebagai satu permintaan per detik akan ' +
          'memblokir pengunjung yang perilakunya normal.\n\n' +
          'Maksimum 200 koneksi bersamaan per instance; setelah itu server mengirim ' +
          'kejadian `full` lalu menutup.',
        responses: {
          200: {
            description: 'Aliran terbuka',
            content: { 'text/event-stream': { schema: { type: 'string' } } }
          }
        }
      }
    },
    '/presence/here': {
      post: {
        tags: ['Kebersamaan'],
        summary: 'Lapor planet yang sedang dilihat',
        description:
          'Dipanggil saat pengunjung berpindah planet, dan sebagai denyut tiap 45 detik. ' +
          'Tanpa kabar selama 90 detik, pengunjung dianggap pergi.\n\n' +
          'Id yang tidak dikenal dijawab `{ ok: false }`, bukan galat: koneksi SSE bisa ' +
          'putus lalu klien masih sempat mengirim satu laporan terakhir dengan id lamanya.',
        requestBody: body({
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', pattern: '^[A-Za-z0-9_-]{8}$', example: 'Kf3nQ2xA' },
            planet: { type: 'string', nullable: true, example: 'karya' }
          }
        }),
        responses: {
          ...ok('Diterima', {
            type: 'object',
            properties: { ok: { type: 'boolean' }, jumlah: { type: 'integer' } }
          }),
          422: err('Validasi')
        }
      }
    },
    '/sky/stars': {
      get: {
        tags: ['Kebersamaan'],
        summary: 'Bintang komunitas yang sudah disetujui',
        description: 'Di-cache 120 detik. Cache dibatalkan saat ada bintang baru atau moderasi.',
        responses: ok('Daftar bintang', arrayOf('SkyStar'))
      },
      post: {
        tags: ['Kebersamaan'],
        summary: 'Taruh satu bintang di langit',
        description:
          'Satu bintang per sumber, dijaga unique index atas salted hash alamat IP — ' +
          'alamat mentahnya tidak pernah disimpan. Percobaan kedua dijawab 409.\n\n' +
          'Kalau `sky.moderation` menyala, bintangnya masuk berstatus `pending` dan ' +
          'jawabannya membawa `moderated: true`; bawaannya langsung tampil.',
        requestBody: body({
          type: 'object',
          required: ['ra', 'dec', 'name'],
          properties: {
            ra: { type: 'number', minimum: 0, maximum: 23.999 },
            dec: { type: 'number', minimum: -90, maximum: 90 },
            name: { type: 'string', minLength: 2, maxLength: 24 },
            city: { type: 'string', maxLength: 40 },
            note: { type: 'string', maxLength: 60 }
          }
        }),
        responses: {
          201: {
            description: 'Bintang menyala',
            ...json({ type: 'object', properties: { bintang: ref('SkyStar'), moderated: { type: 'boolean' } } })
          },
          409: { description: 'Sumber ini sudah punya bintang.', ...json(ref('Error')) },
          422: err('Validasi'),
          429: err('TerlaluSering')
        }
      }
    },
    '/sky/mine': {
      get: {
        tags: ['Kebersamaan'],
        summary: 'Bintang milik pengunjung ini, kalau ada',
        description:
          'Dipakai situs untuk memutuskan menampilkan tombol "taruh bintang" atau ' +
          'menyorot bintang yang sudah ada. Tidak pernah di-cache: jawabannya ' +
          'berbeda untuk tiap pengunjung.',
        responses: ok('Bintangnya, atau null', {
          allOf: [ref('SkyStar')],
          nullable: true
        })
      }
    },
    '/settings': {
      get: { tags: ['Publik'], summary: 'Pengaturan situs yang publik', responses: ok('Pengaturan', { type: 'object' }) }
    },

    // ── auth ─────────────────────────────────────────────────────────────────
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Masuk dashboard',
        requestBody: body({
          type: 'object',
          required: ['email', 'password'],
          properties: { email: { type: 'string', format: 'email' }, password: { type: 'string' } }
        }),
        responses: {
          ...ok('Berhasil masuk', {
            type: 'object',
            properties: { user: ref('AdminUser'), accessToken: { type: 'string' }, csrfToken: { type: 'string' } }
          }),
          401: err('TidakBerhak'),
          429: err('TerlaluSering')
        }
      }
    },
    '/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Perbarui sesi',
        description: 'Memakai cookie `si_refresh`. Sesi lama dicabut dan diganti yang baru (rotasi).',
        responses: { ...ok('Sesi baru', { type: 'object' }), 401: err('TidakBerhak') }
      }
    },
    '/auth/logout': {
      post: { tags: ['Auth'], summary: 'Keluar dan cabut sesi', responses: ok('Keluar', { type: 'object' }) }
    },
    '/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Profil akun yang sedang masuk',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        responses: { ...ok('Profil', ref('AdminUser')), 401: err('TidakBerhak') }
      }
    },
    '/auth/change-password': {
      post: {
        tags: ['Auth'],
        summary: 'Ganti kata sandi sendiri',
        description: 'Semua sesi lain ikut dicabut.',
        security: [{ cookieAuth: [] }, { bearerAuth: [] }],
        requestBody: body({
          type: 'object',
          required: ['currentPassword', 'newPassword'],
          properties: { currentPassword: { type: 'string' }, newPassword: { type: 'string', minLength: 12 } }
        }),
        responses: { ...ok('Diganti', { type: 'object' }), 401: err('TidakBerhak'), 422: err('Validasi') }
      }
    },

    // ── admin ────────────────────────────────────────────────────────────────
    '/admin/dashboard': {
      get: adminOp({ summary: 'Angka ringkas untuk beranda dashboard', responses: ok('Ringkasan', { type: 'object' }) })
    },
    '/admin/menus': {
      get: adminOp({ summary: 'Semua menu, termasuk yang nonaktif', responses: ok('Daftar', { type: 'array', items: { type: 'object' } }) }),
      post: adminOp({
        summary: 'Tambah menu',
        requestBody: body({ type: 'object' }),
        responses: { 201: { description: 'Dibuat', ...json({ type: 'object' }) } }
      })
    },
    '/admin/menus/reorder': {
      post: adminOp({
        summary: 'Ubah urutan menu',
        description: 'Daftar `order` wajib memuat semua id menu — urutan parsial ditolak.',
        requestBody: body({ type: 'object', properties: { order: { type: 'array', items: { type: 'string' } } } }),
        responses: ok('Urutan baru', { type: 'array', items: { type: 'object' } })
      })
    },
    '/admin/menus/{id}': {
      get: adminOp({ summary: 'Satu menu', parameters: [pId('id', 'program')], responses: { ...ok('Menu', { type: 'object' }), 404: err('TidakAda') } }),
      patch: adminOp({
        summary: 'Ubah menu',
        description:
          'Kirim `items`/`links` sebagai daftar utuh untuk mengganti seluruh isinya. ' +
          'Tidak mengirimnya berarti tidak menyentuhnya; mengirim array kosong berarti mengosongkannya.',
        parameters: [pId('id', 'program')],
        requestBody: body({ type: 'object' }),
        responses: { ...ok('Menu terbaru', { type: 'object' }), 404: err('TidakAda') }
      }),
      delete: adminOp({ summary: 'Hapus menu', parameters: [pId('id', 'karya')], responses: { 204: { description: 'Terhapus' }, 404: err('TidakAda') } })
    },
    '/admin/articles': {
      get: adminOp({
        summary: 'Daftar artikel termasuk draf',
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['draft', 'published', 'archived'] } },
          { name: 'category', in: 'query', schema: { type: 'string' } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          qLimit, qOffset
        ],
        responses: ok('Daftar', { type: 'object', properties: { items: arrayOf('AdminArticle'), total: { type: 'integer' } } })
      }),
      post: adminOp({
        summary: 'Tulis artikel baru',
        description:
          '`bodyHtml` disanitasi sebelum disimpan. Untuk artikel Medium, kirim ' +
          '`source: "medium"` dan `externalUrl`; `bodyHtml` akan diabaikan.',
        requestBody: body(ref('AdminArticle')),
        responses: { 201: { description: 'Dibuat', ...json(ref('AdminArticle')) }, 409: { description: 'Slug bentrok', ...json(ref('Error')) } }
      })
    },
    '/admin/articles/preview': {
      post: adminOp({
        summary: 'Pratinjau hasil sanitasi HTML',
        description: 'Memperlihatkan persis apa yang akan tersimpan, sebelum disimpan.',
        requestBody: body({ type: 'object', properties: { html: { type: 'string' } } }),
        responses: ok('Hasil', { type: 'object', properties: { html: { type: 'string' }, readMinutes: { type: 'integer' }, excerpt: { type: 'string' } } })
      })
    },
    '/admin/articles/{id}': {
      get: adminOp({ summary: 'Satu artikel', parameters: [pId('id', 'uuid')], responses: { ...ok('Artikel', ref('AdminArticle')), 404: err('TidakAda') } }),
      patch: adminOp({ summary: 'Ubah artikel', parameters: [pId('id', 'uuid')], requestBody: body(ref('AdminArticle')), responses: { ...ok('Terbaru', ref('AdminArticle')), 404: err('TidakAda') } }),
      delete: adminOp({ summary: 'Hapus artikel', parameters: [pId('id', 'uuid')], responses: { 204: { description: 'Terhapus' }, 404: err('TidakAda') } })
    },
    '/admin/agenda': {
      get: adminOp({ summary: 'Semua agenda', responses: ok('Daftar', arrayOf('AgendaEvent')) }),
      post: adminOp({ summary: 'Tambah agenda', requestBody: body(ref('AgendaEvent')), responses: { 201: { description: 'Dibuat', ...json(ref('AgendaEvent')) } } })
    },
    '/admin/agenda/{id}': {
      patch: adminOp({ summary: 'Ubah agenda', parameters: [pId('id', 'meetup-12')], requestBody: body(ref('AgendaEvent')), responses: { ...ok('Terbaru', ref('AgendaEvent')), 404: err('TidakAda') } }),
      delete: adminOp({ summary: 'Hapus agenda', parameters: [pId('id', 'meetup-12')], responses: { 204: { description: 'Terhapus' }, 404: err('TidakAda') } })
    },
    '/admin/sparing': {
      get: adminOp({
        summary: 'Antrean moderasi sparing',
        parameters: [{ name: 'status', in: 'query', schema: { type: 'string', enum: ['pending', 'approved', 'rejected'] } }, qLimit, qOffset],
        responses: ok('Daftar', { type: 'object' })
      })
    },
    '/admin/sparing/{id}': {
      patch: adminOp({ summary: 'Setujui atau tolak sparing', parameters: [pId('id', 'uuid')], requestBody: body({ type: 'object', properties: { status: { type: 'string', enum: ['pending', 'approved', 'rejected'] } } }), responses: { ...ok('Status baru', { type: 'object' }), 404: err('TidakAda') } }),
      delete: adminOp({ summary: 'Hapus sparing', parameters: [pId('id', 'uuid')], responses: { 204: { description: 'Terhapus' } } })
    },
    '/admin/sky': {
      get: adminOp({
        summary: 'Semua bintang komunitas, termasuk yang belum disetujui',
        parameters: [{ name: 'status', in: 'query', schema: { type: 'string', enum: ['pending', 'approved', 'rejected'] } }, qLimit, qOffset],
        responses: ok('Daftar', { type: 'object' })
      })
    },
    '/admin/sky/{id}': {
      patch: adminOp({
        summary: 'Setujui atau tolak bintang',
        description: 'Mengubah status membatalkan cache daftar publik.',
        parameters: [pId('id', 'uuid')],
        requestBody: body({ type: 'object', properties: { status: { type: 'string', enum: ['pending', 'approved', 'rejected'] } } }),
        responses: { ...ok('Status baru', { type: 'object' }), 404: err('TidakAda') }
      }),
      delete: adminOp({
        summary: 'Hapus bintang',
        description: 'Sumbernya boleh menaruh bintang baru setelah ini.',
        parameters: [pId('id', 'uuid')],
        responses: { 204: { description: 'Terhapus' } }
      })
    },
    '/admin/submissions': {
      get: adminOp({ summary: 'Pendaftaran Gabung', parameters: [{ name: 'status', in: 'query', schema: { type: 'string', enum: ['new', 'contacted', 'archived'] } }, qLimit, qOffset], responses: ok('Daftar', { type: 'object' }) })
    },
    '/admin/submissions/{id}': {
      patch: adminOp({ summary: 'Ubah status pendaftaran', parameters: [pId('id', 'uuid')], requestBody: body({ type: 'object' }), responses: ok('Terbaru', { type: 'object' }) }),
      delete: adminOp({ summary: 'Hapus pendaftaran', parameters: [pId('id', 'uuid')], responses: { 204: { description: 'Terhapus' } } })
    },
    '/admin/taxonomy': {
      get: adminOp({ summary: 'Kategori dan frekuensi', responses: ok('Taksonomi', { type: 'object' }) })
    },
    '/admin/taxonomy/categories': {
      put: adminOp({ summary: 'Tambah atau ubah kategori', requestBody: body({ type: 'object' }), responses: ok('Kategori', { type: 'object' }) })
    },
    '/admin/taxonomy/categories/{id}': {
      delete: adminOp({
        summary: 'Hapus kategori',
        description: 'Ditolak kalau masih ada artikel yang memakainya.',
        parameters: [pId('id', 'teknis')],
        responses: { 204: { description: 'Terhapus' }, 409: { description: 'Masih dipakai', ...json(ref('Error')) } }
      })
    },
    '/admin/taxonomy/frequencies': {
      put: adminOp({ summary: 'Tambah atau ubah frekuensi sparing', requestBody: body({ type: 'object' }), responses: ok('Frekuensi', { type: 'object' }) })
    },
    '/admin/settings': {
      get: adminOp({ summary: 'Semua pengaturan', responses: ok('Pengaturan', { type: 'object' }) })
    },
    '/admin/settings/{id}': {
      put: adminOp({ summary: 'Ubah satu pengaturan', parameters: [pId('id', 'insight.fresh_days')], requestBody: body({ type: 'object', properties: { value: {} } }), responses: ok('Tersimpan', { type: 'object' }) })
    },
    '/admin/media': {
      get: adminOp({ summary: 'Daftar berkas terunggah', parameters: [qLimit, qOffset], responses: ok('Daftar', { type: 'object' }) }),
      post: adminOp({
        summary: 'Unggah gambar',
        description: 'Maksimal 4 MB. Hanya JPG, PNG, WebP, GIF, AVIF.',
        requestBody: {
          required: true,
          content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } } }
        },
        responses: { 201: { description: 'Terunggah', ...json({ type: 'object' }) }, 415: { description: 'Jenis berkas ditolak', ...json(ref('Error')) } }
      })
    },
    '/admin/media/{id}': {
      delete: adminOp({ summary: 'Hapus berkas', parameters: [pId('id', 'uuid')], responses: { 204: { description: 'Terhapus' } } })
    },
    '/admin/audit': {
      get: adminOp({
        summary: 'Jejak audit aksi admin',
        description:
          'Setiap baris membawa `changes`: medan yang berubah beserta nilai lama dan barunya. ' +
          'Nilai panjang dipotong, dan medan bernama password selalu tercatat sebagai [disunting].',
        parameters: [
          { name: 'entity', in: 'query', schema: { type: 'string' } },
          { name: 'action', in: 'query', schema: { type: 'string' } },
          { name: 'actorEmail', in: 'query', schema: { type: 'string', format: 'email' } },
          qLimit, qOffset
        ],
        responses: ok('Daftar', { type: 'object' })
      })
    },
    '/admin/users': {
      get: adminOp({ summary: 'Daftar akun admin (owner)', responses: ok('Daftar', arrayOf('AdminUser')) }),
      post: adminOp({ summary: 'Tambah akun admin (owner)', requestBody: body({ type: 'object' }), responses: { 201: { description: 'Dibuat', ...json(ref('AdminUser')) } } })
    },
    '/admin/users/{id}': {
      patch: adminOp({ summary: 'Ubah akun admin (owner)', parameters: [pId('id', 'uuid')], requestBody: body({ type: 'object' }), responses: ok('Terbaru', ref('AdminUser')) }),
      delete: adminOp({ summary: 'Hapus akun admin (owner)', parameters: [pId('id', 'uuid')], responses: { 204: { description: 'Terhapus' } } })
    },
    '/admin/monitor': {
      get: adminOp({
        summary: 'Ikhtisar keamanan + kesehatan database (owner)',
        description:
          'Ringkasan kejadian keamanan, deret 14 hari, sumber paling aktif, status ' +
          'database, dan penilaian ringkas yang bisa dibaca sekilas.',
        parameters: [{ name: 'jam', in: 'query', schema: { type: 'integer', default: 24, maximum: 720 } }],
        responses: ok('Ikhtisar', { type: 'object' })
      })
    },
    '/admin/monitor/events': {
      get: adminOp({
        summary: 'Daftar kejadian keamanan (owner)',
        description:
          'Setiap penolakan, kegagalan, dan galat yang tercatat: login gagal, batas laju, ' +
          'CSRF ditolak, origin ditolak, galat server. IP disimpan sebagai hash bergaram, ' +
          'tidak pernah mentah.',
        parameters: [
          { name: 'kind', in: 'query', schema: { type: 'string' }, example: 'login_failed' },
          { name: 'severity', in: 'query', schema: { type: 'string', enum: ['info', 'notice', 'warning', 'critical'] } },
          { name: 'jam', in: 'query', schema: { type: 'integer' } },
          qLimit, qOffset
        ],
        responses: ok('Daftar kejadian', { type: 'object' })
      })
    },
    '/admin/monitor/database': {
      get: adminOp({
        summary: 'Kesehatan PostgreSQL (owner)',
        description:
          'Ukuran, koneksi, rasio cache, deadlock, ukuran tiap tabel beserta rasio baris ' +
          'mati, kueri yang berjalan lama, dan indeks yang belum pernah terpakai.',
        responses: ok('Kesehatan database', { type: 'object' })
      })
    },
    '/admin/cache/clear': {
      post: adminOp({ summary: 'Kosongkan cache (owner)', responses: ok('Dikosongkan', { type: 'object' }) })
    }
  }
};
