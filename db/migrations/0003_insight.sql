-- 0003_insight — artikel, kategori, frekuensi sparing, dan sparing itu sendiri.
--
-- Perubahan penting dibanding data statis yang lama: artikel sekarang punya
-- `source`. Sebuah artikel bisa dibaca di situs ini (`internal`, isinya di
-- body_html) atau hanya berupa lemparan ke Medium (`medium`, isinya di
-- external_url). Keduanya tetap muncul sebagai bulan yang mengorbit planet
-- Insight — yang berbeda cuma apa yang terjadi saat bulannya diklik.

-- migrate:up

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

-- migrate:down

DROP TABLE IF EXISTS sparings;
DROP TYPE IF EXISTS moderation_status;
DROP TABLE IF EXISTS articles;
DROP TYPE IF EXISTS article_status;
DROP TYPE IF EXISTS article_source;
DROP TABLE IF EXISTS sparing_frequencies;
DROP TABLE IF EXISTS article_categories;
