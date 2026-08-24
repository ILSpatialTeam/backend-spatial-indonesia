import { PresenceRepository } from '../../domain/repositories/contract.js';

export class PgPresenceRepository extends PresenceRepository {
  constructor(db) {
    super();
    this.db = db;
  }

  async listRecent(limit = 12) {
    const { rows } = await this.db.query(
      'SELECT path, created_at FROM presence_visits ORDER BY created_at DESC LIMIT $1',
      [limit]
    );
    return rows;
  }

  async record(path, ipHash) {
    const { rows } = await this.db.query(
      'INSERT INTO presence_visits (path, visitor_hash) VALUES ($1::text[], $2) RETURNING id, created_at',
      [path, ipHash ?? null]
    );
    return rows[0];
  }

  // Jejak lama tidak pernah ditampilkan — frontend cuma memakai belasan yang
  // terbaru — jadi menyimpannya selamanya hanya membuat tabel tumbuh tanpa
  // pernah dibaca. Dipanggil berkala oleh penjadwal di app.js.
  async prune(sebelum) {
    const { rowCount } = await this.db.query('DELETE FROM presence_visits WHERE created_at < $1', [sebelum]);
    return rowCount;
  }
}
