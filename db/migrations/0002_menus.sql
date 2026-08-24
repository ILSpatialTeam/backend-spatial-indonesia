-- 0002_menus — tujuh menu tata surya beserta isi panelnya.
--
-- Satu tabel untuk tujuh menu, bukan dua. `inti` adalah matahari dan tidak
-- punya orbit, enam sisanya planet — tapi keduanya berbagi persis kolom yang
-- sama untuk isi panel (judul, lead, daftar butir). Memisahkannya jadi dua
-- tabel berarti setiap query panel harus UNION, dan admin harus mengelola dua
-- halaman untuk satu konsep yang sama.

-- migrate:up

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

-- migrate:down

DROP TABLE IF EXISTS menu_links;
DROP TABLE IF EXISTS menu_items;
DROP TABLE IF EXISTS menus;
DROP TYPE IF EXISTS menu_kind;
