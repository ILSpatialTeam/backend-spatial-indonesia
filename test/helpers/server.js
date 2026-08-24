// Menyalakan aplikasi sungguhan di atas database uji.
//
// Bukan mock: rute, middleware, service, dan SQL yang dijalankan persis sama
// dengan yang dipakai produksi. Yang berbeda cuma databasenya — dan itu memang
// harus berbeda, karena tes ini menghapus isinya.
//
// `process.env` disetel SEBELUM modul aplikasi diimpor. `config/env.js`
// membaca lingkungan saat dievaluasi, dan impor ES dievaluasi sekali saja:
// menyetelnya setelah impor tidak akan berpengaruh sama sekali.
import pg from 'pg';

const DB_UJI = 'spatial_indonesia_test';
const INDUK = process.env.TEST_PG_ADMIN_URL
  ?? 'postgres://spatial_app:spatial_dev_password@localhost:5432/postgres';
const URL_UJI = INDUK.replace(/\/[^/]*$/, `/${DB_UJI}`);

export async function siapkanDatabase() {
  // Peran aplikasi sengaja TIDAK punya hak CREATEDB — memberikannya berarti
  // peran yang dipakai server produksi bisa membuat database, dan itu hak yang
  // tidak pernah dibutuhkannya. Jadi kalau database uji belum ada, tes berhenti
  // dengan perintah yang tinggal disalin, bukan dengan galat Postgres mentah.
  const admin = new pg.Client({ connectionString: INDUK });
  await admin.connect();
  try {
    const { rows } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [DB_UJI]);
    if (!rows.length) {
      try {
        await admin.query(`CREATE DATABASE ${DB_UJI}`);
      } catch (err) {
        if (err.code !== '42501') throw err;
        throw new Error(
          `Database uji "${DB_UJI}" belum ada, dan peran aplikasi tidak berhak membuatnya.\n` +
          `Jalankan sekali sebagai superuser Postgres:\n\n` +
          `  createdb -O spatial_app ${DB_UJI}\n`
        );
      }
    }
  } finally {
    await admin.end();
  }

  process.env.DATABASE_URL = URL_UJI;
  process.env.NODE_ENV = 'test';
  process.env.JWT_ACCESS_SECRET ??= 'rahasia-uji-akses-yang-cukup-panjang';
  process.env.JWT_REFRESH_SECRET ??= 'rahasia-uji-refresh-yang-cukup-panjang';
  process.env.IP_HASH_SALT ??= 'garam-uji-yang-cukup-panjang-sekali';
  process.env.CORS_ORIGINS = 'http://localhost:8899';
  process.env.PUBLIC_URL = 'http://localhost:4000';

  const { up } = await import('../../src/infrastructure/db/migrator.js');
  await up({ log: () => {} });
  return URL_UJI;
}

// Tabel dikosongkan, bukan databasenya dibuat ulang: migrasi butuh beberapa
// detik dan tes ini dijalankan berulang kali sehari.
//
// audit_logs punya trigger append-only, jadi TRUNCATE-nya butuh mematikan
// trigger sesaat — satu-satunya tempat di seluruh proyek yang boleh.
export async function bersihkan() {
  const { pool } = await import('../../src/infrastructure/db/pool.js');
  await pool.query('ALTER TABLE audit_logs DISABLE TRIGGER USER');
  await pool.query(`
    TRUNCATE sparings, articles, article_categories, sparing_frequencies,
             menu_links, menu_items, menus, agenda_events, presence_visits,
             site_settings, join_submissions, media_assets, sky_stars,
             admin_sessions, admin_users, audit_logs, security_events
    RESTART IDENTITY CASCADE`);
  await pool.query('ALTER TABLE audit_logs ENABLE TRIGGER USER');
}

export async function isiDataDasar() {
  const { pool } = await import('../../src/infrastructure/db/pool.js');
  await pool.query(`
    INSERT INTO article_categories (id, label, color, position)
    VALUES ('teknis', 'Teknis', '#9E94F9', 1)`);
  await pool.query(`
    INSERT INTO sparing_frequencies (id, label, glyph, color, hint, position)
    VALUES ('sinyal', 'Sinyal', '▲', '#9E94F9', 'petunjuk', 1)`);
  await pool.query(`
    INSERT INTO menus (id, kind, position, label, no, tag, accent, title, lead,
                       icon_file, icon_from, icon_to)
    VALUES ('inti', 'core', 0, 'Inti', '00', 'Inti', '#9E94F9', 'Judul', 'Lead',
            'icon-1', '#cfc9ff', '#6a5ae0')`);
  await pool.query(`
    INSERT INTO articles (slug, no, category_id, title, lead, author, source,
                          body_html, read_minutes, status, published_at)
    VALUES ('artikel-uji', '001', 'teknis', 'Artikel Uji', 'Lead', 'Tim', 'internal',
            '<p>Isi artikel uji.</p>', 3, 'published', now())`);
}

export async function buatAdmin({ email, password, role = 'owner', name = 'Uji' }) {
  const { pool } = await import('../../src/infrastructure/db/pool.js');
  const { BcryptPasswordHasher } = await import('../../src/infrastructure/security/hashing.js');
  const hash = await new BcryptPasswordHasher().hash(password);
  const { rows } = await pool.query(
    `INSERT INTO admin_users (email, name, password_hash, role)
     VALUES ($1,$2,$3,$4) RETURNING id, email, role`,
    [email, name, hash, role]
  );
  return rows[0];
}

export async function nyalakanServer() {
  const { createApp } = await import('../../src/app.js');
  const { app } = createApp();
  return new Promise((selesai) => {
    // Port 0 = biarkan sistem memilih. Port tetap membuat dua tes yang
    // berjalan bersamaan saling merebut soket.
    const server = app.listen(0, () => {
      const { port } = server.address();
      selesai({
        base: `http://127.0.0.1:${port}`,
        async tutup() {
          await new Promise((r) => server.close(r));
          const { closePool } = await import('../../src/infrastructure/db/pool.js');
          await closePool();
        }
      });
    });
  });
}

// Klien HTTP kecil yang mengingat cookie — dibutuhkan untuk menguji jalur
// sesi dan CSRF apa adanya, seperti yang dilakukan browser.
export function buatKlien(base) {
  const toples = new Map();
  return {
    kuki: toples,
    ambilKuki: (nama) => toples.get(nama),
    async kirim(jalur, opsi = {}) {
      const headers = { ...(opsi.headers ?? {}) };
      if (toples.size) {
        headers.cookie = [...toples].map(([k, v]) => `${k}=${v}`).join('; ');
      }
      if (opsi.json !== undefined) {
        headers['content-type'] = 'application/json';
        opsi.body = JSON.stringify(opsi.json);
      }
      const res = await fetch(base + jalur, { ...opsi, headers, redirect: 'manual' });
      for (const c of res.headers.getSetCookie?.() ?? []) {
        const [pasangan] = c.split(';');
        const i = pasangan.indexOf('=');
        toples.set(pasangan.slice(0, i), pasangan.slice(i + 1));
      }
      const teks = await res.text();
      let data = null;
      try { data = teks ? JSON.parse(teks) : null; } catch { data = teks; }
      return { status: res.status, data, headers: res.headers };
    }
  };
}
