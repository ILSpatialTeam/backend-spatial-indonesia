import { AgendaRepository } from '../../domain/repositories/contract.js';
import { NotFoundError, ConflictError } from '../../shared/errors.js';

// Kolom acara, tanpa kursi terpakai.
const KOLOM = `a.id, a.kind, a.title, a.event_date, a.starts_at, a.ends_at, a.place, a.address,
  a.note, a.description_html, a.url, a.registration, a.register_url, a.capacity,
  a.registration_closes_at, a.is_published, a.created_at, a.updated_at`;

// Kursi terpakai selalu ikut, juga untuk acara tanpa pendaftaran (hasilnya 0).
//
// Subkueri, bukan LEFT JOIN + GROUP BY: dengan GROUP BY seluruh daftar kolom di
// atas harus diulang di klausa itu, dan setiap kolom baru yang lupa ditambahkan
// jadi galat yang baru terlihat saat kueri dijalankan. Indeks
// `event_registrations_acara_idx` membuat subkuerinya murah.
const KURSI = `(SELECT count(*) FROM event_registrations r
                 WHERE r.event_id = a.id AND r.status = 'confirmed') AS seats_taken`;

const PILIH = `SELECT ${KOLOM}, ${KURSI} FROM agenda_events a`;

// Kolom yang boleh ditulis admin, dipetakan dari nama di API ke nama di tabel.
// Dipakai create dan update sekaligus supaya tidak ada kolom yang bisa diubah
// lewat satu jalur tapi tidak lewat jalur lain.
const PETA = {
  kind: 'kind',
  title: 'title',
  date: 'event_date',
  startsAt: 'starts_at',
  endsAt: 'ends_at',
  place: 'place',
  address: 'address',
  note: 'note',
  descriptionHtml: 'description_html',
  url: 'url',
  registration: 'registration',
  registerUrl: 'register_url',
  capacity: 'capacity',
  registrationClosesAt: 'registration_closes_at',
  isPublished: 'is_published'
};

export class PgAgendaRepository extends AgendaRepository {
  constructor(db) {
    super();
    this.db = db;
  }

  async listPublished() {
    const { rows } = await this.db.query(`${PILIH} WHERE a.is_published ORDER BY a.event_date`);
    return rows;
  }

  async listAll() {
    const { rows } = await this.db.query(`${PILIH} ORDER BY a.event_date DESC`);
    return rows;
  }

  async findById(id) {
    const { rows } = await this.db.query(`${PILIH} WHERE a.id = $1`, [id]);
    return rows[0] ?? null;
  }

  async findPublishedById(id) {
    const { rows } = await this.db.query(`${PILIH} WHERE a.id = $1 AND a.is_published`, [id]);
    return rows[0] ?? null;
  }

  async create(data) {
    const kolom = [];
    const tanda = [];
    const nilai = [];
    const tambah = (nama, v) => { nilai.push(v); kolom.push(nama); tanda.push(`$${nilai.length}`); };

    tambah('id', data.id);
    for (const [kunci, nama] of Object.entries(PETA)) {
      if (data[kunci] !== undefined) tambah(nama, data[kunci]);
    }

    try {
      const { rows } = await this.db.query(
        `INSERT INTO agenda_events (${kolom.join(', ')}) VALUES (${tanda.join(', ')}) RETURNING id`,
        nilai
      );
      return this.findById(rows[0].id);
    } catch (err) {
      if (err.code === '23505') throw new ConflictError(`Agenda dengan id "${data.id}" sudah ada.`);
      throw err;
    }
  }

  async update(id, patch) {
    const set = [];
    const nilai = [];
    for (const [kunci, kolom] of Object.entries(PETA)) {
      if (patch[kunci] !== undefined) {
        nilai.push(patch[kunci]);
        set.push(`${kolom} = $${nilai.length}`);
      }
    }
    if (!set.length) return this.findById(id);
    nilai.push(id);
    const { rows } = await this.db.query(
      `UPDATE agenda_events SET ${set.join(', ')} WHERE id = $${nilai.length} RETURNING id`,
      nilai
    );
    if (!rows[0]) throw new NotFoundError('Agenda');
    return this.findById(id);
  }

  async remove(id) {
    const { rowCount } = await this.db.query('DELETE FROM agenda_events WHERE id = $1', [id]);
    if (!rowCount) throw new NotFoundError('Agenda');
  }

  // ── pendaftar ─────────────────────────────────────────────────────────────

  async listRegistrations(eventId) {
    const { rows } = await this.db.query(
      `SELECT id, event_id, name, email, phone, note, status, created_at
         FROM event_registrations
        WHERE event_id = $1
        ORDER BY created_at DESC`,
      [eventId]
    );
    return rows;
  }

  // Mendaftar, dengan kuota yang benar-benar dijaga.
  //
  // Menghitung kursi lalu menyisipkan dalam dua kueri terpisah adalah lomba
  // yang pasti kalah suatu hari: dua orang membaca "sisa 1" pada milidetik yang
  // sama, keduanya lolos, dan acara berkuota 40 punya 41 pendaftar. Baris
  // acaranya dikunci lebih dulu (`FOR UPDATE`), jadi pendaftaran kedua menunggu
  // yang pertama selesai sebelum menghitung ulang.
  //
  // Yang dikunci baris ACARA, bukan tabel pendaftaran: yang harus berurutan
  // adalah pendaftaran ke acara yang sama, sementara dua acara berbeda tidak
  // punya alasan saling menunggu.
  async register(eventId, data) {
    return this.db.withTransaction(async (tx) => {
      const { rows: acara } = await tx.query(
        'SELECT id, capacity, registration FROM agenda_events WHERE id = $1 FOR UPDATE',
        [eventId]
      );
      if (!acara[0]) throw new NotFoundError('Agenda');

      const kapasitas = acara[0].capacity;
      if (kapasitas !== null) {
        const { rows: hitung } = await tx.query(
          `SELECT count(*)::int AS n FROM event_registrations
            WHERE event_id = $1 AND status = 'confirmed'`,
          [eventId]
        );
        if (hitung[0].n >= kapasitas) {
          throw new ConflictError('Kuota acara ini sudah penuh.', { reason: 'full' });
        }
      }

      try {
        const { rows } = await tx.query(
          `INSERT INTO event_registrations (event_id, name, email, phone, note, ip_hash, user_agent)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           RETURNING id, event_id, name, email, phone, note, status, created_at`,
          [eventId, data.name, data.email, data.phone ?? '', data.note ?? '',
           data.ipHash ?? null, data.userAgent ?? null]
        );

        const { rows: sisa } = await tx.query(
          `SELECT count(*)::int AS n FROM event_registrations
            WHERE event_id = $1 AND status = 'confirmed'`,
          [eventId]
        );
        return { registration: rows[0], seatsTaken: sisa[0].n, capacity: kapasitas };
      } catch (err) {
        // Indeks uniknya parsial (hanya 'confirmed'), jadi ini benar-benar
        // berarti "email ini sudah punya kursi yang berlaku" — bukan sisa
        // pendaftaran lama yang sudah dibatalkan.
        if (err.code === '23505') {
          throw new ConflictError('Email ini sudah terdaftar di acara tersebut.', { reason: 'duplicate' });
        }
        throw err;
      }
    });
  }

  async cancelRegistration(id) {
    const { rows } = await this.db.query(
      `UPDATE event_registrations SET status = 'cancelled' WHERE id = $1 AND status = 'confirmed'
       RETURNING id, event_id`,
      [id]
    );
    if (!rows[0]) throw new NotFoundError('Pendaftaran');
    return rows[0];
  }
}
