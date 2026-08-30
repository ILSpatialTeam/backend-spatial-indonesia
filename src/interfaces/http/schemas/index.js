import { z } from 'zod';

// Skema validasi. Kumpulnya di satu berkas supaya bentuk yang sama dipakai
// ulang, bukan diketik ulang sedikit berbeda di tiap rute — dan supaya dokumen
// Swagger bisa dibangkitkan dari sumber yang sama dengan yang benar-benar
// memvalidasi (lihat openapi/schema-bridge.js).
const HEX = /^#[0-9a-fA-F]{6}$/;
const ID_SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;

export const idSlug = z.string().regex(ID_SLUG, 'Hanya huruf kecil, angka, dan tanda hubung.');
export const uuid = z.string().uuid('Bukan UUID yang valid.');
export const hexColor = z.string().regex(HEX, 'Warna harus format #rrggbb.');

export const pagination = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0)
});

// ── publik ──────────────────────────────────────────────────────────────────
export const articleListQuery = pagination.extend({
  category: idSlug.optional()
});

export const slugParam = z.object({ slug: idSlug });
export const idParam = z.object({ id: z.string().min(1).max(80) });
export const uuidParam = z.object({ id: uuid });

export const sparingBody = z.object({
  frequencyId: idSlug,
  authorName: z.string().trim().min(2, 'Nama minimal 2 huruf.').max(60),
  text: z.string().trim().min(8, 'Tulis minimal 8 karakter.').max(2000),
  // Posisi orbit satelit di scene. Dibatasi supaya tidak ada satelit yang
  // terlempar ke luar cincin oleh nilai kiriman.
  anchor: z.tuple([z.number().int().min(0).max(8), z.number().int().min(0).max(2)]).optional()
});

export const presenceBody = z.object({
  path: z.array(idSlug).min(1).max(12)
});

// Laporan posisi dari klien presence live. `id` diberikan server lewat SSE.
export const hereBody = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{8}$/, 'Id presence tidak valid.'),
  planet: idSlug.nullish()
});

export const joinBody = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email('Alamat email tidak valid.').max(160),
  focus: z.string().trim().max(80).optional().default(''),
  message: z.string().trim().max(1000).optional().default('')
});

// ── langit komunitas ────────────────────────────────────────────────────────
export const starBody = z.object({
  // Right ascension dalam jam, declination dalam derajat — sama dengan sistem
  // koordinat rasi bawaan di frontend.
  ra: z.coerce.number().min(0).max(23.999),
  dec: z.coerce.number().min(-90).max(90),
  name: z.string().trim().min(2, 'Nama minimal 2 huruf.').max(24),
  city: z.string().trim().max(40).optional().default(''),
  note: z.string().trim().max(60).optional().default('')
});

export const starQuery = pagination.extend({
  status: z.enum(['pending', 'approved', 'rejected']).optional()
});

// ── autentikasi ─────────────────────────────────────────────────────────────
export const loginBody = z.object({
  email: z.string().trim().email().max(160),
  password: z.string().min(1).max(200)
});

// Kata sandi admin: panjang lebih menentukan daripada ragam karakter, jadi
// batas bawahnya 12 dan tidak ada kewajiban simbol. Aturan "harus ada simbol"
// justru mendorong orang membuat pola yang mudah ditebak.
export const passwordField = z.string().min(12, 'Kata sandi minimal 12 karakter.').max(200);

export const changePasswordBody = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordField
});

// ── artikel (admin) ─────────────────────────────────────────────────────────
const articleBase = {
  title: z.string().trim().min(3).max(200),
  slug: idSlug.optional(),
  no: z.string().trim().max(10).optional(),
  categoryId: idSlug,
  lead: z.string().trim().max(400).optional(),
  author: z.string().trim().max(120).optional(),
  coverUrl: z.string().url().max(500).nullish(),
  source: z.enum(['internal', 'medium']).default('internal'),
  externalUrl: z.string().url().max(500).nullish(),
  bodyHtml: z.string().max(200_000).optional(),
  readMinutes: z.coerce.number().int().min(1).max(120).optional(),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
  publishedAt: z.coerce.date().nullish()
};

