import { ProgramRepository } from '../../domain/repositories/contract.js';
import { NotFoundError } from '../../shared/errors.js';

const KOLOM = 'id, title, subtitle, description, sort_order, is_active, created_at, updated_at';

export class PgProgramRepository extends ProgramRepository {
  constructor(db) {
    super();
    this.db = db;
  }

  async listActive() {
    const { rows } = await this.db.query(
      `SELECT ${KOLOM} FROM programs WHERE is_active ORDER BY sort_order, created_at`
    );
    return rows;
  }

  async listAll() {
    const { rows } = await this.db.query(
      `SELECT ${KOLOM} FROM programs ORDER BY sort_order, created_at`
    );
    return rows;
  }

  async findById(id) {
    const { rows } = await this.db.query(`SELECT ${KOLOM} FROM programs WHERE id = $1`, [id]);
    if (!rows[0]) throw new NotFoundError('Program');
    return rows[0];
  }

  async create(data) {
    const { rows } = await this.db.query(
      `INSERT INTO programs (title, subtitle, description, sort_order, is_active)
       VALUES ($1,$2,$3,$4,$5) RETURNING ${KOLOM}`,
      [data.title, data.subtitle ?? '', data.description ?? '', data.sortOrder ?? 0, data.isActive ?? true]
    );
    return rows[0];
  }

  async update(id, patch) {
    const peta = {
      title: 'title', subtitle: 'subtitle', description: 'description',
      sortOrder: 'sort_order', isActive: 'is_active'
    };
    const set = [];
    const nilai = [];
    for (const [kunci, kolom] of Object.entries(peta)) {
      if (patch[kunci] !== undefined) {
        nilai.push(patch[kunci]);
        set.push(`${kolom} = $${nilai.length}`);
      }
    }
    if (!set.length) return this.findById(id);
    nilai.push(id);
    const { rows } = await this.db.query(
      `UPDATE programs SET ${set.join(', ')} WHERE id = $${nilai.length} RETURNING ${KOLOM}`,
      nilai
    );
    if (!rows[0]) throw new NotFoundError('Program');
    return rows[0];
  }

  async remove(id) {
    const { rowCount } = await this.db.query('DELETE FROM programs WHERE id = $1', [id]);
    if (!rowCount) throw new NotFoundError('Program');
  }

  async reorder(urutan) {
    for (let i = 0; i < urutan.length; i++) {
      await this.db.query('UPDATE programs SET sort_order = $1 WHERE id = $2', [i, urutan[i]]);
    }
  }
}
