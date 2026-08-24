-- 0004_engagement — agenda, jejak kehadiran, formulir Gabung, media, pengaturan.
--
-- `agenda_events` bukan sekadar daftar acara: jarak sudut planet Event ke Titik
-- Temu di scene dihitung dari sisa hari menuju acara terdekat. Menghapus acara
-- terdekat akan memindahkan planetnya — itu memang disengaja.

-- migrate:up

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

-- migrate:down

DROP TABLE IF EXISTS site_settings;
DROP TABLE IF EXISTS media_assets;
DROP TABLE IF EXISTS join_submissions;
DROP TYPE IF EXISTS submission_status;
DROP TABLE IF EXISTS presence_visits;
DROP TABLE IF EXISTS agenda_events;
