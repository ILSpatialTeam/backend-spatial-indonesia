-- 0005_observability — pemantauan keamanan dan jejak perubahan yang lebih rinci.
--
-- Dua kebutuhan berbeda yang sengaja disimpan di dua tabel:
--
--   audit_logs      apa yang DILAKUKAN admin. Sengaja, sah, dan perlu bisa
--                   ditelusuri: siapa mengubah apa, kapan, dari nilai apa jadi
--                   apa. Isinya tumbuh pelan.
--   security_events apa yang TERJADI pada sistem. Sebagian besar bukan ulah
--                   admin — login gagal, batas laju terlampaui, CSRF ditolak,
--                   galat server. Isinya bisa membanjir saat diserang, jadi ia
--                   punya jadwal pembersihan sendiri dan tidak boleh
--                   memperlambat tabel audit.
--
-- Menggabungkan keduanya akan membuat satu kejadian brute force menenggelamkan
-- seluruh riwayat penyuntingan artikel.

-- migrate:up

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

-- migrate:down

DROP VIEW IF EXISTS security_daily;
DROP INDEX IF EXISTS audit_logs_actor_idx;
ALTER TABLE audit_logs DROP COLUMN IF EXISTS request_id;
ALTER TABLE audit_logs DROP COLUMN IF EXISTS changes;
DROP TABLE IF EXISTS security_events;
DROP TYPE IF EXISTS security_severity;
