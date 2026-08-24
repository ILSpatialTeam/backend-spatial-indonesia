// Pool koneksi Postgres + pembungkus tipis untuk query dan transaksi.
//
// Repositori tidak pernah memegang `pg.Pool` langsung; mereka menerima objek
// dengan method `query` — bisa pool, bisa client di dalam transaksi. Itu yang
// membuat satu repositori yang sama bisa dipakai di dalam maupun di luar
// transaksi tanpa cabang kode.
import pg from 'pg';
import { env } from '../../config/env.js';
import { logger } from '../../shared/logger.js';

// Postgres mengembalikan DATE sebagai objek Date di zona waktu server, dan itu
// menggeser tanggal acara ke H-1 bagi sebagian pengguna. Agenda kita hanya
// butuh "2026-08-30" apa adanya, jadi tipe 1082 (date) dibaca sebagai string.
pg.types.setTypeParser(1082, (v) => v);
// NUMERIC default-nya jadi string supaya presisi tidak hilang. Untuk kolom
// orbit/size/speed kita justru butuh angka — three.js tidak menerima string.
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
// BIGINT (view_count) muat di Number selama di bawah 2^53; pembacaan artikel
// tidak akan mendekati itu.
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.PGSSL ? { rejectUnauthorized: false } : false,
  max: env.PG_POOL_MAX,
  idleTimeoutMillis: 30_000,
  // Kalau Postgres tidak menjawab dalam 5 detik, lebih baik permintaannya gagal
  // cepat daripada menahan koneksi dan menumpuk antrean.
  connectionTimeoutMillis: 5_000
});

pool.on('error', (err) => {
  // Klien menganggur yang mati (mis. Postgres di-restart) memancarkan ini.
  // Tanpa handler, Node mematikan proses.
  logger.error({ err }, 'koneksi Postgres menganggur bermasalah');
});

const LAMBAT_MS = 300;

export async function query(text, params) {
  const mulai = process.hrtime.bigint();
  try {
    return await pool.query(text, params);
  } finally {
    const ms = Number(process.hrtime.bigint() - mulai) / 1e6;
    // Query lambat dicatat lengkap dengan teksnya. Ini yang paling sering
    // dibutuhkan saat halaman tiba-tiba berat, dan paling menyebalkan kalau
    // baru dipasang setelah masalahnya muncul.
    if (ms > LAMBAT_MS) logger.warn({ ms: Math.round(ms), text }, 'query lambat');
  }
}

// Transaksi dengan rollback otomatis. Callback menerima objek ber-`query` yang
// bentuknya identik dengan pool, jadi repositori tidak perlu tahu bedanya.
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const hasil = await fn({ query: (t, p) => client.query(t, p) });
    await client.query('COMMIT');
    return hasil;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export const db = { query, withTransaction };

export async function closePool() {
  await pool.end();
}

export async function checkConnection() {
  const { rows } = await pool.query('SELECT current_database() AS db, version() AS versi');
  return rows[0];
}
