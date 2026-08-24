#!/usr/bin/env node
// Rakit db/schema.sql — seluruh skema dalam satu berkas siap jalan.
//
// Migrasi adalah sejarah; schema.sql adalah keadaan sekarang. Keduanya perlu:
// migrasi untuk database yang sudah ada, schema.sql untuk memasang dari nol
// tanpa harus memutar ulang setiap langkah — dan sebagai satu berkas yang bisa
// dibaca orang untuk tahu bentuk databasenya tanpa membuka empat berkas.
//
//   node scripts/dump-schema.js
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadMigrations } from '../src/infrastructure/db/migrator.js';
import { closePool } from '../src/infrastructure/db/pool.js';

const OUT = fileURLToPath(new URL('../db/schema.sql', import.meta.url));

try {
  const migrasi = await loadMigrations();
  const bagian = migrasi.map((m) => `-- ══ ${m.file} ${'═'.repeat(Math.max(0, 60 - m.file.length))}\n\n${m.up}`);

  const isi = `-- db/schema.sql — skema lengkap Spatial Indonesia dalam satu berkas.
--
-- DIBANGKITKAN OLEH scripts/dump-schema.js dari db/migrations/*.sql.
-- Jangan disunting tangan: ubah migrasinya, lalu jalankan ulang skripnya.
--
-- Untuk database baru:
--   createdb spatial_indonesia
--   psql "$DATABASE_URL" -f db/schema.sql
--   psql "$DATABASE_URL" -f db/seed.sql
--
-- Untuk database yang sudah jalan, JANGAN pakai berkas ini — pakai:
--   npm run migrate
--
-- Berkas ini juga mengisi schema_migrations, jadi database yang dipasang
-- lewat sini dianggap sudah menjalankan semua migrasi, dan "npm run migrate"
-- berikutnya tidak akan mencoba mengulanginya.

BEGIN;

${bagian.join('\n\n')}

-- ══ catatan migrasi ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS schema_migrations (
  version     text PRIMARY KEY,
  name        text NOT NULL,
  checksum    text NOT NULL,
  applied_at  timestamptz NOT NULL DEFAULT now(),
  duration_ms integer NOT NULL DEFAULT 0
);

INSERT INTO schema_migrations (version, name, checksum) VALUES
${migrasi.map((m) => `  ('${m.version}', '${m.name}', '${m.checksum}')`).join(',\n')}
ON CONFLICT (version) DO NOTHING;

COMMIT;
`;

  await writeFile(OUT, isi, 'utf8');
  console.log(`db/schema.sql ditulis — ${migrasi.length} migrasi digabung.`);
} catch (err) {
  console.error(`gagal: ${err.message}`);
  process.exitCode = 1;
} finally {
  await closePool();
}
