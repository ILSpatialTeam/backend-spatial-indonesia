// Sistem migrasi. Sengaja ditulis sendiri, bukan memakai pustaka.
//
// Alasannya: yang diminta adalah berkas .sql murni yang bisa dibaca dan
// dijalankan lewat psql tanpa perantara. Pustaka migrasi umumnya menyimpan
// migrasi sebagai kode JS atau format khususnya sendiri. Yang kita butuhkan
// hanya tiga hal — urutan, catatan apa yang sudah jalan, dan transaksi — dan
// ketiganya muat dalam berkas sepanjang ini.
//
// Format berkas: satu migrasi = satu .sql, dipisah penanda komentar
//   -- migrate:up      ... perintah maju
//   -- migrate:down    ... perintah mundur
// Penanda itu komentar SQL biasa, jadi `psql -f 0002_menus.sql` tetap jalan
// (hanya saja bagian down ikut terjalankan — untuk itu ada db/schema.sql).
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';

const DIR = fileURLToPath(new URL('../../../db/migrations/', import.meta.url));

const TABEL = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version     text PRIMARY KEY,
    name        text NOT NULL,
    checksum    text NOT NULL,
    applied_at  timestamptz NOT NULL DEFAULT now(),
    duration_ms integer NOT NULL DEFAULT 0
  );
`;

function pisah(isi, berkas) {
  const up = /^--\s*migrate:up\s*$/m;
  const down = /^--\s*migrate:down\s*$/m;
  const iUp = isi.search(up);
  if (iUp === -1) throw new Error(`${berkas}: penanda "-- migrate:up" tidak ada`);
  const iDown = isi.search(down);
  const setelahUp = isi.slice(iUp).replace(up, '');
  if (iDown === -1) return { up: setelahUp.trim(), down: '' };
  const potong = setelahUp.search(down);
  return {
    up: setelahUp.slice(0, potong).trim(),
    down: setelahUp.slice(potong).replace(down, '').trim()
  };
}

export async function loadMigrations() {
  const berkas = (await readdir(DIR)).filter((f) => f.endsWith('.sql')).sort();
  return Promise.all(
    berkas.map(async (f) => {
      const isi = await readFile(path.join(DIR, f), 'utf8');
      const [version, ...sisa] = f.replace(/\.sql$/, '').split('_');
      return {
        version,
        name: sisa.join('_') || version,
        file: f,
        checksum: createHash('sha256').update(isi).digest('hex').slice(0, 16),
        ...pisah(isi, f)
      };
    })
  );
}

async function terpasang(client) {
  await client.query(TABEL);
  const { rows } = await client.query('SELECT version, name, checksum, applied_at FROM schema_migrations ORDER BY version');
  return rows;
}

export async function status() {
  const client = await pool.connect();
  try {
    const sudah = new Map((await terpasang(client)).map((r) => [r.version, r]));
    return (await loadMigrations()).map((m) => {
      const rec = sudah.get(m.version);
      return {
        version: m.version,
        name: m.name,
        applied: Boolean(rec),
        appliedAt: rec?.applied_at ?? null,
        // Migrasi yang sudah jalan lalu berkasnya diedit adalah sumber
        // ketidaksesuaian yang sulit dilacak: database dua orang jadi berbeda
        // padahal versinya sama. Lebih baik diteriaki sekarang.
        drifted: Boolean(rec) && rec.checksum !== m.checksum
      };
    });
  } finally {
    client.release();
  }
}

export async function up({ log = console.log } = {}) {
  const client = await pool.connect();
  const dijalankan = [];
  try {
    const sudah = new Map((await terpasang(client)).map((r) => [r.version, r]));
    for (const m of await loadMigrations()) {
      const rec = sudah.get(m.version);
      if (rec) {
        if (rec.checksum !== m.checksum) {
          throw new Error(
            `Migrasi ${m.version}_${m.name} sudah dijalankan tapi isinya berubah.\n` +
            'Jangan menyunting migrasi yang sudah terpasang — buat migrasi baru.'
          );
        }
        continue;
      }
      const mulai = Date.now();
      // Satu migrasi = satu transaksi. Kalau perintah ke-9 gagal, delapan
      // perintah sebelumnya ikut batal dan databasenya tidak setengah jadi.
      await client.query('BEGIN');
      try {
        await client.query(m.up);
        await client.query(
          'INSERT INTO schema_migrations (version, name, checksum, duration_ms) VALUES ($1, $2, $3, $4)',
          [m.version, m.name, m.checksum, Date.now() - mulai]
        );
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migrasi ${m.file} gagal: ${err.message}`, { cause: err });
      }
      log(`  ↑ ${m.version}_${m.name}  (${Date.now() - mulai} ms)`);
      dijalankan.push(m.version);
    }
    if (!dijalankan.length) log('  (tidak ada migrasi baru)');
    return dijalankan;
  } finally {
    client.release();
  }
}

// Mundur satu langkah. Sengaja satu, bukan semua: rollback beruntun tanpa
// diminta adalah cara cepat kehilangan data produksi.
export async function down({ log = console.log } = {}) {
  const client = await pool.connect();
  try {
    const sudah = await terpasang(client);
    const terakhir = sudah[sudah.length - 1];
    if (!terakhir) { log('  (belum ada migrasi terpasang)'); return null; }
    const m = (await loadMigrations()).find((x) => x.version === terakhir.version);
    if (!m) throw new Error(`Berkas migrasi ${terakhir.version} tidak ditemukan.`);
    if (!m.down) throw new Error(`Migrasi ${m.file} tidak punya bagian "-- migrate:down".`);
    await client.query('BEGIN');
    try {
      await client.query(m.down);
      await client.query('DELETE FROM schema_migrations WHERE version = $1', [m.version]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
    log(`  ↓ ${m.version}_${m.name}`);
    return m.version;
  } finally {
    client.release();
  }
}

// Turunkan semuanya lalu naikkan lagi. Hanya untuk pengembangan — skrip
// pemanggilnya yang menolak menjalankan ini di produksi.
export async function reset({ log = console.log } = {}) {
  const client = await pool.connect();
  try {
    const daftar = [...(await loadMigrations())].reverse();
    const sudah = new Set((await terpasang(client)).map((r) => r.version));
    for (const m of daftar) {
      if (!sudah.has(m.version) || !m.down) continue;
      await client.query('BEGIN');
      try {
        await client.query(m.down);
        await client.query('DELETE FROM schema_migrations WHERE version = $1', [m.version]);
        await client.query('COMMIT');
        log(`  ↓ ${m.version}_${m.name}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
  } finally {
    client.release();
  }
  return up({ log });
}
