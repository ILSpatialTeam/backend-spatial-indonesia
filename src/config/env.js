// Satu-satunya tempat yang membaca `process.env`.
//
// Alasannya bukan kerapian semata: kalau setiap modul boleh menyentuh env,
// salah ketik nama variabel baru ketahuan saat fitur itu dipakai — sering kali
// di produksi. Di sini semuanya divalidasi sekali saat start, dan proses
// menolak hidup kalau ada yang kurang. Gagal cepat dan berisik.
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

loadDotenv();

const bool = (fallback) =>
  z.enum(['true', 'false', '1', '0']).default(fallback).transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  PUBLIC_URL: z.string().url().default('http://localhost:4000'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL wajib diisi'),
  PGSSL: bool('false'),
  PG_POOL_MAX: z.coerce.number().int().positive().max(100).default(10),

  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET minimal 16 karakter'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET minimal 16 karakter'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  // Garam terpisah untuk hash IP. Sebelumnya jalur ini menumpang pada
  // JWT_ACCESS_SECRET, dan itu mengikat dua rahasia dengan siklus hidup yang
  // berbeda: merotasi JWT — yang seharusnya rutin — akan memutus seluruh
  // korelasi sumber di halaman Pemantauan tanpa ada yang menyadari kenapa.
  IP_HASH_SALT: z.string().min(16).optional(),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(14),

  CORS_ORIGINS: z.string().default(''),
  // Berapa proxy yang berdiri di depan aplikasi. Angka ini menentukan alamat
  // mana di rantai X-Forwarded-For yang dipercaya sebagai IP asli pengunjung.
  //
  // Salah hitung punya dua akibat yang sama-sama buruk: terlalu kecil dan
  // semua pengunjung terlihat berasal dari IP proxy (satu jatah batas laju
  // untuk semua orang), terlalu besar dan klien bisa memalsukan IP-nya sendiri
  // hanya dengan menambahkan header — pembatas laju jadi tidak berguna.
  //
  //   0  langsung tanpa proxy
  //   1  satu nginx / satu load balancer
  //   2  Cloudflare di depan nginx
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(1),
  COOKIE_SECURE: bool('false'),
  COOKIE_DOMAIN: z.string().optional(),

  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().min(8).optional(),
  ADMIN_NAME: z.string().optional()
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const detail = parsed.error.issues.map((i) => `  • ${i.path.join('.')}: ${i.message}`).join('\n');
  console.error(`Konfigurasi lingkungan tidak valid:\n${detail}\n\nSalin .env.example menjadi .env lalu isi.`);
  process.exit(1);
}

const raw = parsed.data;
const isProd = raw.NODE_ENV === 'production';

// Rahasia contoh tidak boleh lolos ke produksi. Ini pemeriksaan yang murah dan
// menutup salah satu cara paling umum sebuah API dibobol: rahasia dari README.
if (isProd) {
  const lemah = [raw.JWT_ACCESS_SECRET, raw.JWT_REFRESH_SECRET].some((s) => s.startsWith('ganti-saya'));
  if (lemah) {
    console.error('JWT secret masih memakai nilai contoh. Ganti sebelum menjalankan di produksi.');
    process.exit(1);
  }
  if (!raw.COOKIE_SECURE) {
    console.error('COOKIE_SECURE=false di produksi berarti cookie sesi admin bisa dikirim lewat HTTP polos.');
    process.exit(1);
  }
  if (!raw.IP_HASH_SALT) {
    console.error('IP_HASH_SALT wajib diisi di produksi. Bangkitkan dengan:\n  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    process.exit(1);
  }
}

// Di pengembangan garamnya boleh nilai tetap — hash IP di mesin lokal tidak
// melindungi siapa pun, dan memaksa setiap orang membangkitkannya hanya
// menambah langkah pemasangan tanpa menambah keamanan.
const ipHashSalt = raw.IP_HASH_SALT ?? 'garam-pengembangan-tidak-untuk-produksi';

export const env = Object.freeze({
  ...raw,
  ipHashSalt,
  isProd,
  isDev: raw.NODE_ENV === 'development',
  isTest: raw.NODE_ENV === 'test',
  corsOrigins: raw.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
});
