-- db/schema.sql — skema lengkap Spatial Indonesia dalam satu berkas.
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

-- ══ 0001_core.sql ═══════════════════════════════════════════════

-- gen_random_uuid() ada di pgcrypto pada Postgres < 13; di 13+ sudah bawaan,
-- tapi memasang ekstensinya tetap aman dan bikin skrip ini jalan di dua-duanya.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- citext dipakai untuk email: perbandingan email tidak boleh peka huruf besar,
-- dan menaruh aturan itu di tipe kolom lebih andal daripada mengandalkan
-- setiap query ingat memakai lower().
CREATE EXTENSION IF NOT EXISTS citext;

-- Satu fungsi pemicu dipakai ulang semua tabel. Kolom updated_at yang diisi
-- aplikasi gampang terlewat pada UPDATE parsial; di database ia tidak bisa
-- bohong.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TYPE admin_role AS ENUM ('owner', 'editor');

CREATE TABLE admin_users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         citext NOT NULL UNIQUE,
  name          text NOT NULL,
  password_hash text NOT NULL,
  role          admin_role NOT NULL DEFAULT 'editor',
  is_active     boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_users_name_not_blank CHECK (length(btrim(name)) > 0)
);

CREATE TRIGGER admin_users_touch BEFORE UPDATE ON admin_users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Refresh token disimpan sebagai hash, bukan nilai aslinya. Kalau dump database
-- bocor, isinya tidak bisa dipakai untuk masuk — sama alasannya dengan kenapa
-- kata sandi tidak disimpan polos.
CREATE TABLE admin_sessions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  refresh_token_hash text NOT NULL UNIQUE,
  user_agent         text,
  ip                 inet,
  expires_at         timestamptz NOT NULL,
  revoked_at         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX admin_sessions_user_idx ON admin_sessions (user_id);
-- Dipakai tugas pembersih sesi kedaluwarsa.
CREATE INDEX admin_sessions_expires_idx ON admin_sessions (expires_at) WHERE revoked_at IS NULL;

