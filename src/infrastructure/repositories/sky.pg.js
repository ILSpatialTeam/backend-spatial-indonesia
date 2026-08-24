import { SkyRepository } from '../../domain/repositories/contract.js';
import { NotFoundError, ConflictError } from '../../shared/errors.js';

const KOLOM = 'id, ra, dec, name, city, note, status, created_at';

export class PgSkyRepository extends SkyRepository {
  constructor(db) {
    super();
    this.db = db;
  }

  // Bintang yang tampil di situs. Tidak ada paginasi: langitnya memang
  // dimaksudkan dilihat utuh, dan seribu bintang masih di bawah 100 KB.
  async listApproved() {
    const { rows } = await this.db.query(
      `SELECT id, ra, dec, name, city, note, created_at
       FROM sky_stars WHERE status = 'approved'
       ORDER BY created_at`
    );
    return rows;
  }

  async listAll({ status = null, limit = 100, offset = 0 } = {}) {
    const { rows } = await this.db.query(
      `SELECT ${KOLOM}, count(*) OVER () AS total_rows
       FROM sky_stars
       WHERE ($1::moderation_status IS NULL OR status = $1)
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [status, limit, offset]
    );
    return { rows, total: rows.length ? Number(rows[0].total_rows) : 0 };
  }

  async findByIpHash(ipHash) {
    if (!ipHash) return null;
    const { rows } = await this.db.query(
      `SELECT ${KOLOM} FROM sky_stars WHERE ip_hash = $1`, [ipHash]
    );
    return rows[0] ?? null;
  }

  async create(data) {
    try {
      const { rows } = await this.db.query(
        `INSERT INTO sky_stars (ra, dec, name, city, note, status, ip_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING ${KOLOM}`,
        [data.ra, data.dec, data.name, data.city ?? '', data.note ?? '',
         data.status ?? 'approved', data.ipHash ?? null]
      );
      return rows[0];
    } catch (err) {
      // Indeks unik pada ip_hash. Bukan error bagi pengirimnya — bintangnya
      // memang sudah ada di langit.
      if (err.code === '23505') throw new ConflictError('Kamu sudah punya satu bintang di langit ini.');
      throw err;
    }
  }

  async setStatus(id, status) {
    const { rows } = await this.db.query(
      `UPDATE sky_stars SET status = $2 WHERE id = $1 RETURNING ${KOLOM}`, [id, status]
    );
    if (!rows[0]) throw new NotFoundError('Bintang');
    return rows[0];
  }

  async remove(id) {
    const { rowCount } = await this.db.query('DELETE FROM sky_stars WHERE id = $1', [id]);
    if (!rowCount) throw new NotFoundError('Bintang');
  }

  async count() {
    const { rows } = await this.db.query(
      "SELECT count(*)::int AS n FROM sky_stars WHERE status = 'approved'"
    );
    return rows[0].n;
  }
}
