-- 0001_core — fondasi: ekstensi, pemicu updated_at, akun admin, sesi, jejak audit.
--
-- Tabel konten menyusul di migrasi berikutnya. Yang di sini adalah hal-hal yang
-- dibutuhkan semua migrasi lain, jadi harus jalan lebih dulu.

-- migrate:up

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

-- migrate:down

DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS admin_sessions;
DROP TABLE IF EXISTS admin_users;
DROP TYPE IF EXISTS admin_role;
DROP FUNCTION IF EXISTS set_updated_at();
