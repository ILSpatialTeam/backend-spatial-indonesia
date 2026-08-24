import { randomBytes } from 'node:crypto';
import { logger } from '../../shared/logger.js';

// Presence live: siapa yang sedang membuka situs, dan sedang melihat planet apa.
//
// ── Kenapa di memori, bukan di database ─────────────────────────────────────
//
// Data ini basi dalam hitungan detik dan tidak ada gunanya setelah orangnya
// pergi. Menulisnya ke Postgres berarti satu INSERT tiap kali seseorang
// mengklik planet, plus satu tabel yang isinya harus terus dibersihkan — untuk
// informasi yang tidak akan pernah dibaca lagi besok.
//
// Jejak yang memang layak disimpan sudah punya tempatnya sendiri
// (`presence_visits`), dan itu ditulis sekali saat pengunjung pergi.
//
// ── Kenapa SSE, bukan WebSocket ─────────────────────────────────────────────
//
// Yang dibutuhkan cuma satu arah: server memberi tahu klien siapa saja yang
// ada. Laporan dari klien ("saya sekarang di planet Karya") tetap lewat POST
// biasa yang sudah punya rate limit dan validasi. WebSocket menambah protokol
// baru untuk kemampuan dua arah yang tidak dipakai.
const HIDUP_MS = 90_000;      // tanpa kabar selama ini, dianggap pergi
const SAPU_MS = 15_000;
const DENYUT_MS = 20_000;     // komentar SSE agar proxy tidak menutup koneksi
const MAKS_TAMU = 200;

// Warna diambil dari id, bukan diacak: pengunjung yang sama selalu tampil
// dengan warna yang sama selama sesinya, dan tidak ada yang perlu disimpan.
const PALET = ['#9E94F9', '#a99bf2', '#5ad1c0', '#f2a65a', '#cfc9ff', '#7c6cf0', '#8ad9cd'];
const warnaDari = (id) => PALET[[...id].reduce((n, c) => n + c.charCodeAt(0), 0) % PALET.length];

export class PresenceHub {
  constructor({ clock = Date } = {}) {
    this.tamu = new Map();      // id → { id, planet, warna, sejak, terakhir }
    this.aliran = new Map();    // id → res (koneksi SSE)
    this.clock = clock;

    this.penyapu = setInterval(() => this.sapu(), SAPU_MS);
    this.penyapu.unref?.();
    this.pendenyut = setInterval(() => this.denyut(), DENYUT_MS);
    this.pendenyut.unref?.();
  }

  get jumlah() { return this.tamu.size; }

  // ── koneksi ───────────────────────────────────────────────────────────────
  gabung(res) {
    if (this.tamu.size >= MAKS_TAMU) return null;

    const id = randomBytes(6).toString('base64url');
    const tamu = { id, planet: null, warna: warnaDari(id), sejak: this.clock.now(), terakhir: this.clock.now() };
    this.tamu.set(id, tamu);
    this.aliran.set(id, res);

    // Pesan pertama membawa id milik pengunjung ini sekaligus daftar siapa saja
    // yang sudah ada. Tanpa snapshot awal, layar akan kosong sampai orang
    // pertama kebetulan berpindah planet.
    this.kirimKe(id, 'hello', {
      id,
      warna: tamu.warna,
      tamu: this.daftar().filter((v) => v.id !== id)
    });
    this.siarkan('join', this.ringkas(tamu), id);
    return id;
  }

  keluar(id) {
    if (!this.tamu.delete(id)) return;
    this.aliran.delete(id);
    this.siarkan('leave', { id });
  }

  // ── pergerakan ────────────────────────────────────────────────────────────
  pindah(id, planet) {
    const tamu = this.tamu.get(id);
    // Id yang tidak dikenal diabaikan diam-diam, bukan dijadikan error. Koneksi
    // SSE bisa putus lalu klien masih sempat mengirim satu laporan terakhir
    // dengan id lamanya; itu kejadian normal, bukan kesalahan.
    if (!tamu) return false;
    tamu.terakhir = this.clock.now();
    if (tamu.planet === planet) return true;      // denyut saja, bukan pindah
    tamu.dari = tamu.planet;
    tamu.planet = planet;
    this.siarkan('move', this.ringkas(tamu));
    return true;
  }

  // ── siaran ────────────────────────────────────────────────────────────────
  ringkas = (t) => ({ id: t.id, planet: t.planet, dari: t.dari ?? null, warna: t.warna });
  daftar = () => [...this.tamu.values()].map(this.ringkas);

  kirimKe(id, jenis, data) {
    const res = this.aliran.get(id);
    if (!res) return;
    try {
      res.write(`event: ${jenis}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch {
      // Koneksi sudah mati tapi handler 'close'-nya belum sempat jalan.
      this.keluar(id);
    }
  }

  siarkan(jenis, data, kecuali = null) {
    const muatan = `event: ${jenis}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const [id, res] of this.aliran) {
      if (id === kecuali) continue;
      try { res.write(muatan); } catch { this.keluar(id); }
    }
  }

  // Komentar SSE (`:`) tidak memicu event apa pun di klien, tapi cukup untuk
  // membuat nginx dan load balancer menganggap koneksinya masih hidup.
  denyut() {
    for (const [id, res] of this.aliran) {
      try { res.write(': ping\n\n'); } catch { this.keluar(id); }
    }
  }

  sapu() {
    const batas = this.clock.now() - HIDUP_MS;
    let dibuang = 0;
    for (const [id, t] of this.tamu) {
      if (t.terakhir < batas) { this.keluar(id); dibuang += 1; }
    }
    if (dibuang) logger.debug({ dibuang, sisa: this.tamu.size }, 'presence disapu');
  }

  tutup() {
    clearInterval(this.penyapu);
    clearInterval(this.pendenyut);
    for (const res of this.aliran.values()) { try { res.end(); } catch { /* sudah tertutup */ } }
    this.tamu.clear();
    this.aliran.clear();
  }
}
