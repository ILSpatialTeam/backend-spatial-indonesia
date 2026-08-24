#!/usr/bin/env node
// CLI migrasi:  npm run migrate | migrate:status | migrate:down
import { env } from '../src/config/env.js';
import { up, down, reset, status } from '../src/infrastructure/db/migrator.js';
import { closePool, checkConnection } from '../src/infrastructure/db/pool.js';

const perintah = process.argv[2] || 'up';

const jalan = async () => {
  const info = await checkConnection();
  console.log(`database: ${info.db}\n`);

  if (perintah === 'up') { console.log('Menjalankan migrasi…'); await up(); return; }

  if (perintah === 'status') {
    const daftar = await status();
    for (const m of daftar) {
      const tanda = m.applied ? (m.drifted ? '!' : '✓') : '·';
      const waktu = m.appliedAt ? new Date(m.appliedAt).toISOString().slice(0, 19).replace('T', ' ') : 'belum';
      console.log(` ${tanda} ${m.version}_${m.name.padEnd(22)} ${waktu}`);
    }
    if (daftar.some((m) => m.drifted)) {
      console.log('\n!  = berkasnya berubah setelah dijalankan. Buat migrasi baru, jangan sunting yang lama.');
    }
    return;
  }

  if (perintah === 'down') { console.log('Membatalkan migrasi terakhir…'); await down(); return; }

  if (perintah === 'reset') {
    if (env.isProd) throw new Error('reset dilarang saat NODE_ENV=production.');
    console.log('Menurunkan semua migrasi lalu menaikkannya lagi…');
    await reset();
    return;
  }

  throw new Error(`Perintah tidak dikenal: ${perintah}. Pilihan: up | down | status | reset`);
};

try {
  await jalan();
  console.log('\nselesai.');
} catch (err) {
  console.error(`\ngagal: ${err.message}`);
  if (err.cause) console.error(err.cause.message);
  process.exitCode = 1;
} finally {
  await closePool();
}
