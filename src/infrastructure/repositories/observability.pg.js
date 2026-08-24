import { SecurityEventRepository, HealthRepository } from '../../domain/repositories/contract.js';

// ── kejadian keamanan ───────────────────────────────────────────────────────
export class PgSecurityEventRepository extends SecurityEventRepository {
  constructor(db) {
    super();
    this.db = db;
  }

  async record(e) {
    const { rows } = await this.db.query(
      `INSERT INTO security_events
         (kind, severity, message, method, path, status, actor_email, ip_hash, user_agent, request_id, meta)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id, created_at`,
      [
        e.kind, e.severity ?? 'info', e.message,
        e.method ?? null, e.path ?? null, e.status ?? null,
        e.actorEmail ?? null, e.ipHash ?? null,
        e.userAgent ? String(e.userAgent).slice(0, 300) : null,
        e.requestId ?? null, e.meta ?? {}
      ]
    );
    return rows[0];
  }

  async list({ kind = null, severity = null, sejak = null, limit = 50, offset = 0 } = {}) {
    const { rows } = await this.db.query(
      `SELECT id, kind, severity, message, method, path, status, actor_email,
              ip_hash, user_agent, request_id, meta, created_at,
              count(*) OVER () AS total_rows
       FROM security_events
       WHERE ($1::text IS NULL OR kind = $1)
         AND ($2::security_severity IS NULL OR severity = $2)
         AND ($3::timestamptz IS NULL OR created_at >= $3)
       ORDER BY created_at DESC
       LIMIT $4 OFFSET $5`,
      [kind, severity, sejak, limit, offset]
    );
    return { rows, total: rows.length ? Number(rows[0].total_rows) : 0 };
  }

  // Satu query untuk seluruh kotak ringkasan di halaman pemantauan. Enam
  // COUNT terpisah akan jadi enam perjalanan ke database untuk satu layar.
  async ringkasan(sejak) {
    const { rows } = await this.db.query(
      `SELECT
         count(*)::int AS total,
         count(*) FILTER (WHERE severity = 'critical')::int AS kritis,
         count(*) FILTER (WHERE severity = 'warning')::int AS peringatan,
         count(*) FILTER (WHERE kind = 'login_failed')::int AS login_gagal,
         count(*) FILTER (WHERE kind = 'rate_limited')::int AS dibatasi,
         count(*) FILTER (WHERE status >= 500)::int AS galat_server,
         count(DISTINCT ip_hash)::int AS sumber_unik
       FROM security_events
       WHERE created_at >= $1`,
      [sejak]
    );
    return rows[0];
  }

  // Deret harian untuk grafik. generate_series dipakai supaya hari tanpa
  // kejadian tetap muncul sebagai nol — grafik yang melompati hari kosong
  // berbohong tentang bentuk trennya.
  async deret(hari = 14) {
    const { rows } = await this.db.query(
      `SELECT d::date AS hari,
              COALESCE(s.total, 0)::int AS total,
              COALESCE(s.berat, 0)::int AS berat
       FROM generate_series(
              date_trunc('day', now()) - make_interval(days => $1::int - 1),
              date_trunc('day', now()),
              interval '1 day') AS d
       LEFT JOIN (
         SELECT date_trunc('day', created_at) AS hari,
                count(*) AS total,
                count(*) FILTER (WHERE severity IN ('warning', 'critical')) AS berat
         FROM security_events
         WHERE created_at >= date_trunc('day', now()) - make_interval(days => $1::int - 1)
         GROUP BY 1
       ) s ON s.hari = d
       ORDER BY d`,
      [hari]
    );
    return rows;
  }

  async sumberTeratas(sejak, limit = 8) {
    const { rows } = await this.db.query(
      `SELECT ip_hash,
              count(*)::int AS jumlah,
              count(*) FILTER (WHERE severity IN ('warning', 'critical'))::int AS berat,
              array_agg(DISTINCT kind) AS jenis,
              max(created_at) AS terakhir
       FROM security_events
       WHERE created_at >= $1 AND ip_hash IS NOT NULL
       GROUP BY ip_hash
       ORDER BY berat DESC, jumlah DESC
       LIMIT $2`,
      [sejak, limit]
    );
    return rows;
  }