-- Jejak audit sengaja tidak punya foreign key wajib ke pelakunya: kalau akun
-- admin dihapus, catatan apa yang pernah ia lakukan tetap harus tersisa.
CREATE TABLE audit_logs (
  id         bigserial PRIMARY KEY,
  actor_id   uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  actor_email text,
  action     text NOT NULL,
  entity     text NOT NULL,
  entity_id  text,
  meta       jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip         inet,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_created_idx ON audit_logs (created_at DESC);
CREATE INDEX audit_logs_entity_idx ON audit_logs (entity, entity_id);

-- ══ 0002_menus.sql ══════════════════════════════════════════════

CREATE TYPE menu_kind AS ENUM ('core', 'planet');

CREATE TABLE menus (
  id          text PRIMARY KEY,
  kind        menu_kind NOT NULL,
  position    integer NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,

  -- Isi panel yang dibaca manusia.
  label       text NOT NULL,   -- teks di rel navigasi: "Program"
  no          text NOT NULL,   -- "00".."06", dipakai sebagai penomoran panel
  tag         text NOT NULL,   -- kata di baris atas panel
  accent      text NOT NULL,   -- warna aksen panel, hex "#a99bf2"
  title       text NOT NULL,
  lead        text NOT NULL,
  body_html   text NOT NULL DEFAULT '',   -- blok bebas opsional, sudah disanitasi

  -- Parameter orbit. NULL untuk `inti` — dijaga oleh CHECK di bawah supaya
  -- sebuah planet tidak pernah bisa tersimpan tanpa orbitnya.
  orbit       numeric(6,2),
  size        numeric(5,2),
  color       integer,         -- warna 0xRRGGBB sebagai integer, siap dipakai three.js
  speed       numeric(7,5),
  phase       numeric(7,5),
  tilt        numeric(6,4),
  skin        text,            -- nama berkas di assets/planets/<skin>.jpg
  has_ring    boolean NOT NULL DEFAULT false,

  -- Ikon penanda planet; nilainya harus sama dengan [data-planet-icon] di
  -- index.html, karena keduanya menggambar penanda yang sama.
  icon_file   text NOT NULL,
  icon_from   text NOT NULL,
  icon_to     text NOT NULL,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT menus_accent_hex CHECK (accent ~* '^#[0-9a-f]{6}$'),
  CONSTRAINT menus_icon_hex   CHECK (icon_from ~* '^#[0-9a-f]{6}$' AND icon_to ~* '^#[0-9a-f]{6}$'),
  CONSTRAINT menus_planet_lengkap CHECK (
    kind <> 'planet' OR (
      orbit IS NOT NULL AND size IS NOT NULL AND color IS NOT NULL AND
      speed IS NOT NULL AND phase IS NOT NULL AND tilt IS NOT NULL AND skin IS NOT NULL
    )
  ),
  -- Orbit yang saling tumpang tindih akan membuat planet bertabrakan di layar.
  CONSTRAINT menus_orbit_positif CHECK (orbit IS NULL OR orbit > 0),
  CONSTRAINT menus_size_positif  CHECK (size IS NULL OR size > 0)
);

CREATE UNIQUE INDEX menus_position_uq ON menus (position);
CREATE INDEX menus_active_idx ON menus (position) WHERE is_active;

CREATE TRIGGER menus_touch BEFORE UPDATE ON menus
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Butir-butir di dalam panel. Bentuknya sengaja longgar (k/t/d) karena tujuh
-- panel memakainya untuk hal berbeda: `inti` sebagai nomor misi, `program`
-- sebagai label kategori, `gabung` sebagai langkah.
CREATE TABLE menu_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_id    text NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
  position   integer NOT NULL,
  k          text NOT NULL DEFAULT '',   -- kunci/label kiri
  t          text,                       -- judul butir (boleh kosong)
  d          text NOT NULL DEFAULT '',   -- deskripsi
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX menu_items_urut_uq ON menu_items (menu_id, position);

CREATE TRIGGER menu_items_touch BEFORE UPDATE ON menu_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Kanal sosial di panel Gabung. Tabel sendiri, bukan menu_items, karena
-- bentuknya beda: butuh URL yang divalidasi.
CREATE TABLE menu_links (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_id    text NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
  position   integer NOT NULL,
  label      text NOT NULL,
  url        text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT menu_links_url_http CHECK (url ~* '^(https?://|mailto:|#)')
);

CREATE UNIQUE INDEX menu_links_urut_uq ON menu_links (menu_id, position);

CREATE TRIGGER menu_links_touch BEFORE UPDATE ON menu_links
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ══ 0003_insight.sql ════════════════════════════════════════════

CREATE TABLE article_categories (
  id         text PRIMARY KEY,
  label      text NOT NULL,
  color      text NOT NULL,
  position   integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT article_categories_color_hex CHECK (color ~* '^#[0-9a-f]{6}$')
);

CREATE TRIGGER article_categories_touch BEFORE UPDATE ON article_categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Empat frekuensi sparing. Ada di database supaya admin bisa mengubah teks
-- petunjuknya, tapi jarang berubah — frontend menyimpannya di cache.
CREATE TABLE sparing_frequencies (
  id         text PRIMARY KEY,
  label      text NOT NULL,
  glyph      text NOT NULL,
  color      text NOT NULL,
  hint       text NOT NULL,
  position   integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sparing_frequencies_color_hex CHECK (color ~* '^#[0-9a-f]{6}$')
);

CREATE TRIGGER sparing_frequencies_touch BEFORE UPDATE ON sparing_frequencies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TYPE article_source AS ENUM ('internal', 'medium');
CREATE TYPE article_status AS ENUM ('draft', 'published', 'archived');

CREATE TABLE articles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text NOT NULL UNIQUE,
  no            text NOT NULL,          -- "001".."006", nomor arsip yang tampil
  category_id   text NOT NULL REFERENCES article_categories(id) ON DELETE RESTRICT,
  title         text NOT NULL,
  lead          text NOT NULL DEFAULT '',
  author        text NOT NULL DEFAULT 'Tim Spatial Indonesia',
  cover_url     text,

  source        article_source NOT NULL DEFAULT 'internal',
  external_url  text,                   -- wajib kalau source = 'medium'
  body_html     text NOT NULL DEFAULT '',   -- sudah disanitasi saat disimpan

  read_minutes  integer NOT NULL DEFAULT 1,
  status        article_status NOT NULL DEFAULT 'draft',
  published_at  timestamptz,
  view_count    bigint NOT NULL DEFAULT 0,

  created_by    uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  -- Dua aturan yang menjaga janji `source` di atas tetap benar di level
  -- database, bukan cuma di validasi aplikasi.
  CONSTRAINT articles_medium_butuh_url CHECK (
    source <> 'medium' OR (external_url IS NOT NULL AND external_url ~* '^https://')
  ),
  CONSTRAINT articles_internal_butuh_isi CHECK (
    source <> 'internal' OR status <> 'published' OR length(btrim(body_html)) > 0
  ),
  CONSTRAINT articles_terbit_butuh_tanggal CHECK (
    status <> 'published' OR published_at IS NOT NULL
  ),
  CONSTRAINT articles_read_minutes_wajar CHECK (read_minutes BETWEEN 1 AND 120)
);

