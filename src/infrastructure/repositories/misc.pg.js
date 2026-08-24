import { SettingsRepository, MediaRepository } from '../../domain/repositories/contract.js';
import { NotFoundError } from '../../shared/errors.js';

export class PgSettingsRepository extends SettingsRepository {
  constructor(db) {
    super();
    this.db = db;
  }

  async all() {
    const { rows } = await this.db.query('SELECT key, value FROM site_settings ORDER BY key');
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  async get(key) {
    const { rows } = await this.db.query('SELECT value FROM site_settings WHERE key = $1', [key]);
    return rows[0]?.value ?? null;
  }

  async set(key, value) {
    const { rows } = await this.db.query(
      `INSERT INTO site_settings (key, value) VALUES ($1, $2::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
       RETURNING key, value`,
      [key, JSON.stringify(value)]
    );
    return rows[0];
  }
}

export class PgMediaRepository extends MediaRepository {
  constructor(db) {
    super();
    this.db = db;
  }

  async list({ limit = 60, offset = 0 } = {}) {
    const { rows } = await this.db.query(
      `SELECT id, filename, stored_name, mime_type, byte_size, created_at,
              count(*) OVER () AS total_rows
       FROM media_assets ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return { rows, total: rows.length ? Number(rows[0].total_rows) : 0 };
  }

  async create({ filename, storedName, mimeType, byteSize, uploadedBy }) {
    const { rows } = await this.db.query(
      `INSERT INTO media_assets (filename, stored_name, mime_type, byte_size, uploaded_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, filename, stored_name, mime_type, byte_size, created_at`,
      [filename, storedName, mimeType, byteSize, uploadedBy ?? null]
    );
    return rows[0];
  }

  async findById(id) {
    const { rows } = await this.db.query('SELECT * FROM media_assets WHERE id = $1', [id]);
    return rows[0] ?? null;
  }

  async remove(id) {
    const { rows } = await this.db.query(
      'DELETE FROM media_assets WHERE id = $1 RETURNING stored_name',
      [id]
    );
    if (!rows[0]) throw new NotFoundError('Berkas media');
    return rows[0].stored_name;
  }
}
