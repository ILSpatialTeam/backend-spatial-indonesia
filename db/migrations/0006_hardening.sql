-- 0006_hardening — jejak audit yang tidak bisa dihapus, dan keluarga sesi.
--
-- Dua pengerasan yang muncul dari audit keamanan 22 Agustus 2026.

-- migrate:up

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

-- migrate:down

DROP INDEX IF EXISTS admin_sessions_keluarga_idx;
ALTER TABLE admin_sessions DROP COLUMN IF EXISTS rotated_at;
ALTER TABLE admin_sessions DROP COLUMN IF EXISTS family_id;

DROP TRIGGER IF EXISTS audit_logs_tolak_delete ON audit_logs;
DROP TRIGGER IF EXISTS audit_logs_tolak_update ON audit_logs;
DROP FUNCTION IF EXISTS audit_logs_append_only();

ALTER TABLE audit_logs
  ADD CONSTRAINT audit_logs_actor_id_fkey
  FOREIGN KEY (actor_id) REFERENCES admin_users(id) ON DELETE SET NULL;
