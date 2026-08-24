#!/usr/bin/env node
// Isi database dengan data awal, lalu pastikan ada satu akun admin.
//
// Dua langkah ini digabung karena database yang terisi konten tapi tanpa akun
// admin tidak bisa dipakai sama sekali — dan itu adalah hal pertama yang orang
// temukan saat mencoba membuka dashboard.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { env } from '../src/config/env.js';
import { pool, closePool, checkConnection } from '../src/infrastructure/db/pool.js';
import { BcryptPasswordHasher } from '../src/infrastructure/security/hashing.js';
import { PgAdminUserRepository } from '../src/infrastructure/repositories/admin.pg.js';

const SEED = fileURLToPath(new URL('../db/seed.sql', import.meta.url));

const jalan = async () => {
  const info = await checkConnection();
  console.log(`database: ${info.db}\n`);

  console.log('Memuat db/seed.sql…');
  const sql = await readFile(SEED, 'utf8');
  // Berkasnya sudah membungkus dirinya dalam BEGIN/COMMIT, jadi dikirim
  // sebagai satu perintah — kalau ada satu INSERT yang gagal, tidak ada
  // separuh isi yang tertinggal.
  await pool.query(sql);
  console.log('  konten awal terpasang.');

  const users = new PgAdminUserRepository({ query: (t, p) => pool.query(t, p) });
  if (await users.count()) {
    console.log('  akun admin sudah ada — tidak diubah.');
    return;
  }

  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
    console.log('\n  Belum ada akun admin, dan ADMIN_EMAIL/ADMIN_PASSWORD kosong di .env.');
    console.log('  Buat manual dengan: npm run admin:create -- <email> <nama> <kata-sandi>');
    return;
  }

  const hasher = new BcryptPasswordHasher();
  const user = await users.create({
    email: env.ADMIN_EMAIL.toLowerCase(),
    name: env.ADMIN_NAME || 'Administrator',
    passwordHash: await hasher.hash(env.ADMIN_PASSWORD),
    // Akun pertama selalu owner: tanpa satu pun owner, tidak ada yang bisa
    // membuat akun berikutnya.
    role: 'owner'
  });
  console.log(`  akun owner dibuat: ${user.email}`);
  if (env.ADMIN_PASSWORD.startsWith('Ubah-Password')) {
    console.log('\n  ⚠ Kata sandinya masih nilai contoh dari .env.example. Ganti sekarang.');
  }
};

try {
  await jalan();
  console.log('\nselesai.');
} catch (err) {
  console.error(`\ngagal: ${err.message}`);
  process.exitCode = 1;
} finally {
  await closePool();
}