-- Indeks daftar publik: hanya artikel terbit, terbaru dulu. Parsial supaya
-- draft tidak ikut membesarkan indeks yang dipakai pengunjung.
CREATE INDEX articles_terbit_idx ON articles (published_at DESC)
  WHERE status = 'published';
CREATE INDEX articles_kategori_idx ON articles (category_id, published_at DESC)
  WHERE status = 'published';
CREATE INDEX articles_status_idx ON articles (status, updated_at DESC);

CREATE TRIGGER articles_touch BEFORE UPDATE ON articles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TYPE moderation_status AS ENUM ('pending', 'approved', 'rejected');

-- Sparing = komentar berbentuk satelit yang mengorbit bulan artikel.
-- `anchor` adalah posisi orbitnya di scene, bukan posisi di teks.
CREATE TABLE sparings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id   uuid NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  frequency_id text NOT NULL REFERENCES sparing_frequencies(id) ON DELETE RESTRICT,
  author_name  text NOT NULL,
  body         text NOT NULL,
  anchor_x     smallint NOT NULL DEFAULT 0,
  anchor_y     smallint NOT NULL DEFAULT 1,
  boost        integer NOT NULL DEFAULT 0,
  status       moderation_status NOT NULL DEFAULT 'pending',
  ip_hash      text,                    -- hash, bukan IP mentah — lihat catatan di join_submissions
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sparings_body_panjang CHECK (length(btrim(body)) BETWEEN 8 AND 2000),
  CONSTRAINT sparings_nama_panjang CHECK (length(btrim(author_name)) BETWEEN 2 AND 60),
  CONSTRAINT sparings_boost_positif CHECK (boost >= 0)
);

CREATE INDEX sparings_artikel_idx ON sparings (article_id, created_at)
  WHERE status = 'approved';
CREATE INDEX sparings_moderasi_idx ON sparings (status, created_at DESC);

CREATE TRIGGER sparings_touch BEFORE UPDATE ON sparings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ══ 0004_engagement.sql ═════════════════════════════════════════

CREATE TABLE agenda_events (
  id           text PRIMARY KEY,
  kind         text NOT NULL,           -- MEETUP / WORKSHOP / KOLABORASI / KAMPUS
  title        text NOT NULL,
  event_date   date NOT NULL,
  place        text NOT NULL DEFAULT '',
  note         text NOT NULL DEFAULT '',
  url          text,
  is_published boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agenda_events_kind_huruf_besar CHECK (kind = upper(kind))
);

