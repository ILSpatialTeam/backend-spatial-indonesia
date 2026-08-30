-- Acara yang bisa dibaca utuh dan didaftari.
--
-- Sebelumnya `agenda_events` hanya menyimpan cukup data untuk satu baris di
-- kartu Event: jenis, judul, tanggal, tempat, catatan satu kalimat. Yang
-- ditambahkan di sini membuat satu acara punya halamannya sendiri — uraian
-- panjang, jam, alamat — dan membuka satu jalur pendaftaran.
--
-- ── Tiga cara mendaftar, bukan dua ──────────────────────────────────────────
--
-- `registration` sengaja tiga nilai, bukan boolean:
--
--   none      acara terbuka; siapa pun boleh datang, tidak ada yang dicatat.
--             Ini tetap jalur yang paling sering dipakai untuk meetup.
--   internal  pendaftaran dicatat di tabel `event_registrations` di bawah.
--   external  pendaftarannya milik pihak lain (Google Form, Airtable, Luma);
--             yang kita simpan cuma tautannya.
--
-- Boolean akan memaksa "punya kuota" dan "punya formulir" jadi satu hal yang
-- sama, padahal acara dengan tautan pihak ketiga juga bisa berkuota — hanya
-- saja kuotanya bukan kita yang menghitung.

-- migrate:up

ALTER TABLE agenda_events
  -- Uraian panjang dari editor WYSIWYG dashboard, sudah disanitasi server
  -- sebelum disimpan — sama seperti `articles.body_html`. Yang disimpan HTML
  -- bersih, bukan HTML mentah: satu jalur render yang lupa membersihkan sudah
  -- cukup untuk membocorkan skrip, dan jalur render itu ada di tiga tempat.
  ADD COLUMN description_html text NOT NULL DEFAULT '',
  -- Jam mulai dan selesai terpisah dari `event_date` yang tetap `date`.
  -- Alasannya: sudut planet Event dihitung dari tanggal, dan hanya dari
  -- tanggal. Menjadikan kolomnya timestamptz akan menggeser acara ke hari
  -- lain bagi pengunjung di zona waktu lain — persis yang dihindari
  -- `stempel()` di domain/entities/agenda.js.
  ADD COLUMN starts_at time,
  ADD COLUMN ends_at   time,
  -- `place` adalah kota (dipakai di baris ringkas kartu Event); `address`
  -- adalah alamat lengkap yang baru berguna di halaman detail.
  ADD COLUMN address text NOT NULL DEFAULT '',
  ADD COLUMN registration text NOT NULL DEFAULT 'none',
  ADD COLUMN register_url text,
  -- NULL = tanpa batas. Bukan 0, dan bukan angka besar yang berarti "tak
  -- terbatas": keduanya menuntut setiap pembaca mengingat konvensinya, dan
  -- 0 justru bentuk yang sah untuk "kuota habis dibekukan".
  ADD COLUMN capacity integer,
  -- Pendaftaran boleh ditutup lebih awal dari hari-H. Kosong = terbuka sampai
  -- acaranya lewat.
  ADD COLUMN registration_closes_at date,
  ADD CONSTRAINT agenda_events_registration_nilai
    CHECK (registration IN ('none', 'internal', 'external')),
  ADD CONSTRAINT agenda_events_capacity_wajar
    CHECK (capacity IS NULL OR capacity BETWEEN 0 AND 100000),
  -- Acara "external" tanpa tautan adalah tombol daftar yang tidak menuju ke
  -- mana pun. Lebih baik gagal saat disimpan admin daripada saat diklik
  -- pengunjung.
  ADD CONSTRAINT agenda_events_external_butuh_tautan
    CHECK (registration <> 'external' OR (register_url IS NOT NULL AND btrim(register_url) <> '')),
  ADD CONSTRAINT agenda_events_jam_urut
    CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at);

-- Pendaftar satu acara.
--
-- Hanya dipakai saat `registration = 'internal'`. Untuk 'external' tabel ini
-- tetap kosong dan itu benar: pendaftarannya memang tidak lewat kita, dan
-- menyimpan setengah salinan dari Google Form berarti dua daftar yang pasti
-- berbeda dalam seminggu.
CREATE TABLE event_registrations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    text NOT NULL REFERENCES agenda_events(id) ON DELETE CASCADE,
  name        text NOT NULL,
  email       text NOT NULL,
  phone       text NOT NULL DEFAULT '',
  note        text NOT NULL DEFAULT '',
  -- 'cancelled' tidak menghapus barisnya: kursinya kembali ke kuota, tapi
  -- jejak bahwa orang itu pernah mendaftar tetap ada untuk panitia.
  status      text NOT NULL DEFAULT 'confirmed',
  ip_hash     text,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_registrations_status_nilai CHECK (status IN ('confirmed', 'cancelled')),
  CONSTRAINT event_registrations_name_len CHECK (length(btrim(name)) BETWEEN 2 AND 80),
  CONSTRAINT event_registrations_email_fmt CHECK (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  CONSTRAINT event_registrations_phone_len CHECK (length(phone) <= 32),
  CONSTRAINT event_registrations_note_len CHECK (length(note) <= 500)
);

-- Satu email satu kursi per acara — tapi hanya untuk yang masih berlaku, jadi
-- orang yang membatalkan bisa mendaftar lagi tanpa harus menghapus barisnya.
CREATE UNIQUE INDEX event_registrations_unik
  ON event_registrations (event_id, lower(email))
  WHERE status = 'confirmed';

-- Dua kueri yang benar-benar dipakai: menghitung kursi terpakai satu acara,
-- dan menampilkan daftarnya di dashboard dengan yang terbaru di atas.
CREATE INDEX event_registrations_acara_idx
  ON event_registrations (event_id, created_at DESC);

-- migrate:down

DROP TABLE IF EXISTS event_registrations;

ALTER TABLE agenda_events
  DROP CONSTRAINT IF EXISTS agenda_events_jam_urut,
  DROP CONSTRAINT IF EXISTS agenda_events_external_butuh_tautan,
  DROP CONSTRAINT IF EXISTS agenda_events_capacity_wajar,
  DROP CONSTRAINT IF EXISTS agenda_events_registration_nilai,
  DROP COLUMN IF EXISTS registration_closes_at,
  DROP COLUMN IF EXISTS capacity,
  DROP COLUMN IF EXISTS register_url,
  DROP COLUMN IF EXISTS registration,
  DROP COLUMN IF EXISTS address,
  DROP COLUMN IF EXISTS ends_at,
  DROP COLUMN IF EXISTS starts_at,
  DROP COLUMN IF EXISTS description_html;