  async prune(sebelum) {
    const { rowCount } = await this.db.query('DELETE FROM security_events WHERE created_at < $1', [sebelum]);
    return rowCount;
  }
}

// ── kesehatan database ──────────────────────────────────────────────────────
//
// Semua kueri di sini membaca katalog sistem Postgres, bukan data aplikasi.
// Tidak ada yang menulis, dan semuanya murah — halaman pemantauan boleh
// menyegarkan dirinya tanpa membebani database yang sedang diamatinya.
export class PgHealthRepository extends HealthRepository {
  constructor(db) {
    super();
    this.db = db;
  }

  async database() {
    const { rows } = await this.db.query(
      `SELECT
         current_database() AS nama,
         pg_database_size(current_database()) AS ukuran_byte,
         pg_size_pretty(pg_database_size(current_database())) AS ukuran,
         (SELECT count(*)::int FROM pg_stat_activity WHERE datname = current_database()) AS koneksi,
         (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') AS koneksi_maks,
         extract(epoch FROM (now() - pg_postmaster_start_time()))::bigint AS uptime_detik,
         (SELECT version()) AS versi,
         s.xact_commit, s.xact_rollback, s.blks_hit, s.blks_read, s.deadlocks,
         s.tup_inserted, s.tup_updated, s.tup_deleted
       FROM pg_stat_database s
       WHERE s.datname = current_database()`
    );
    const r = rows[0];
    const hit = Number(r.blks_hit ?? 0);
    const read = Number(r.blks_read ?? 0);
    return {
      ...r,
      // Rasio cache: berapa persen pembacaan blok dilayani dari memori. Di
      // bawah ~95% biasanya berarti shared_buffers terlalu kecil untuk data
      // yang sedang aktif dipakai.
      cache_hit_ratio: hit + read > 0 ? Number(((hit / (hit + read)) * 100).toFixed(2)) : null
    };
  }

  async tabel() {
    const { rows } = await this.db.query(
      `SELECT c.relname AS tabel,
              pg_total_relation_size(c.oid) AS ukuran_byte,
              pg_size_pretty(pg_total_relation_size(c.oid)) AS ukuran,
              COALESCE(s.n_live_tup, 0)::bigint AS baris,
              COALESCE(s.n_dead_tup, 0)::bigint AS baris_mati,
              s.last_autovacuum, s.last_autoanalyze
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
       WHERE n.nspname = 'public' AND c.relkind = 'r'
       ORDER BY pg_total_relation_size(c.oid) DESC`
    );
    return rows;
  }

  async koneksi() {
    const { rows } = await this.db.query(
      `SELECT state, count(*)::int AS jumlah,
              max(extract(epoch FROM (now() - state_change)))::int AS terlama_detik
       FROM pg_stat_activity
       WHERE datname = current_database()
       GROUP BY state
       ORDER BY jumlah DESC`
    );
    return rows;
  }

  // Kueri yang sedang berjalan lebih dari 5 detik. pg_stat_statements tidak
  // diandalkan di sini karena ia ekstensi opsional yang sering tidak dipasang
  // di lingkungan terkelola — ini bekerja di mana pun.
  async kueriLambat() {
    const { rows } = await this.db.query(
      `SELECT pid,
              extract(epoch FROM (now() - query_start))::int AS berjalan_detik,
              state,
              left(query, 200) AS kueri
       FROM pg_stat_activity
       WHERE datname = current_database()
         AND state <> 'idle'
         AND query_start < now() - interval '5 seconds'
         AND pid <> pg_backend_pid()
       ORDER BY query_start
       LIMIT 10`
    );
    return rows;
  }

  // Indeks yang tidak pernah dipakai adalah ongkos tulis tanpa imbalan baca.
  // Ditampilkan sebagai saran, bukan alarm: indeks yang baru dibuat wajar
  // berjumlah nol.
  async indeksTerpakai() {
    const { rows } = await this.db.query(
      `SELECT relname AS tabel, indexrelname AS indeks,
              idx_scan::bigint AS dipakai,
              pg_size_pretty(pg_relation_size(indexrelid)) AS ukuran
       FROM pg_stat_user_indexes
       WHERE schemaname = 'public'
       ORDER BY idx_scan ASC, pg_relation_size(indexrelid) DESC
       LIMIT 12`
    );
    return rows;
  }
}