CREATE INDEX agenda_events_tanggal_idx ON agenda_events (event_date) WHERE is_published;

CREATE TRIGGER agenda_events_touch BEFORE UPDATE ON agenda_events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Jejak penjelajah: planet mana saja yang disinggahi satu pengunjung.
-- Frontend menampilkan yang terbaru paling terang, jadi yang dibutuhkan cuma
-- urutan waktu — tidak ada identitas yang perlu disimpan.
--
-- `visitor_hash` sengaja hash, bukan IP: cukup untuk meredam spam dari satu
-- sumber, tidak cukup untuk melacak orang. Kolom IP mentah tidak pernah ada di
-- tabel ini justru supaya tidak ada yang tergoda memakainya.
CREATE TABLE presence_visits (
  id           bigserial PRIMARY KEY,
  path         text[] NOT NULL,
  visitor_hash text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT presence_visits_path_isi CHECK (
    array_length(path, 1) BETWEEN 1 AND 12
  )
);

-- Kueri publiknya selalu "N jejak terakhir", jadi indeks menurun.
CREATE INDEX presence_visits_baru_idx ON presence_visits (created_at DESC);

CREATE TYPE submission_status AS ENUM ('new', 'contacted', 'archived');

CREATE TABLE join_submissions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  email      citext NOT NULL,
  focus      text NOT NULL DEFAULT '',
  message    text NOT NULL DEFAULT '',
  status     submission_status NOT NULL DEFAULT 'new',
  ip_hash    text,
  user_agent text,
  handled_by uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT join_submissions_nama CHECK (length(btrim(name)) BETWEEN 2 AND 80),
  CONSTRAINT join_submissions_email CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

CREATE INDEX join_submissions_baru_idx ON join_submissions (status, created_at DESC);
-- Satu email hanya boleh punya satu pendaftaran yang belum ditangani. Ini yang
-- membuat tombol "Kirim" yang diklik dua kali tidak jadi dua baris, sekaligus
-- membiarkan orang yang sama mendaftar lagi setelah admin menindaklanjuti.
--
-- Sempat dicoba indeks unik per hari — (email, created_at::date) — tapi cast
-- timestamptz ke date bergantung zona waktu sesi, jadi Postgres menolaknya
-- sebagai ekspresi indeks. Aturan ini lebih murah sekaligus lebih tepat.
CREATE UNIQUE INDEX join_submissions_aktif_uq
  ON join_submissions (email) WHERE status = 'new';

CREATE TRIGGER join_submissions_touch BEFORE UPDATE ON join_submissions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Gambar sampul artikel dan aset lain yang diunggah lewat dashboard.
CREATE TABLE media_assets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename    text NOT NULL,
  stored_name text NOT NULL UNIQUE,
  mime_type   text NOT NULL,
  byte_size   integer NOT NULL,
  uploaded_by uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT media_assets_ukuran CHECK (byte_size > 0)
);

CREATE INDEX media_assets_baru_idx ON media_assets (created_at DESC);

-- Pengaturan global yang tidak layak jadi tabel sendiri: teks hero, tautan
-- sosial umum, sakelar fitur. jsonb supaya bentuk nilainya bebas per kunci.
CREATE TABLE site_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER site_settings_touch BEFORE UPDATE ON site_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ══ 0005_observability.sql ══════════════════════════════════════

CREATE TYPE security_severity AS ENUM ('info', 'notice', 'warning', 'critical');

