import { logger } from '../../shared/logger.js';

// Pemantauan: keamanan, kesehatan database, dan jejak perubahan.
//
// Ada satu aturan yang menentukan seluruh bentuk service ini: **mencatat tidak
// boleh menggagalkan permintaan.** Kalau tabel security_events penuh, Postgres
// sedang sibuk, atau kolomnya berubah, pengunjung situs tidak boleh melihat
// galat 500 gara-gara sistem pemantauannya sendiri. Karena itu `catat()` tidak
// pernah melempar dan tidak pernah ditunggu pemanggilnya.
const JAM = 3_600_000;
const HARI = 24 * JAM;

// Bobot tiap jenis kejadian. Dikumpulkan di sini, bukan disebar di pemanggil,
// supaya "seberapa gawat sebuah login gagal" punya satu jawaban.
export const JENIS = Object.freeze({
  login_failed:      { severity: 'notice',   label: 'Login gagal' },
  login_ok:          { severity: 'info',     label: 'Login berhasil' },
  logout:            { severity: 'info',     label: 'Keluar' },
  account_locked:    { severity: 'warning',  label: 'Akun dikunci sementara' },
  rate_limited:      { severity: 'warning',  label: 'Batas laju terlampaui' },
  csrf_rejected:     { severity: 'warning',  label: 'Token CSRF ditolak' },
  cors_rejected:     { severity: 'warning',  label: 'Origin ditolak' },
  unauthorized:      { severity: 'notice',   label: 'Akses tanpa sesi' },
  forbidden:         { severity: 'warning',  label: 'Akses ditolak' },
  validation_failed: { severity: 'info',     label: 'Data tidak valid' },
  upload_rejected:   { severity: 'notice',   label: 'Unggahan ditolak' },
  server_error:      { severity: 'critical', label: 'Galat server' },
  not_found:         { severity: 'info',     label: 'Rute tidak ada' },
  password_changed:  { severity: 'notice',   label: 'Kata sandi diganti' },
  session_revoked:   { severity: 'notice',   label: 'Sesi dicabut' },
  html_sanitized:    { severity: 'notice',   label: 'HTML dibersihkan' }
});

export class MonitoringService {
  constructor({ security, health, audit, cache }) {
    this.security = security;
    this.health = health;
    this.audit = audit;
    this.cache = cache;
  }

  // Dipanggil dari middleware dan service. Sengaja mengembalikan void dan
  // menelan galatnya sendiri — lihat catatan di atas.
  catat(event) {
    const profil = JENIS[event.kind] ?? { severity: 'info' };
    const lengkap = { severity: profil.severity, ...event };
    this.security.record(lengkap).catch((err) => {
      logger.warn({ err, kind: event.kind }, 'kejadian keamanan gagal dicatat');
    });
  }

  // ── halaman pemantauan ────────────────────────────────────────────────────
  async ikhtisar({ jam = 24 } = {}) {
    const sejak = new Date(Date.now() - jam * JAM);
    const [ringkas, deret, sumber, db, terbaru] = await Promise.all([
      this.security.ringkasan(sejak),
      this.security.deret(14),
      this.security.sumberTeratas(sejak, 6),
      this.health.database(),
      this.security.list({ limit: 8 })
    ]);

    return {
      periodeJam: jam,
      keamanan: ringkas,
      deret,
      sumberTeratas: sumber,
      database: this._bacaDatabase(db),
      terbaru: terbaru.rows,
      // Penilaian ringkas yang bisa dibaca sekilas. Tanpa ini, halaman
      // pemantauan cuma tumpukan angka yang menuntut orang menafsirkannya
      // sendiri setiap kali membuka.
      status: this._nilai(ringkas, db)
    };
  }