// Aturan silang yang tidak bisa dinyatakan per field: artikel Medium wajib
// punya tautan. Ditaruh di skema, bukan di service, supaya pesannya menempel
// pada field yang salah dan dashboard bisa menyorotinya.
const wajibTautanMedium = (data, ctx) => {
  if (data.source === 'medium' && !data.externalUrl) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['externalUrl'],
      message: 'Artikel Medium wajib punya tautan.'
    });
  }
};

export const articleCreateBody = z.object(articleBase).superRefine(wajibTautanMedium);

export const articleUpdateBody = z
  .object(articleBase)
  .partial()
  .superRefine((data, ctx) => {
    if (data.source === 'medium') wajibTautanMedium(data, ctx);
  });

export const articleAdminQuery = pagination.extend({
  status: z.enum(['draft', 'published', 'archived']).optional(),
  category: idSlug.optional(),
  search: z.string().trim().max(120).optional()
});

export const previewBody = z.object({ html: z.string().max(200_000) });

// ── menu (admin) ────────────────────────────────────────────────────────────
export const menuItemBody = z.object({
  k: z.string().trim().max(80).default(''),
  t: z.string().trim().max(160).nullish(),
  d: z.string().trim().max(600).default('')
});

export const menuLinkBody = z.object({
  label: z.string().trim().min(1).max(60),
  url: z.string().trim().max(400).regex(/^(https?:\/\/|mailto:|#)/, 'URL harus http(s), mailto, atau #anchor.')
});

const menuBase = {
  kind: z.enum(['core', 'planet']),
  label: z.string().trim().min(1).max(80),
  no: z.string().trim().min(1).max(6),
  tag: z.string().trim().min(1).max(40),
  accent: hexColor,
  title: z.string().trim().min(1).max(200),
  lead: z.string().trim().max(600),
  bodyHtml: z.string().max(60_000).optional(),
  isActive: z.boolean().optional(),
  position: z.number().int().min(0).max(50).optional(),
  orbit: z.number().min(1).max(200).nullish(),
  size: z.number().min(0.1).max(20).nullish(),
  color: z.number().int().min(0).max(0xffffff).nullish(),
  speed: z.number().min(0).max(5).nullish(),
  phase: z.number().min(0).max(Math.PI * 2).nullish(),
  tilt: z.number().min(-1.6).max(1.6).nullish(),
  skin: z.string().trim().max(40).nullish(),
  hasRing: z.boolean().optional(),
  icon: z.object({ file: z.string().trim().max(40), from: hexColor, to: hexColor }).optional(),
  items: z.array(menuItemBody).max(30).optional(),
  links: z.array(menuLinkBody).max(12).optional()
};

export const menuCreateBody = z.object({ id: idSlug, ...menuBase }).superRefine((data, ctx) => {
  if (data.kind !== 'planet') return;
  for (const kunci of ['orbit', 'size', 'color', 'speed', 'phase', 'tilt', 'skin']) {
    if (data[kunci] === undefined || data[kunci] === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [kunci], message: 'Wajib diisi untuk menu berjenis planet.' });
    }
  }
  if (!data.icon) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['icon'], message: 'Ikon planet wajib diisi.' });
  }
});

export const menuUpdateBody = z.object(menuBase).partial();

export const reorderBody = z.object({ order: z.array(idSlug).min(1).max(50) });

// ── agenda (admin) ──────────────────────────────────────────────────────────
const tanggal = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal YYYY-MM-DD.');
const jam = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Format jam HH:MM.');