CREATE TABLE security_events (
  id          bigserial PRIMARY KEY,
  kind        text NOT NULL,
  severity    security_severity NOT NULL DEFAULT 'info',
  message     text NOT NULL,
  method      text,
  path        text,
  status      integer,
  actor_email text,
  -- IP tetap tidak pernah disimpan mentah, sama seperti di tabel lain. Yang
  -- dibutuhkan analis keamanan adalah "apakah ini sumber yang sama", dan hash
  -- bergaram menjawabnya tanpa menyimpan data yang mengidentifikasi orang.
  ip_hash     text,
  user_agent  text,
  request_id  text,
  meta        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Tiga cara tabel ini dibaca, tiga indeks. Semuanya menurun karena tidak ada
-- yang pernah bertanya "kejadian keamanan paling lama".
CREATE INDEX security_events_baru_idx ON security_events (created_at DESC);
CREATE INDEX security_events_jenis_idx ON security_events (kind, created_at DESC);
CREATE INDEX security_events_berat_idx ON security_events (severity, created_at DESC)
  WHERE severity IN ('warning', 'critical');
-- Dipakai untuk menghitung percobaan berulang dari sumber yang sama.
CREATE INDEX security_events_sumber_idx ON security_events (ip_hash, created_at DESC)
  WHERE ip_hash IS NOT NULL;

-- Jejak audit diperkaya: sebelumnya hanya mencatat *bahwa* sesuatu berubah.
-- `changes` menyimpan medan mana yang berubah beserta nilai lama dan barunya,
-- sehingga pertanyaan "siapa yang mengubah orbit planet Tim minggu lalu, dan
-- dari berapa?" bisa dijawab tanpa memulihkan cadangan.
ALTER TABLE audit_logs ADD COLUMN changes jsonb NOT NULL DEFAULT '{}'::jsonb;
-- Menyambungkan satu baris audit dengan galat dan kejadian keamanan dari
-- permintaan HTTP yang sama.
ALTER TABLE audit_logs ADD COLUMN request_id text;

CREATE INDEX audit_logs_actor_idx ON audit_logs (actor_id, created_at DESC);

-- Ringkasan harian kejadian keamanan. Sebuah view, bukan tabel: angkanya
-- selalu bisa dihitung ulang dari sumbernya, dan menyimpan hasil agregasi
-- berarti menambah satu hal lagi yang bisa tidak sinkron.
CREATE VIEW security_daily AS
SELECT
  date_trunc('day', created_at) AS hari,
  kind,
  severity,
  count(*)::int AS jumlah,
  count(DISTINCT ip_hash)::int AS sumber_unik
FROM security_events
GROUP BY 1, 2, 3;

-- ══ 0006_hardening.sql ══════════════════════════════════════════

-- ── audit_logs jadi append-only ─────────────────────────────────────────────
--
-- Sebelumnya peran aplikasi punya hak DELETE dan UPDATE atas tabel ini. Aplikasi
-- tidak pernah memakainya, tapi kalau kredensial database bocor, hal pertama
-- yang dilakukan penyerang yang rapi adalah membersihkan jejaknya.
--
-- Dipakai trigger, bukan sekadar REVOKE: pemilik tabel bisa memberikan haknya
-- kembali kepada dirinya sendiri kapan saja, jadi REVOKE saja hampir tidak
-- berarti. Trigger tetap bisa di-DROP, tapi itu perbuatan yang jauh lebih
-- disengaja — dan DROP-nya sendiri tercatat di log Postgres.
CREATE OR REPLACE FUNCTION audit_logs_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs bersifat append-only — % ditolak', TG_OP
    USING HINT = 'Catatan audit tidak boleh diubah atau dihapus. Kalau tabelnya terlalu besar, arsipkan dengan COPY lalu buat migrasi yang memindahkannya.';
END;
$$;

-- Foreign key ke admin_users harus dilepas lebih dulu.
--
-- `ON DELETE SET NULL` berarti menghapus akun admin akan menjalankan UPDATE
-- pada audit_logs — dan trigger di atas akan menolaknya, membuat penghapusan
-- akun mustahil. Selain itu, tabel audit memang tidak seharusnya berubah gara-
-- gara data lain dihapus: `actor_email` sudah menyimpan siapa pelakunya, dan
-- justru itulah gunanya ia ada.
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_actor_id_fkey;

CREATE TRIGGER audit_logs_tolak_update
  BEFORE UPDATE ON audit_logs
  EXECUTE FUNCTION audit_logs_append_only();

CREATE TRIGGER audit_logs_tolak_delete
  BEFORE DELETE ON audit_logs
  EXECUTE FUNCTION audit_logs_append_only();

-- ── keluarga sesi, untuk mendeteksi refresh token yang dicuri ───────────────
--
-- Rotasi yang sudah ada mencabut token lama setiap kali di-refresh. Yang belum
-- ada: mengenali kalau token yang SUDAH dirotasi dipakai lagi.
--
-- Kejadian itu punya satu penjelasan yang masuk akal — seseorang memegang
-- salinan token yang bukan miliknya. Pemilik aslinya sudah lanjut ke token
-- berikutnya, jadi yang memakai token lama pasti pihak lain. Dengan keluarga
-- token, seluruh rantai sesi turunan bisa dicabut sekaligus, bukan cuma
-- menjawab 401 dan diam.
ALTER TABLE admin_sessions ADD COLUMN family_id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE admin_sessions ADD COLUMN rotated_at timestamptz;

CREATE INDEX admin_sessions_keluarga_idx ON admin_sessions (family_id);

-- ══ 0007_sky.sql ════════════════════════════════════════════════

CREATE TABLE sky_stars (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Right ascension dalam jam (0–24) dan declination dalam derajat (-90–90).
  ra         numeric(6,3) NOT NULL,
  dec        numeric(6,3) NOT NULL,

  name       text NOT NULL,
  city       text NOT NULL DEFAULT '',
  -- Kalimat sangat pendek. Sengaja dibatasi 60 karakter: ini bintang, bukan
  -- buku tamu, dan kolom yang panjang mengundang isi yang harus dimoderasi.
  note       text NOT NULL DEFAULT '',

  status     moderation_status NOT NULL DEFAULT 'approved',
  ip_hash    text,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sky_stars_ra_rentang  CHECK (ra >= 0 AND ra < 24),
  CONSTRAINT sky_stars_dec_rentang CHECK (dec >= -90 AND dec <= 90),
  CONSTRAINT sky_stars_name_panjang CHECK (length(btrim(name)) BETWEEN 2 AND 24),
  CONSTRAINT sky_stars_city_panjang CHECK (length(city) <= 40),
  CONSTRAINT sky_stars_note_panjang CHECK (length(note) <= 60)
);

CREATE INDEX sky_stars_tampil_idx ON sky_stars (created_at DESC)
  WHERE status = 'approved';

-- Satu bintang per sumber. Bukan pembatasan yang ketat — orang yang benar-benar
-- ingin menaruh dua bisa berpindah jaringan — tapi cukup untuk menjaga
-- langitnya tetap berarti tanpa memaksa siapa pun mendaftar akun.
CREATE UNIQUE INDEX sky_stars_satu_per_sumber_uq ON sky_stars (ip_hash)
  WHERE ip_hash IS NOT NULL;

-- ══ catatan migrasi ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS schema_migrations (
  version     text PRIMARY KEY,
  name        text NOT NULL,
  checksum    text NOT NULL,
  applied_at  timestamptz NOT NULL DEFAULT now(),
  duration_ms integer NOT NULL DEFAULT 0
);

INSERT INTO schema_migrations (version, name, checksum) VALUES
  ('0001', 'core', '14a2c29173f4dc6c'),
  ('0002', 'menus', '4c4e2b2ad0d32fbd'),
  ('0003', 'insight', '87a584ae262a7317'),
  ('0004', 'engagement', 'c3c55e407177b9c9'),
  ('0005', 'observability', 'aa2fbeeb4b07ced8'),
  ('0006', 'hardening', 'b54960b43acbca65'),
  ('0007', 'sky', '89bfc7c280d8598f')
ON CONFLICT (version) DO NOTHING;

COMMIT;
