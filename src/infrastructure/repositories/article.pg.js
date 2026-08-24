import { ArticleRepository } from '../../domain/repositories/contract.js';
import { NotFoundError } from '../../shared/errors.js';

// Kolom untuk daftar publik. `body_html` sengaja TIDAK ikut: enam badan artikel
// berukuran belasan kilobita, dan daftar itu diminta setiap kali situs dibuka
// sementara yang dibaca paling banyak satu. Isinya baru diambil di findBySlug.
const KOLOM_DAFTAR = `
  id, slug, no, category_id, title, lead, author, cover_url,
  source, external_url, read_minutes, status, published_at, view_count
`;

export class PgArticleRepository extends ArticleRepository {
  constructor(db) {
    super();
    this.db = db;
  }

  async listPublished({ category = null, limit = 50, offset = 0 } = {}) {
    const { rows } = await this.db.query(
      `SELECT ${KOLOM_DAFTAR} FROM articles
       WHERE status = 'published'
         AND ($1::text IS NULL OR category_id = $1)
       ORDER BY published_at DESC, no DESC
       LIMIT $2 OFFSET $3`,
      [category, limit, offset]
    );
    return rows;
  }

  async listForAdmin({ status = null, category = null, search = null, limit = 50, offset = 0 } = {}) {
    const { rows } = await this.db.query(
      `SELECT ${KOLOM_DAFTAR}, created_at, updated_at,
              count(*) OVER () AS total_rows
       FROM articles
       WHERE ($1::article_status IS NULL OR status = $1)
         AND ($2::text IS NULL OR category_id = $2)
         AND ($3::text IS NULL OR title ILIKE '%' || $3 || '%' OR slug ILIKE '%' || $3 || '%')
       ORDER BY updated_at DESC
       LIMIT $4 OFFSET $5`,
      [status, category, search, limit, offset]
    );
    return { rows, total: rows.length ? Number(rows[0].total_rows) : 0 };
  }

  async findBySlug(slug, { publishedOnly = true } = {}) {
    const { rows } = await this.db.query(
      `SELECT * FROM articles
       WHERE slug = $1 AND ($2::boolean IS NOT TRUE OR status = 'published')`,
      [slug, publishedOnly]
    );
    return rows[0] ?? null;
  }

  async findById(id) {
    const { rows } = await this.db.query('SELECT * FROM articles WHERE id = $1', [id]);
    return rows[0] ?? null;
  }

  async takenSlugs() {
    const { rows } = await this.db.query('SELECT slug FROM articles');
    return new Set(rows.map((r) => r.slug));
  }

  // Nomor arsip berikutnya: "001", "002", … Dihitung dari nilai terbesar yang
  // ada, bukan dari jumlah baris — kalau ada artikel yang dihapus, jumlah baris
  // akan mengulang nomor yang sudah pernah dipakai.
  async nextNo() {
    const { rows } = await this.db.query(
      `SELECT COALESCE(MAX(NULLIF(regexp_replace(no, '\\D', '', 'g'), '')::int), 0) + 1 AS berikut
       FROM articles`
    );
    return String(rows[0].berikut).padStart(3, '0');
  }

  async create(data) {
    const { rows } = await this.db.query(
      `INSERT INTO articles
         (slug, no, category_id, title, lead, author, cover_url, source, external_url,
          body_html, read_minutes, status, published_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        data.slug, data.no, data.categoryId, data.title, data.lead ?? '',
        data.author, data.coverUrl ?? null, data.source, data.externalUrl ?? null,
        data.bodyHtml ?? '', data.readMinutes, data.status, data.publishedAt ?? null,
        data.createdBy ?? null
      ]
    );
    return rows[0];
  }

  async update(id, patch) {
    const peta = {
      slug: 'slug', no: 'no', categoryId: 'category_id', title: 'title', lead: 'lead',
      author: 'author', coverUrl: 'cover_url', source: 'source', externalUrl: 'external_url',
      bodyHtml: 'body_html', readMinutes: 'read_minutes', status: 'status', publishedAt: 'published_at'
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
      `UPDATE articles SET ${set.join(', ')} WHERE id = $${nilai.length} RETURNING *`,
      nilai
    );
    if (!rows[0]) throw new NotFoundError('Artikel');
    return rows[0];
  }

  async remove(id) {
    const { rowCount } = await this.db.query('DELETE FROM articles WHERE id = $1', [id]);
    if (!rowCount) throw new NotFoundError('Artikel');
  }

  // Penghitung dibaca tidak-menunggu oleh pemanggilnya: kalau gagal, pembaca
  // tetap dapat artikelnya. Angka kunjungan tidak layak menggagalkan halaman.
  async incrementView(id) {
    await this.db.query('UPDATE articles SET view_count = view_count + 1 WHERE id = $1', [id]);
  }
}