// Bentuk dasarnya dipisah dari aturan silangnya dengan sengaja: `.refine()`
// menghasilkan ZodEffects, dan ZodEffects tidak punya `.partial()`. Kalau
// keduanya digabung, varian PATCH di bawah tidak bisa dibuat tanpa mengintip
// isi `_def` — bentuk yang pecah diam-diam saat zod naik versi.
const agendaBase = z.object({
  id: idSlug.optional(),
  kind: z.string().trim().min(2).max(30),
  title: z.string().trim().min(3).max(200),
  date: tanggal,
  startsAt: jam.nullish(),
  endsAt: jam.nullish(),
  place: z.string().trim().max(120).optional(),
  address: z.string().trim().max(300).optional(),
  note: z.string().trim().max(600).optional(),
  // Uraian panjang dari editor WYSIWYG. Batasnya dihitung atas HTML mentah,
  // jadi longgar: satu paragraf berformat mudah tiga kali lebih panjang
  // daripada teksnya sendiri.
  descriptionHtml: z.string().max(20_000).optional(),
  url: z.string().url().max(400).nullish(),
  registration: z.enum(['none', 'internal', 'external']).optional(),
  registerUrl: z.string().url().max(400).nullish(),
  // `coerce` karena formulir dashboard mengirim string. NULL tetap NULL —
  // itulah "tanpa batas", dan ia harus bisa melewati coerce tanpa jadi 0.
  capacity: z.coerce.number().int().min(0).max(100_000).nullish(),
  registrationClosesAt: tanggal.nullish(),
  isPublished: z.boolean().optional()
});

// Aturan silang, dipasang ke create dan update lewat satu fungsi supaya
// keduanya tidak bisa menyimpang. Yang sama juga dijaga CHECK di database;
// diperiksa di sini juga supaya admin dapat pesan yang menyebut field-nya,
// bukan nama constraint Postgres.
//
// Aturan jam dan tanggal menoleransi field yang tidak ada, karena PATCH boleh
// mengirim sebagian saja.
//
// Yang TIDAK boleh disamakan antara keduanya adalah tautan pendaftaran. Pada
// pembuatan, acara 'external' tanpa tautan memang tidak sah dan harus ditolak
// di sini — kalau dibiarkan lolos, yang menolaknya jadi CHECK di database
// dengan pesan "Nilai melanggar aturan data" yang tidak menyebut field mana
// pun. Pada perubahan, `registerUrl` yang tidak dikirim berarti "biarkan yang
// sudah tersimpan", dan itu sah: admin boleh memindahkan acara ke mode
// external tanpa mengetik ulang tautan yang sudah ada. Kombinasi terakhir itu
// yang hanya bisa diperiksa database, dan memang di sanalah tempatnya.
const aturanAgenda = (schema, { tautanWajib }) => schema
  .refine(
    (d) => d.registration !== 'external' ||
      (!tautanWajib && d.registerUrl === undefined) ||
      !!String(d.registerUrl ?? '').trim(),
    { path: ['registerUrl'], message: 'Acara dengan pendaftaran pihak ketiga wajib punya tautan.' }
  )
  .refine((d) => !d.endsAt || !d.startsAt || d.endsAt > d.startsAt, {
    path: ['endsAt'], message: 'Jam selesai harus setelah jam mulai.'
  })
  .refine((d) => !d.registrationClosesAt || !d.date || d.registrationClosesAt <= d.date, {
    path: ['registrationClosesAt'], message: 'Penutupan pendaftaran tidak boleh setelah tanggal acara.'
  });

export const agendaCreateBody = aturanAgenda(
  // Acara baru tanpa mode pendaftaran dianggap terbuka, sama dengan DEFAULT
  // kolomnya. Tanpa ini, aturan "external wajib punya tautan" tidak pernah
  // punya nilai untuk diperiksa saat admin lupa memilih.
  agendaBase.extend({ registration: z.enum(['none', 'internal', 'external']).default('none') }),
  { tautanWajib: true }
);

export const agendaUpdateBody = aturanAgenda(
  agendaBase.partial().omit({ id: true }),
  { tautanWajib: false }
);

// ── pendaftaran acara (publik) ──────────────────────────────────────────────
//
// Sengaja pendek. Tiap field tambahan adalah satu alasan lagi untuk menutup
// formulir tanpa mengisinya, dan panitia selalu bisa menanyakan sisanya lewat
// email yang sudah dikumpulkan di sini.
export const eventRegisterBody = z.object({
  name: z.string().trim().min(2, 'Nama minimal 2 huruf.').max(80),
  email: z.string().trim().email('Alamat email tidak valid.').max(160),
  phone: z.string().trim().max(32).optional().default(''),
  note: z.string().trim().max(500).optional().default('')
});

