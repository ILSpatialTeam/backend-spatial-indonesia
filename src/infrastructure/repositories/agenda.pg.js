import { AgendaRepository } from '../../domain/repositories/contract.js';
import { NotFoundError, ConflictError } from '../../shared/errors.js';

const KOLOM = 'id, kind, title, event_date, place, note, url, is_published, created_at, updated_at';

export class PgAgendaRepository extends AgendaRepository {
  constructor(db) {
    super();
    this.db = db;
  }

  async listPublished() {
    const { rows } = await this.db.query(
      `SELECT ${KOLOM} FROM agenda_events WHERE is_published ORDER BY event_date`
    );
    return rows;
  }

  async listAll() {
    const { rows } = await this.db.query(`SELECT ${KOLOM} FROM agenda_events ORDER BY event_date DESC`);
    return rows;
  }

  async findById(id) {
    const { rows } = await this.db.query(`SELECT ${KOLOM} FROM agenda_events WHERE id = $1`, [id]);
    return rows[0] ?? null;
  }

  async create(data) {
    try {
      const { rows } = await this.db.query(
        `INSERT INTO agenda_events (id, kind, title, event_date, place, note, url, is_published)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING ${KOLOM}`,
        [data.id, data.kind, data.title, data.date, data.place ?? '', data.note ?? '',
         data.url ?? null, data.isPublished ?? true]
      );
      return rows[0];
    } catch (err) {
      if (err.code === '23505') throw new ConflictError(`Agenda dengan id "${data.id}" sudah ada.`);
      throw err;
    }
  }

  async update(id, patch) {
    const peta = {
      kind: 'kind', title: 'title', date: 'event_date', place: 'place',
      note: 'note', url: 'url', isPublished: 'is_published'
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
      `UPDATE agenda_events SET ${set.join(', ')} WHERE id = $${nilai.length} RETURNING ${KOLOM}`,
      nilai
    );
    if (!rows[0]) throw new NotFoundError('Agenda');
    return rows[0];
  }

  async remove(id) {
    const { rowCount } = await this.db.query('DELETE FROM agenda_events WHERE id = $1', [id]);
    if (!rowCount) throw new NotFoundError('Agenda');
  }
}
