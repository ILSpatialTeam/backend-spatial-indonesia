import { SparingRepository } from '../../domain/repositories/contract.js';
import { NotFoundError } from '../../shared/errors.js';

const BENTUK = `
  s.id, s.frequency_id AS freq, s.author_name AS name, s.body AS text,
  s.anchor_x, s.anchor_y, s.boost, s.created_at
`;

export class PgSparingRepository extends SparingRepository {
  constructor(db) {
    super();
    this.db = db;
  }

  async listApprovedByArticle(articleId) {
    const { rows } = await this.db.query(
      `SELECT ${BENTUK} FROM sparings s
       WHERE s.article_id = $1 AND s.status = 'approved'
       ORDER BY s.created_at`,
      [articleId]
    );
    return rows;
  }

  // Semua sparing yang disetujui, dikelompokkan per slug artikel — bentuk yang
  // persis dipakai frontend sebagai SEED_SPARING.
  //
  // Satu query untuk enam artikel, bukan enam. Cincin sparing digambar
  // bersamaan dengan bulan artikelnya saat scene dibangun, jadi memuatnya
  // terpisah cuma menambah bulatan jaringan tanpa menunda apa pun.
  async listApprovedGrouped() {
    const { rows } = await this.db.query(
      `SELECT a.slug,
              jsonb_agg(jsonb_build_object(
                'id', s.id, 'freq', s.frequency_id, 'name', s.author_name,
                'text', s.body, 'anchor', jsonb_build_array(s.anchor_x, s.anchor_y),
                'boost', s.boost, 'at', to_char(s.created_at, 'YYYY-MM-DD')
              ) ORDER BY s.created_at) AS list
       FROM sparings s
       JOIN articles a ON a.id = s.article_id
       WHERE s.status = 'approved' AND a.status = 'published'
       GROUP BY a.slug`
    );
    return Object.fromEntries(rows.map((r) => [r.slug, r.list]));
  }

  async listForModeration({ status = 'pending', limit = 100, offset = 0 } = {}) {
    const { rows } = await this.db.query(
      `SELECT s.*, a.slug AS article_slug, a.title AS article_title,
              count(*) OVER () AS total_rows
       FROM sparings s
       JOIN articles a ON a.id = s.article_id
       WHERE ($1::moderation_status IS NULL OR s.status = $1)
       ORDER BY s.created_at DESC
       LIMIT $2 OFFSET $3`,
      [status, limit, offset]
    );
    return { rows, total: rows.length ? Number(rows[0].total_rows) : 0 };
  }

  async create(data) {
    const { rows } = await this.db.query(
      `INSERT INTO sparings (article_id, frequency_id, author_name, body, anchor_x, anchor_y, status, ip_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, frequency_id AS freq, author_name AS name, body AS text,
                 anchor_x, anchor_y, boost, status, created_at`,
      [
        data.articleId, data.frequencyId, data.authorName, data.body,
        data.anchorX, data.anchorY, data.status, data.ipHash ?? null
      ]
    );
    return rows[0];
  }

  async setStatus(id, status) {
    const { rows } = await this.db.query(
      'UPDATE sparings SET status = $2 WHERE id = $1 RETURNING id, status',
      [id, status]
    );
    if (!rows[0]) throw new NotFoundError('Sparing');
    return rows[0];
  }

  async boost(id) {
    const { rows } = await this.db.query(
      `UPDATE sparings SET boost = boost + 1
       WHERE id = $1 AND status = 'approved'
       RETURNING id, boost`,
      [id]
    );
    if (!rows[0]) throw new NotFoundError('Sparing');
    return rows[0];
  }

  async remove(id) {
    const { rowCount } = await this.db.query('DELETE FROM sparings WHERE id = $1', [id]);
    if (!rowCount) throw new NotFoundError('Sparing');
  }

  // Dipakai pembatas kiriman: berapa sparing dari sumber yang sama sejak kapan.
  // Batas per-IP di lapisan HTTP menahan banjir; ini menahan yang lolos karena
  // proses di-restart dan penghitung di memori ikut hilang.
  async countRecentFrom(ipHash, sejak) {
    if (!ipHash) return 0;
    const { rows } = await this.db.query(
      'SELECT count(*)::int AS n FROM sparings WHERE ip_hash = $1 AND created_at > $2',
      [ipHash, sejak]
    );
    return rows[0].n;
  }
}
