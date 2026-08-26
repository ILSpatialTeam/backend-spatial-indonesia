import { ProjectCategoryRepository, ProjectRepository } from '../../domain/repositories/contract.js';
import { NotFoundError } from '../../shared/errors.js';

// ── kategori proyek ────────────────────────────────────────────────────────

export class PgProjectCategoryRepository extends ProjectCategoryRepository {
  constructor(db) {
    super();
    this.db = db;
  }

  async listAll() {
    const { rows } = await this.db.query(
      'SELECT id, label, sort_order FROM project_categories ORDER BY sort_order, id'
    );
    return rows;
  }

  async upsert(data) {
    const { rows } = await this.db.query(
      `INSERT INTO project_categories (id, label, sort_order)
       VALUES ($1,$2,$3)
       ON CONFLICT (id) DO UPDATE SET label = $2, sort_order = $3
       RETURNING id, label, sort_order`,
      [data.id, data.label, data.sortOrder ?? 0]
    );
    return rows[0];
  }

  async remove(id) {
    const { rowCount } = await this.db.query('DELETE FROM project_categories WHERE id = $1', [id]);
    if (!rowCount) throw new NotFoundError('Kategori proyek');
  }
}

// ── proyek anggota ─────────────────────────────────────────────────────────

const KOLOM = `p.id, p.title, p.description, p.member_name, p.image_url,
  p.category_id, p.type, p.sort_order, p.is_active, p.created_at, p.updated_at`;

export class PgProjectRepository extends ProjectRepository {
  constructor(db) {
    super();
    this.db = db;
  }

  async listActive() {
    const { rows } = await this.db.query(
      `SELECT ${KOLOM}, c.label AS category_label
       FROM projects p
       LEFT JOIN project_categories c ON c.id = p.category_id
       WHERE p.is_active
       ORDER BY p.sort_order, p.created_at`
    );
    return rows;
  }

  async listAll({ categoryId = null } = {}) {
    const where = categoryId ? 'WHERE p.category_id = $1' : '';
    const params = categoryId ? [categoryId] : [];
    const { rows } = await this.db.query(
      `SELECT ${KOLOM}, c.label AS category_label
       FROM projects p
       LEFT JOIN project_categories c ON c.id = p.category_id
       ${where}
       ORDER BY p.sort_order, p.created_at`,
      params
    );
    return rows;
  }

  async findById(id) {
    const { rows } = await this.db.query(
      `SELECT ${KOLOM}, c.label AS category_label
       FROM projects p
       LEFT JOIN project_categories c ON c.id = p.category_id
       WHERE p.id = $1`,
      [id]
    );
    if (!rows[0]) throw new NotFoundError('Proyek');
    return rows[0];
  }

  async create(data) {
    const { rows } = await this.db.query(
      `INSERT INTO projects (title, description, member_name, image_url, category_id, type, sort_order, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, title, description, member_name, image_url, category_id, type, sort_order, is_active, created_at, updated_at`,
      [data.title, data.description ?? '', data.memberName, data.imageUrl ?? null,
       data.categoryId ?? null, data.type ?? '', data.sortOrder ?? 0, data.isActive ?? true]
    );
    return rows[0];
  }

  async update(id, patch) {
    const peta = {
      title: 'title', description: 'description', memberName: 'member_name',
      imageUrl: 'image_url', categoryId: 'category_id', type: 'type',
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
      `UPDATE projects SET ${set.join(', ')} WHERE id = $${nilai.length}
       RETURNING id, title, description, member_name, image_url, category_id, type, sort_order, is_active, created_at, updated_at`,
      nilai
    );
    if (!rows[0]) throw new NotFoundError('Proyek');
    return rows[0];
  }

  async remove(id) {
    const { rowCount } = await this.db.query('DELETE FROM projects WHERE id = $1', [id]);
    if (!rowCount) throw new NotFoundError('Proyek');
  }

  async reorder(urutan) {
    for (let i = 0; i < urutan.length; i++) {
      await this.db.query('UPDATE projects SET sort_order = $1 WHERE id = $2', [i, urutan[i]]);
    }
  }
}