  _bacaDatabase(db) {
    return {
      nama: db.nama,
      versi: String(db.versi).split(' ').slice(0, 2).join(' '),
      ukuran: db.ukuran,
      ukuranByte: Number(db.ukuran_byte),
      koneksi: db.koneksi,
      koneksiMaks: db.koneksi_maks,
      koneksiPersen: Math.round((db.koneksi / db.koneksi_maks) * 100),
      uptimeJam: Math.round(Number(db.uptime_detik) / 3600),
      cacheHitRatio: db.cache_hit_ratio,
      commit: Number(db.xact_commit),
      rollback: Number(db.xact_rollback),
      deadlock: Number(db.deadlocks),
      tulis: Number(db.tup_inserted) + Number(db.tup_updated) + Number(db.tup_deleted)
    };
  }

  // Aturan penilaiannya sengaja sedikit dan bisa dijelaskan. Skor yang
  // dihitung dari sepuluh faktor berbobot terlihat pintar, tapi tidak ada yang
  // bisa menjawab kenapa angkanya turun.
  //
  // Yang dikembalikan KODE, bukan kalimat. Dashboard punya dua bahasa, dan
  // kalimat jadi dari server akan selalu muncul dalam satu bahasa apa pun yang
  // dipilih pengguna. Menerjemahkan di server berarti server harus tahu bahasa
  // pengguna; menyerahkan kodenya ke klien jauh lebih sederhana.
  _nilai(k, db) {
    const catatan = [];
    let tingkat = 'aman';
    const naik = (ke) => { if (tingkat !== 'kritis') tingkat = ke; };

    if (k.kritis > 0) {
      tingkat = 'kritis';
      catatan.push({ kode: 'serverError', n: k.kritis });
    }
    if (k.login_gagal >= 20) {
      naik('waspada');
      catatan.push({ kode: 'loginGagalBanyak', n: k.login_gagal });
    } else if (k.login_gagal > 0) {
      catatan.push({ kode: 'loginGagal', n: k.login_gagal });
    }
    if (k.dibatasi >= 30) {
      naik('waspada');
      catatan.push({ kode: 'rateLimit', n: k.dibatasi });
    }
    if (db.cache_hit_ratio !== null && db.cache_hit_ratio < 90) {
      catatan.push({ kode: 'cacheRendah', n: db.cache_hit_ratio });
    }
    if (Number(db.deadlocks) > 0) {
      naik('waspada');
      catatan.push({ kode: 'deadlock', n: Number(db.deadlocks) });
    }
    const persenKoneksi = Math.round((db.koneksi / db.koneksi_maks) * 100);
    if (persenKoneksi > 80) {
      tingkat = 'kritis';
      catatan.push({ kode: 'koneksiPenuh', n: persenKoneksi });
    }

    if (!catatan.length) catatan.push({ kode: 'bersih' });
    return { tingkat, catatan };
  }

  async daftarKejadian(opsi) {
    const { rows, total } = await this.security.list(opsi);
    return { items: rows, total };
  }

  async kesehatanDatabase() {
    const [db, tabel, koneksi, lambat, indeks] = await Promise.all([
      this.health.database(),
      this.health.tabel(),
      this.health.koneksi(),
      this.health.kueriLambat(),
      this.health.indeksTerpakai()
    ]);
    return {
      database: this._bacaDatabase(db),
      tabel: tabel.map((t) => ({
        ...t,
        baris: Number(t.baris),
        barisMati: Number(t.baris_mati),
        ukuranByte: Number(t.ukuran_byte),
        // Rasio baris mati tinggi berarti autovacuum tertinggal, dan itu
        // penyebab paling umum tabel membengkak tanpa data bertambah.
        rasioMati: Number(t.baris) > 0
          ? Number(((Number(t.baris_mati) / Number(t.baris)) * 100).toFixed(1))
          : 0
      })),
      koneksi,
      kueriLambat: lambat,
      indeks: indeks.map((i) => ({ ...i, dipakai: Number(i.dipakai) }))
    };
  }

  async jejakPerubahan(opsi) {
    const { rows, total } = await this.audit.list(opsi);
    return { items: rows, total };
  }

  async bersihkan() {
    // Kejadian keamanan disimpan 90 hari. Cukup panjang untuk menyelidiki
    // insiden, cukup pendek supaya tabelnya tidak jadi beban permanen.
    return this.security.prune(new Date(Date.now() - 90 * HARI));
  }
}
