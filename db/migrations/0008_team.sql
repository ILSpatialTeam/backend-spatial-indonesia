-- 0008_team — anggota tim inti yang ditampilkan di planet Tim.
--
-- Foto disimpan sebagai URL ke berkas di /uploads, bukan binary di database.
-- Ukuran dan format divalidasi saat unggah (lihat admin.routes.js), bukan di
-- sini — constraint CHECK pada teks URL terlalu rapuh untuk dirawat.

-- migrate:up

CREATE TABLE team_members (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  role       text NOT NULL,
  photo_url  text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT team_members_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT team_members_role_not_blank CHECK (length(btrim(role)) > 0)
);

CREATE TRIGGER team_members_touch BEFORE UPDATE ON team_members
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX team_members_active_idx ON team_members (sort_order) WHERE is_active;

-- migrate:down

DROP TABLE IF EXISTS team_members;
