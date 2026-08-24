import {
  AdminUserRepository, SessionRepository, AuditRepository
} from '../../domain/repositories/contract.js';
import { NotFoundError, ConflictError } from '../../shared/errors.js';

// Kolom aman untuk dikembalikan ke luar. `password_hash` tidak pernah ada di
// daftar ini — satu-satunya jalan mendapatkannya adalah findByEmail(), yang
// memang hanya dipakai saat memeriksa kata sandi.
const AMAN = 'id, email, name, role, is_active, last_login_at, created_at, updated_at';

export class PgAdminUserRepository extends AdminUserRepository {
  constructor(db) {
    super();
    this.db = db;
  }

  async findByEmail(email) {
    const { rows } = await this.db.query(
      `SELECT ${AMAN}, password_hash FROM admin_users WHERE email = $1`,
      [email]
    );
    return rows[0] ?? null;
  }

  async findById(id) {
    const { rows } = await this.db.query(`SELECT ${AMAN} FROM admin_users WHERE id = $1`, [id]);
    return rows[0] ?? null;
  }

  async list() {
    const { rows } = await this.db.query(`SELECT ${AMAN} FROM admin_users ORDER BY created_at`);
    return rows;
  }

  async create({ email, name, passwordHash, role = 'editor' }) {
    try {
      const { rows } = await this.db.query(
        `INSERT INTO admin_users (email, name, password_hash, role)
         VALUES ($1,$2,$3,$4) RETURNING ${AMAN}`,
        [email, name, passwordHash, role]
      );
      return rows[0];
    } catch (err) {
      if (err.code === '23505') throw new ConflictError('Email ini sudah dipakai akun lain.');
      throw err;
    }
  }

  async update(id, patch) {
    const peta = { email: 'email', name: 'name', role: 'role', isActive: 'is_active', passwordHash: 'password_hash' };
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
      `UPDATE admin_users SET ${set.join(', ')} WHERE id = $${nilai.length} RETURNING ${AMAN}`,
      nilai
    );
    if (!rows[0]) throw new NotFoundError('Akun admin');
    return rows[0];
  }

  async remove(id) {
    const { rowCount } = await this.db.query('DELETE FROM admin_users WHERE id = $1', [id]);
    if (!rowCount) throw new NotFoundError('Akun admin');
  }

  async touchLogin(id) {
    await this.db.query('UPDATE admin_users SET last_login_at = now() WHERE id = $1', [id]);
  }

  async count() {
    const { rows } = await this.db.query('SELECT count(*)::int AS n FROM admin_users');
    return rows[0].n;
  }
}

export class PgSessionRepository extends SessionRepository {
  constructor(db) {
    super();
    this.db = db;
  }

  // `familyId` kosong berarti login baru: default kolomnya membangkitkan
  // keluarga baru. Saat rotasi, keluarga sesi lama diteruskan supaya seluruh
  // rantai turunannya bisa dicabut sekaligus kalau ada token yang dicuri.
  async create({ userId, refreshTokenHash, userAgent, ip, expiresAt, familyId = null }) {
    const { rows } = await this.db.query(
      `INSERT INTO admin_sessions
         (user_id, refresh_token_hash, user_agent, ip, expires_at, family_id)
       VALUES ($1,$2,$3,$4,$5, COALESCE($6::uuid, gen_random_uuid()))
       RETURNING id, user_id, family_id, expires_at, created_at`,
      [userId, refreshTokenHash, userAgent ?? null, ip ?? null, expiresAt, familyId]
    );
    return rows[0];
  }

  // Sesi yang sudah dicabut atau kedaluwarsa dianggap tidak ada. Menyaringnya
  // di SQL, bukan di JavaScript, berarti tidak ada cabang kode yang bisa lupa
  // memeriksanya.
  // Mencari TANPA menyaring yang sudah dicabut, lalu keadaannya dilaporkan apa
  // adanya. Versi sebelumnya menyaring di SQL, dan itu membuat dua hal yang
  // sangat berbeda tidak bisa dibedakan: token yang tidak pernah ada (salah
  // ketik, tebakan) dan token sah yang sudah dirotasi (dipakai lagi oleh
  // seseorang yang menyimpan salinannya). Yang kedua adalah pencurian sesi.
  async findByTokenHash(hash) {
    const { rows } = await this.db.query(
      `SELECT s.id, s.user_id, s.family_id, s.expires_at, s.revoked_at, s.rotated_at,
              u.email, u.name, u.role, u.is_active
       FROM admin_sessions s
       JOIN admin_users u ON u.id = s.user_id
       WHERE s.refresh_token_hash = $1`,
      [hash]
    );
    const s = rows[0];
    if (!s) return null;
    return {
      ...s,
      aktif: !s.revoked_at && new Date(s.expires_at) > new Date(),
      // Sudah pernah dipakai untuk rotasi, lalu muncul lagi.
      dipakaiUlang: Boolean(s.rotated_at)
    };
  }

  // Menandai sesi sebagai sudah dirotasi, bukan sekadar dicabut. Bedanya
  // penting: sesi yang dicabut karena logout memang berakhir, sedangkan sesi
  // yang dirotasi seharusnya tidak pernah muncul lagi — kalau muncul, itu
  // sinyal.
  async markRotated(id) {
    await this.db.query(
      'UPDATE admin_sessions SET revoked_at = now(), rotated_at = now() WHERE id = $1',
      [id]
    );
  }

  // Cabut seluruh keluarga. Dipanggil saat replay terdeteksi: pemilik asli dan
  // pencurinya sama-sama dipaksa masuk ulang, dan itu memang yang diinginkan.
  async revokeFamily(familyId) {
    const { rowCount } = await this.db.query(
      'UPDATE admin_sessions SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL',
      [familyId]
    );
    return rowCount;
  }

  async revoke(id) {
    await this.db.query('UPDATE admin_sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL', [id]);
  }

  async revokeAllForUser(userId) {
    const { rowCount } = await this.db.query(
      'UPDATE admin_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
      [userId]
    );
    return rowCount;
  }

  async pruneExpired() {
    const { rowCount } = await this.db.query(
      "DELETE FROM admin_sessions WHERE expires_at < now() - interval '30 days'"
    );
    return rowCount;
  }
}

export class PgAuditRepository extends AuditRepository {
  constructor(db) {
    super();
    this.db = db;
  }

  async record({ actorId, actorEmail, action, entity, entityId, meta, ip, changes, requestId }) {
    await this.db.query(
      `INSERT INTO audit_logs
         (actor_id, actor_email, action, entity, entity_id, meta, ip, changes, request_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        actorId ?? null, actorEmail ?? null, action, entity, entityId ?? null,
        meta ?? {}, ip ?? null, changes ?? {}, requestId ?? null
      ]
    );
  }

  async list({ limit = 100, offset = 0, entity = null, action = null, actorEmail = null } = {}) {
    const { rows } = await this.db.query(
      `SELECT id, actor_email, action, entity, entity_id, meta, changes, request_id, created_at,
              count(*) OVER () AS total_rows
       FROM audit_logs
       WHERE ($1::text IS NULL OR entity = $1)
         AND ($2::text IS NULL OR action = $2)
         AND ($3::text IS NULL OR actor_email = $3)
       ORDER BY created_at DESC LIMIT $4 OFFSET $5`,
      [entity, action, actorEmail, limit, offset]
    );
    return { rows, total: rows.length ? Number(rows[0].total_rows) : 0 };
  }
}
