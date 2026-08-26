import { TeamRepository } from '../../domain/repositories/contract.js';
import { NotFoundError } from '../../shared/errors.js';

const KOLOM = 'id, name, role, photo_url, sort_order, is_active, created_at, updated_at';

export class PgTeamRepository extends TeamRepository {
  constructor(db) {
    super();
    this.db = db;
  }

  async listActive() {
    const { rows } = await this.db.query(
      `SELECT ${KOLOM} FROM team_members WHERE is_active ORDER BY sort_order, created_at`
    );
    return rows;
  }

  async listAll() {
    const { rows } = await this.db.query(
      `SELECT ${KOLOM} FROM team_members ORDER BY sort_order, created_at`
    );
    return rows;
  }

  async findById(id) {
    const { rows } = await this.db.query(`SELECT ${KOLOM} FROM team_members WHERE id = $1`, [id]);
    if (!rows[0]) throw new NotFoundError('Anggota tim');
    return rows[0];
  }

  async create(data) {
    const { rows } = await this.db.query(
      `INSERT INTO team_members (name, role, photo_url, sort_order, is_active)
       VALUES ($1,$2,$3,$4,$5) RETURNING ${KOLOM}`,
      [data.name, data.role, data.photoUrl ?? null, data.sortOrder ?? 0, data.isActive ?? true]
    );
    return rows[0];
  }

  async update(id, patch) {
    const peta = {
      name: 'name', role: 'role', photoUrl: 'photo_url',
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
      `UPDATE team_members SET ${set.join(', ')} WHERE id = $${nilai.length} RETURNING ${KOLOM}`,
      nilai
    );
    if (!rows[0]) throw new NotFoundError('Anggota tim');
    return rows[0];
  }

  async remove(id) {
    const { rowCount } = await this.db.query('DELETE FROM team_members WHERE id = $1', [id]);
    if (!rowCount) throw new NotFoundError('Anggota tim');
  }

  async reorder(urutan) {
    for (let i = 0; i < urutan.length; i++) {
      await this.db.query('UPDATE team_members SET sort_order = $1 WHERE id = $2', [i, urutan[i]]);
    }
  }
}