// ── tim (admin) ────────────────────────────────────────────────────────────
export const teamCreateBody = z.object({
  name: z.string().trim().min(2, 'Nama minimal 2 huruf.').max(80),
  role: z.string().trim().min(2, 'Peran minimal 2 huruf.').max(120),
  photoUrl: z.string().url().max(500).nullish(),
  sortOrder: z.coerce.number().int().min(0).max(100).default(0),
  isActive: z.boolean().default(true)
});

export const teamUpdateBody = teamCreateBody.partial();

export const teamReorderBody = z.object({ order: z.array(uuid).min(1).max(50) });

// ── program (admin) ────────────────────────────────────────────────────────
export const programCreateBody = z.object({
  title: z.string().trim().min(2, 'Judul minimal 2 huruf.').max(120),
  subtitle: z.string().trim().max(80).optional().default(''),
  description: z.string().trim().max(600).optional().default(''),
  sortOrder: z.coerce.number().int().min(0).max(100).default(0),
  isActive: z.boolean().default(true)
});

export const programUpdateBody = programCreateBody.partial();

export const programReorderBody = z.object({ order: z.array(uuid).min(1).max(50) });

// ── proyek karya (admin) ───────────────────────────────────────────────────
export const projectCategoryBody = z.object({
  id: idSlug.optional(),
  label: z.string().trim().min(1).max(60),
  sortOrder: z.number().int().min(0).max(100).optional()
});

export const projectCreateBody = z.object({
  title: z.string().trim().min(2, 'Judul minimal 2 huruf.').max(200),
  description: z.string().trim().max(2000).optional().default(''),
  memberName: z.string().trim().min(2, 'Nama anggota minimal 2 huruf.').max(80),
  imageUrl: z.string().url().max(500).nullish(),
  categoryId: idSlug.nullish(),
  type: z.string().trim().max(40).optional().default(''),
  sortOrder: z.coerce.number().int().min(0).max(100).default(0),
  isActive: z.boolean().default(true)
});

export const projectUpdateBody = projectCreateBody.partial();

export const projectReorderBody = z.object({ order: z.array(uuid).min(1).max(50) });

// ── moderasi & lainnya ──────────────────────────────────────────────────────
export const moderationQuery = pagination.extend({
  status: z.enum(['pending', 'approved', 'rejected']).optional()
});

export const moderationBody = z.object({ status: z.enum(['pending', 'approved', 'rejected']) });

export const submissionQuery = pagination.extend({
  status: z.enum(['new', 'contacted', 'archived']).optional()
});

export const submissionBody = z.object({ status: z.enum(['new', 'contacted', 'archived']) });

export const categoryBody = z.object({
  id: idSlug.optional(),
  label: z.string().trim().min(1).max(60),
  color: hexColor,
  position: z.number().int().min(0).max(100).optional()
});

export const frequencyBody = z.object({
  id: idSlug.optional(),
  label: z.string().trim().min(1).max(60),
  glyph: z.string().trim().min(1).max(4),
  color: hexColor,
  hint: z.string().trim().max(300),
  position: z.number().int().min(0).max(100).optional()
});

export const settingBody = z.object({ value: z.unknown() });

export const userCreateBody = z.object({
  email: z.string().trim().email().max(160),
  name: z.string().trim().min(2).max(80),
  password: passwordField,
  role: z.enum(['owner', 'editor']).default('editor')
});

export const userUpdateBody = z.object({
  email: z.string().trim().email().max(160).optional(),
  name: z.string().trim().min(2).max(80).optional(),
  password: passwordField.optional(),
  role: z.enum(['owner', 'editor']).optional(),
  isActive: z.boolean().optional()
});

export const auditQuery = pagination.extend({
  entity: z.string().trim().max(40).optional(),
  action: z.string().trim().max(40).optional(),
  actorEmail: z.string().trim().email().max(160).optional()
});

// ── pemantauan ──────────────────────────────────────────────────────────────
export const monitorQuery = z.object({
  jam: z.coerce.number().int().min(1).max(720).default(24)
});

export const eventQuery = pagination.extend({
  kind: z.string().trim().max(40).optional(),
  severity: z.enum(['info', 'notice', 'warning', 'critical']).optional(),
  jam: z.coerce.number().int().min(1).max(8760).optional()
});
