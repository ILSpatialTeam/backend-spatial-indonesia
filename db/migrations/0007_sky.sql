-- 0007_sky — langit yang digambar komunitas.
--
-- Setiap pengunjung boleh menaruh satu bintang di langit Nusantara yang sudah
-- ada di scene. Setelah setahun, langit di atas tata surya itu bukan lagi
-- bawaan: ia gambar komunitasnya sendiri, dan orang yang datang tahun ini masih
-- bisa menemukan bintangnya tahun depan.
--
-- Koordinatnya memakai ra/dec, sama persis dengan rasi bawaan di
-- src/systems/sky-lore.js. Bukan kebetulan: dengan begitu bintang komunitas
-- ikut berputar mengikuti waktu sideris seperti bintang sungguhan, bukan
-- menempel di layar.

-- migrate:up

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

-- migrate:down

DROP TABLE IF EXISTS sky_stars;
