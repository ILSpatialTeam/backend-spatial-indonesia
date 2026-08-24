import { SubmissionRepository } from '../../domain/repositories/contract.js';
import { NotFoundError, ConflictError } from '../../shared/errors.js';

const KOLOM = 'id, name, email, focus, message, status, handled_by, created_at, updated_at';

export class PgSubmissionRepository extends SubmissionRepository {
  constructor(db) {
    super();
    this.db = db;
  }

  async list({ status = null, limit = 50, offset = 0 } = {}) {
    const { rows } = await this.db.query(
      `SELECT ${KOLOM}, count(*) OVER () AS total_rows
       FROM join_submissions
       WHERE ($1::submission_status IS NULL OR status = $1)
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [status, limit, offset]
    );
    return { rows, total: rows.length ? Number(rows[0].total_rows) : 0 };
  }

  async create(data) {
    try {
      const { rows } = await this.db.query(
        `INSERT INTO join_submissions (name, email, focus, message, ip_hash, user_agent)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING ${KOLOM}`,
        [data.name, data.email, data.focus ?? '', data.message ?? '', data.ipHash ?? null, data.userAgent ?? null]
      );
      return rows[0];
    } catch (err) {
      // Indeks unik parsial pada (email) WHERE status='new'. Bukan galat bagi
      // pengirim — dia memang sudah terdaftar dan sedang menunggu dihubungi.
      if (err.code === '23505') {
        throw new ConflictError('Email ini sudah terdaftar dan sedang kami proses. Tunggu kabar dari kami, ya.');
      }
      throw err;
    }
  }

  async setStatus(id, status, handledBy = null) {
    const { rows } = await this.db.query(
      `UPDATE join_submissions SET status = $2, handled_by = COALESCE($3, handled_by)
       WHERE id = $1 RETURNING ${KOLOM}`,
      [id, status, handledBy]
    );
    if (!rows[0]) throw new NotFoundError('Pendaftaran');
    return rows[0];
  }

  async remove(id) {
    const { rowCount } = await this.db.query('DELETE FROM join_submissions WHERE id = $1', [id]);
    if (!rowCount) throw new NotFoundError('Pendaftaran');
  }
}
