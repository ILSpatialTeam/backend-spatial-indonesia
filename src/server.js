// Titik masuk proses. Berkas ini yang mengenal dunia luar: soket, sinyal, dan
// tugas berkala. Semua yang lain (app.js ke bawah) tidak tahu ia dijalankan
// sebagai server — itu yang membuatnya bisa diuji tanpa membuka port.
import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './shared/logger.js';
import { checkConnection, closePool } from './infrastructure/db/pool.js';
import { status as migrationStatus } from './infrastructure/db/migrator.js';

const SEHARI = 86_400_000;

const { app, container } = createApp();

try {
  const info = await checkConnection();
  logger.info({ database: info.db }, 'terhubung ke Postgres');

  // Menjalankan aplikasi di atas skema yang belum lengkap menghasilkan galat
  // "column does not exist" yang membingungkan di tengah pemakaian. Lebih baik
  // diberi tahu di baris pertama log.
  const belum = (await migrationStatus()).filter((m) => !m.applied);
  if (belum.length) {
    logger.error(
      { belum: belum.map((m) => `${m.version}_${m.name}`) },
      'ada migrasi yang belum dijalankan — jalankan `npm run migrate`'
    );
    process.exit(1);
  }
} catch (err) {
  logger.error({ err }, 'gagal terhubung ke Postgres');
  process.exit(1);
}

const server = app.listen(env.PORT, () => {
  logger.info(
    { port: env.PORT, env: env.NODE_ENV },
    `siap — API ${env.PUBLIC_URL}/api/v1 · docs ${env.PUBLIC_URL}/docs · admin ${env.PUBLIC_URL}/admin`
  );
});

// Permintaan yang menggantung terlalu lama menahan koneksi database. Batas ini
// membebaskannya, dan sedikit lebih longgar dari timeout klien pada umumnya.
server.headersTimeout = 65_000;
server.requestTimeout = 60_000;

// ── tugas berkala ───────────────────────────────────────────────────────────
// Dua pembersihan yang kalau tidak dijalankan akan membuat tabel tumbuh tanpa
// pernah dibaca. Dijalankan di dalam proses karena ongkosnya sepele; kalau
// nanti instansnya lebih dari satu, ini yang pindah ke tugas terjadwal
// tersendiri supaya tidak berjalan berkali-kali.
const bersihkan = async () => {
  try {
    const sesi = await container.repos.sessions.pruneExpired();
    const jejak = await container.repos.presence.prune(new Date(Date.now() - 30 * SEHARI));
    if (sesi || jejak) logger.info({ sesi, jejak }, 'pembersihan berkala');
  } catch (err) {
    logger.warn({ err }, 'pembersihan berkala gagal');
  }
};
const timerBersih = setInterval(bersihkan, 6 * 3600_000);
// unref: timer ini tidak boleh jadi alasan proses menolak berhenti.
timerBersih.unref();
setTimeout(bersihkan, 10_000).unref();

// ── berhenti dengan rapi ────────────────────────────────────────────────────
// Tanpa ini, deploy ulang memutus permintaan yang sedang berjalan di tengah
// jalan — termasuk yang sedang menulis ke database.
let sedangTutup = false;
const tutup = async (sinyal) => {
  if (sedangTutup) return;
  sedangTutup = true;
  logger.info({ sinyal }, 'menutup server…');

  const paksa = setTimeout(() => {
    logger.error('koneksi tidak selesai dalam 10 detik — dipaksa berhenti');
    process.exit(1);
  }, 10_000);
  paksa.unref();

  // Koneksi SSE tidak akan tertutup sendiri — `server.close()` menunggu semua
  // request selesai, dan aliran presence memang dirancang tidak pernah selesai.
  // Tanpa ini, setiap deploy menggantung sampai batas paksa 10 detik.
  container.presenceHub?.tutup();

  server.close(async () => {
    clearInterval(timerBersih);
    await closePool().catch(() => {});
    logger.info('selesai.');
    process.exit(0);
  });
};

process.on('SIGTERM', () => tutup('SIGTERM'));
process.on('SIGINT', () => tutup('SIGINT'));

process.on('unhandledRejection', (err) => {
  logger.error({ err }, 'promise ditolak tanpa penangan');
});
process.on('uncaughtException', (err) => {
  // Setelah galat tak tertangkap, keadaan proses tidak lagi bisa dipercaya.
  // Dicatat, lalu ditutup — bukan dibiarkan jalan dengan setengah keadaan.
  logger.fatal({ err }, 'galat tak tertangkap — proses ditutup');
  tutup('uncaughtException');
});
