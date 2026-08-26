-- migrate:up

-- Program dan kegiatan komunitas: tiap baris menjadi satu butir di panel
-- planet Program. Sebelumnya isinya dikodekan keras di frontend.
CREATE TABLE programs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  subtitle     text NOT NULL DEFAULT '',
  description  text NOT NULL DEFAULT '',
  sort_order   integer NOT NULL DEFAULT 0,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT programs_title_len CHECK (length(btrim(title)) BETWEEN 2 AND 120),
  CONSTRAINT programs_desc_len CHECK (length(description) <= 600)
);

CREATE TRIGGER programs_touch BEFORE UPDATE ON programs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Kategori proyek anggota: dinamis, dikelola lewat dashboard.
CREATE TABLE project_categories (
  id           text PRIMARY KEY,
  label        text NOT NULL,
  sort_order   integer NOT NULL DEFAULT 0,
  CONSTRAINT project_categories_id_fmt CHECK (id ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  CONSTRAINT project_categories_label_len CHECK (length(btrim(label)) BETWEEN 1 AND 60)
);

-- Karya anggota komunitas: proyek VR/AR/XR yang dipajang di planet Karya.
CREATE TABLE projects (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  description  text NOT NULL DEFAULT '',
  member_name  text NOT NULL,
  image_url    text,
  category_id  text REFERENCES project_categories(id) ON DELETE SET NULL,
  type         text NOT NULL DEFAULT '',
  sort_order   integer NOT NULL DEFAULT 0,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT projects_title_len CHECK (length(btrim(title)) BETWEEN 2 AND 200),
  CONSTRAINT projects_desc_len CHECK (length(description) <= 2000),
  CONSTRAINT projects_member_len CHECK (length(btrim(member_name)) BETWEEN 2 AND 80)
);

CREATE INDEX projects_category_idx ON projects (category_id);
CREATE INDEX projects_active_idx ON projects (is_active, sort_order);

CREATE TRIGGER projects_touch BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- migrate:down

DROP TABLE IF EXISTS projects;
DROP TABLE IF EXISTS project_categories;
DROP TABLE IF EXISTS programs;
