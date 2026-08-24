#!/usr/bin/env node
// Buat akun admin baru:
//   npm run admin:create -- <email> <nama> <kata-sandi> [owner|editor]
// Tanpa argumen, nilai diambil dari ADMIN_* di .env.
import { env } from '../src/config/env.js';
import { pool, closePool } from '../src/infrastructure/db/pool.js';
import { BcryptPasswordHasher } from '../src/infrastructure/security/hashing.js';
import { PgAdminUserRepository } from '../src/infrastructure/repositories/admin.pg.js';

const [email = env.ADMIN_EMAIL, nama = env.ADMIN_NAME, sandi = env.ADMIN_PASSWORD, peran = 'owner'] =
  process.argv.slice(2);

try {
  if (!email || !nama || !sandi) {
    throw new Error('Pemakaian: npm run admin:create -- <email> <nama> <kata-sandi> [owner|editor]');
  }
  if (sandi.length < 12) throw new Error('Kata sandi minimal 12 karakter.');
  if (!['owner', 'editor'].includes(peran)) throw new Error('Peran harus owner atau editor.');

  const users = new PgAdminUserRepository({ query: (t, p) => pool.query(t, p) });
  const hasher = new BcryptPasswordHasher();
  const user = await users.create({
    email: email.toLowerCase(),
    name: nama,
    passwordHash: await hasher.hash(sandi),
    role: peran
  });
  console.log(`akun dibuat: ${user.email} (${user.role})`);
} catch (err) {
  console.error(`gagal: ${err.message}`);
  process.exitCode = 1;
} finally {
  await closePool();
}
