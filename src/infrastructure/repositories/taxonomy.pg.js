import { TaxonomyRepository } from '../../domain/repositories/contract.js';
import { NotFoundError, ConflictError } from '../../shared/errors.js';

// Kategori artikel dan frekuensi sparing. Keduanya tabel kecil yang nyaris
// tidak pernah berubah, tapi tetap di database supaya admin bisa mengubah warna
// dan teks petunjuknya tanpa rilis ulang frontend.
export class PgTaxonomyRepository extends TaxonomyRepository {
  constructor(db) {
    super();
    this.db = db;
  }

  async listCategories() {
    const { rows } = await this.db.query(
      'SELECT id, label, color, position FROM article_categories ORDER BY position, id'
    );
    return rows;
  }

  async upsertCategory({ id, label, color, position }) {
    const { rows } = await this.db.query(
      `INSERT INTO article_categories (id, label, color, position)
       VALUES ($1, $2, $3, COALESCE($4, (SELECT COALESCE(MAX(position), 0) + 1 FROM article_categories)))
       ON CONFLICT (id) DO UPDATE
         SET label = EXCLUDED.label, color = EXCLUDED.color, position = EXCLUDED.position
       RETURNING id, label, color, position`,
      [id, label, color, position ?? null]
    );
    return rows[0];
  }

  async removeCategory(id) {
    // Foreign key-nya RESTRICT, jadi kategori yang masih dipakai artikel akan
    // ditolak database. Diterjemahkan ke pesan yang bisa dibaca admin, bukan
    // dilempar mentah sebagai galat Postgres.
    try {
      const { rowCount } = await this.db.query('DELETE FROM article_categories WHERE id = $1', [id]);
      if (!rowCount) throw new NotFoundError('Kategori');
    } catch (err) {
      if (err.code === '23503') {
        throw new ConflictError('Kategori masih dipakai artikel. Pindahkan artikelnya dulu.');
      }
      throw err;
    }
  }

  async listFrequencies() {
    const { rows } = await this.db.query(
      'SELECT id, label, glyph, color, hint, position FROM sparing_frequencies ORDER BY position, id'
    );
    return rows;
  }

  async upsertFrequency({ id, label, glyph, color, hint, position }) {
    const { rows } = await this.db.query(
      `INSERT INTO sparing_frequencies (id, label, glyph, color, hint, position)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, (SELECT COALESCE(MAX(position), 0) + 1 FROM sparing_frequencies)))
       ON CONFLICT (id) DO UPDATE
         SET label = EXCLUDED.label, glyph = EXCLUDED.glyph, color = EXCLUDED.color,
             hint = EXCLUDED.hint, position = EXCLUDED.position
       RETURNING id, label, glyph, color, hint, position`,
      [id, label, glyph, color, hint, position ?? null]
    );
    return rows[0];
  }
}
