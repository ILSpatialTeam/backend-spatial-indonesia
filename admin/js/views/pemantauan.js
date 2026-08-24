import { api } from '../api.js';
import { el, pasang, kosongkan, tabel, lencana, tanggalID, select, ikon, toastGalat } from '../ui.js';
import { t, localeIntl } from '../i18n.js';

// Halaman pemantauan: keamanan, kesehatan database, dan jejak perubahan.
//
// Yang membedakannya dari halaman lain: isinya tidak menuntut tindakan
// langsung, ia menuntut *perhatian*. Jadi susunannya dibalik dari kebiasaan —
// penilaian dan hal yang mencurigakan di atas, angka mentah di bawah. Orang
// yang membuka halaman ini biasanya sedang bertanya "ada yang aneh tidak?",
// bukan "berapa persisnya jumlah X".

const WARNA_TINGKAT = { aman: 'hijau', waspada: 'perhatian', kritis: 'bahaya' };
const WARNA_BERAT = { info: 'redup', notice: 'netral', warning: 'perhatian', critical: 'bahaya' };

// Nama jenis event dibaca dari kamus, bukan dari peta lokal. Menyimpan dua
// daftar berarti menambah jenis baru di satu tempat lalu bingung kenapa
// namanya tidak muncul.
const JENIS_EVENT = [
  'login_failed', 'login_ok', 'logout', 'account_locked', 'rate_limited',
  'csrf_rejected', 'cors_rejected', 'unauthorized', 'forbidden',
  'validation_failed', 'upload_rejected', 'server_error', 'not_found',
  'password_changed', 'session_revoked'
];
const namaJenis = (kind) => t(`event.kind.${kind}`);

const jam = (iso) => new Date(iso).toLocaleTimeString(localeIntl(), { hour: '2-digit', minute: '2-digit' });
const waktu = (iso) => `${tanggalID(iso)} ${jam(iso)}`;

export async function tampilanPemantauan(wadah) {
  const keadaan = { jam: 24 };
  const isi = el('div');

  async function muat() {
    pasang(kosongkan(isi), el('p', { class: 'redup' }, t('umum.memuat')));
    try {
      const [m, db] = await Promise.all([
        api.get('/admin/monitor', { jam: keadaan.jam }),
        api.get('/admin/monitor/database')
      ]);
      pasang(kosongkan(isi),
        kartuStatus(m),
        kotakAngka(m),
        el('div', { class: 'pantau-kolom' },
          grafik(m.deret),
          sumberPanel(m.sumberTeratas)),
        kejadianPanel(m.terbaru),
        databasePanel(db),
        tabelPanel(db.tabel),
        indeksPanel(db.indeks, db.kueriLambat));
    } catch (err) {
      pasang(kosongkan(isi), el('p', { class: 'galat' },
        err.status === 403 ? t('monitor.hanyaOwner') : err.message));
    }
  }

  pasang(kosongkan(wadah),
    el('div', { class: 'halaman-kepala' },
      el('div', {},
        el('h1', {}, t('monitor.judul')),
        el('p', { class: 'redup' }, t('monitor.subjudul'))),
      select(
        [
          { value: '24', label: t('monitor.periode24'), selected: true },
          { value: '168', label: t('monitor.periode7') },
          { value: '720', label: t('monitor.periode30') }
        ],
        { onchange: (e) => { keadaan.jam = Number(e.target.value); muat(); } }
      )),
    isi);
  await muat();
}

// ── penilaian ───────────────────────────────────────────────────────────────
function kartuStatus(m) {
  const tingkat = m.status.tingkat;
  return el('div', { class: `pantau-status pantau-${tingkat}` },
    el('div', { class: 'pantau-status-kiri' },
      el('span', { class: 'pantau-cincin' }, el('span', { class: 'pantau-inti' })),
      el('div', {},
        el('strong', {}, t(`monitor.status.${tingkat}`)),
        el('div', { class: 'redup kecil' }, t('monitor.status.dasar', { n: m.periodeJam })))),
    // Server mengirim { kode, n }; kalimatnya dirakit di sini agar ikut bahasa
    // yang dipilih pengguna.
    el('ul', { class: 'pantau-catatan' },
      m.status.catatan.map((c) => el('li', {}, t(`monitor.catatan.${c.kode}`, { n: c.n })))));
}

function kotakAngka(m) {
  const k = m.keamanan;
  const kotak = (label, nilai, catatan, jenis) =>
    el('div', { class: `stat stat-${jenis || 'netral'}` },
      el('span', { class: 'stat-nilai' }, String(nilai)),
      el('span', { class: 'stat-judul' }, label),
      catatan ? el('span', { class: 'stat-catatan' }, catatan) : null);

  return el('div', { class: 'stat-kisi' },
    kotak(t('monitor.errorServer'), k.galat_server,
      t(k.galat_server ? 'monitor.errorServerCek' : 'monitor.tidakAda'), k.galat_server ? 'perhatian' : 'netral'),
    kotak(t('monitor.loginGagal'), k.login_gagal,
      t('monitor.sumberBerbeda', { n: k.sumber_unik }), k.login_gagal >= 20 ? 'perhatian' : 'netral'),
    kotak(t('monitor.kenaRateLimit'), k.dibatasi,
      t(k.dibatasi ? 'monitor.requestDitahan' : 'monitor.tidakAda'), k.dibatasi >= 30 ? 'perhatian' : 'netral'),
    kotak(t('monitor.totalEvent'), k.total, t('monitor.ringkasBerat', { w: k.peringatan, c: k.kritis })));
}

// ── grafik ──────────────────────────────────────────────────────────────────
// Batang murni CSS, bukan pustaka grafik. Satu deret 14 angka tidak sepadan
// dengan menambah dependensi yang harus dijaga dan diperbarui.
function grafik(deret) {
  const maks = Math.max(1, ...deret.map((d) => d.total));
  return el('div', { class: 'panel' },
    el('h2', {}, t('monitor.grafikJudul')),
    el('div', { class: 'grafik' },
      deret.map((d) => {
        const tinggi = Math.round((d.total / maks) * 100);
        return el('div', {
          class: 'grafik-batang',
          title: `${tanggalID(d.hari)} · ${t('event.jumlah', { n: d.total })}${d.berat ? ` · ${t('monitor.berat', { n: d.berat })}` : ''}`
        },
          el('span', {
            class: d.berat ? 'grafik-isi grafik-berat' : 'grafik-isi',
            // Minimal 3% supaya hari dengan sedikit kejadian tetap terlihat
            // sebagai garis, bukan menghilang jadi nol.
            style: { height: `${d.total ? Math.max(3, tinggi) : 0}%` }
          }));
      })),
    el('div', { class: 'grafik-kaki redup kecil' },
      el('span', {}, tanggalID(deret[0]?.hari)),
      el('span', {}, t('monitor.puncak', { n: maks })),
      el('span', {}, tanggalID(deret[deret.length - 1]?.hari))));
}

function sumberPanel(sumber) {
  return el('div', { class: 'panel' },
    el('h2', {}, t('monitor.sumberJudul')),
    el('p', { class: 'redup kecil' },
      t('monitor.sumberCatatan')),
    sumber.length
      ? el('ul', { class: 'jejak' },
          sumber.map((s) => el('li', {},
            el('code', {}, s.ip_hash.slice(0, 10)),
            s.berat ? lencana(t('monitor.berat', { n: s.berat }), 'perhatian') : null,
            el('span', { class: 'redup kecil' }, (s.jenis || []).map((j) => namaJenis(j)).join(', ')),
            el('span', { class: 'redup kecil jejak-kanan' }, `${s.jumlah}× · ${jam(s.terakhir)}`))))
      : el('p', { class: 'redup' }, t('monitor.sumberKosong')));
}

// ── kejadian ────────────────────────────────────────────────────────────────
function kejadianPanel(terbaru) {
  return el('div', { class: 'panel' },
    el('div', { class: 'panel-kepala' },
      el('h2', {}, t('monitor.eventTerakhir')),
      el('a', { href: '#/kejadian', class: 'btn btn-kecil' }, t('aksi.lihatSemua'))),
    tabel(
      [
        { judul: t('monitor.kolomWaktu'), lebar: '150px', sel: (e) => waktu(e.created_at) },
        { judul: t('monitor.kolomTingkat'), lebar: '100px', sel: (e) => lencana(e.severity, WARNA_BERAT[e.severity]) },
        { judul: t('monitor.kolomJenis'), lebar: '150px', sel: (e) => namaJenis(e.kind) },
        { judul: t('monitor.kolomKeterangan'), sel: (e) => el('div', {},
            el('span', {}, e.message),
            e.path ? el('div', { class: 'redup kecil' }, `${e.method} ${e.path}`) : null) },
        { judul: t('monitor.kolomAkun'), lebar: '190px', sel: (e) => e.actor_email || '—' }
      ],
      terbaru,
      { kosong: t('monitor.eventKosong') }));
}

// ── database ────────────────────────────────────────────────────────────────
function databasePanel(db) {
  const d = db.database;
  const baris = (label, nilai, catatan) =>
    el('div', { class: 'db-baris' },
      el('span', { class: 'redup kecil' }, label),
      el('strong', {}, String(nilai)),
      catatan ? el('span', { class: 'redup kecil' }, catatan) : null);

  return el('div', { class: 'panel' },
    el('div', { class: 'panel-kepala' },
      el('h2', {}, t('monitor.db.judul')),
      lencana(t(d.cacheHitRatio >= 95 ? 'monitor.db.sehat' : 'monitor.db.perhatikan'), d.cacheHitRatio >= 95 ? 'hijau' : 'perhatian')),
    el('div', { class: 'db-kisi' },
      baris(t('monitor.db.versi'), d.versi),
      baris(t('monitor.db.ukuran'), d.ukuran),
      baris(t('monitor.db.koneksi'), `${d.koneksi} / ${d.koneksiMaks}`, t('monitor.db.terpakai', { n: d.koneksiPersen })),
      baris(t('monitor.db.uptime'), t('monitor.db.jam', { n: d.uptimeJam })),
      baris(t('monitor.db.cacheRatio'), d.cacheHitRatio === null ? '—' : `${d.cacheHitRatio}%`,
        t(d.cacheHitRatio !== null && d.cacheHitRatio < 95 ? 'monitor.db.cacheRendah' : 'monitor.db.cacheBaik')),
      baris(t('monitor.db.deadlock'), d.deadlock, t(d.deadlock ? 'monitor.db.perluDiperiksa' : 'monitor.tidakAda')),
      baris(t('monitor.db.transaksi'), d.commit.toLocaleString(localeIntl()), t('monitor.db.rollback', { n: d.rollback })),
      baris(t('monitor.db.barisDitulis'), d.tulis.toLocaleString(localeIntl()), t('monitor.db.sejakMenyala'))));
}

function tabelPanel(daftar) {
  return el('div', { class: 'panel' },
    el('h2', {}, t('monitor.tabel.judul')),
    tabel(
      [
        { judul: t('monitor.tabel.nama'), sel: (r) => el('code', {}, r.tabel) },
        { judul: t('monitor.tabel.baris'), lebar: '90px', sel: (r) => r.baris.toLocaleString(localeIntl()) },
        { judul: t('monitor.tabel.ukuran'), lebar: '90px', sel: (r) => r.ukuran },
        {
          judul: t('monitor.tabel.mati'),
          lebar: '170px',
          // Dead row adalah versi lama yang belum dibersihkan autovacuum.
          // Rasio tinggi berarti tabelnya membengkak tanpa datanya bertambah.
          sel: (r) => r.rasioMati > 50
            ? lencana(t('monitor.tabel.perluVacuum', { n: r.rasioMati }), 'perhatian')
            : el('span', { class: 'redup' }, r.rasioMati ? `${r.rasioMati}%` : '—')
        },
        { judul: t('monitor.tabel.vacuumTerakhir'), lebar: '150px', sel: (r) => r.last_autovacuum ? waktu(r.last_autovacuum) : '—' }
      ],
      daftar));
}

function indeksPanel(indeks, lambat) {
  const belum = indeks.filter((i) => i.dipakai === 0);
  return el('div', { class: 'panel' },
    el('h2', {}, t('monitor.query.judul')),
    lambat.length
      ? el('div', {},
          el('p', { class: 'galat kecil' }, t('monitor.query.lambat', { n: lambat.length })),
          el('ul', { class: 'jejak' },
            lambat.map((q) => el('li', {},
              lencana(`${q.berjalan_detik}s`, 'perhatian'),
              el('code', {}, q.kueri.slice(0, 90))))))
      : el('p', { class: 'redup kecil' }, t('monitor.query.aman')),
    belum.length
      ? el('p', { class: 'redup kecil' }, t('monitor.query.indexNganggur', {
          n: belum.length,
          daftar: belum.map((i) => i.indeks).slice(0, 4).join(', ') + (belum.length > 4 ? ', …' : '')
        }))
      : null);
}

// ── halaman daftar kejadian penuh ───────────────────────────────────────────
export async function tampilanKejadian(wadah) {
  const keadaan = { limit: 40, offset: 0, kind: '', severity: '' };
  const isi = el('div');

  async function muat() {
    pasang(kosongkan(isi), el('p', { class: 'redup' }, t('umum.memuat')));
    try {
      const { items, total } = await api.get('/admin/monitor/events', keadaan);
      pasang(kosongkan(isi),
        el('p', { class: 'redup kecil' }, t('event.jumlah', { n: total })),
        tabel(
          [
            { judul: t('monitor.kolomWaktu'), lebar: '150px', sel: (e) => waktu(e.created_at) },
            { judul: t('monitor.kolomTingkat'), lebar: '100px', sel: (e) => lencana(e.severity, WARNA_BERAT[e.severity]) },
            { judul: t('monitor.kolomJenis'), lebar: '150px', sel: (e) => namaJenis(e.kind) },
            {
              judul: t('monitor.kolomKeterangan'),
              sel: (e) => el('div', {},
                el('span', {}, e.message),
                e.path ? el('div', { class: 'redup kecil' }, `${e.method} ${e.path} → ${e.status ?? '—'}`) : null,
                e.meta && Object.keys(e.meta).length
                  ? el('div', { class: 'redup kecil' }, JSON.stringify(e.meta).slice(0, 160))
                  : null)
            },
            { judul: t('monitor.kolomSumber'), lebar: '110px', sel: (e) => e.ip_hash ? el('code', {}, e.ip_hash.slice(0, 8)) : '—' },
            { judul: t('monitor.kolomAkun'), lebar: '180px', sel: (e) => e.actor_email || '—' }
          ],
          items,
          { kosong: t('event.kosong') }),
        halamanNav(total, keadaan, muat));
    } catch (err) { toastGalat(err); }
  }

  pasang(kosongkan(wadah),
    el('div', { class: 'halaman-kepala' },
      el('div', {},
        el('h1', {}, t('event.judul')),
        el('p', { class: 'redup' }, t('event.subjudul')))),
    el('div', { class: 'saring' },
      select(
        [{ value: '', label: t('event.semuaTingkat'), selected: true },
         { value: 'critical', label: 'critical' }, { value: 'warning', label: 'warning' },
         { value: 'notice', label: 'notice' }, { value: 'info', label: 'info' }],
        { onchange: (e) => { keadaan.severity = e.target.value; keadaan.offset = 0; muat(); } }),
      select(
        [{ value: '', label: t('event.semuaJenis'), selected: true },
         ...JENIS_EVENT.map((v) => ({ value: v, label: namaJenis(v) }))],
        { onchange: (e) => { keadaan.kind = e.target.value; keadaan.offset = 0; muat(); } })),
    isi);
  await muat();
}

function halamanNav(total, keadaan, muat) {
  if (total <= keadaan.limit) return null;
  const sampai = Math.min(keadaan.offset + keadaan.limit, total);
  return el('div', { class: 'halaman-nav' },
    el('span', { class: 'redup kecil' }, t('umum.dari', { a: keadaan.offset + 1, b: sampai, total })),
    el('button', {
      class: 'btn btn-kecil', disabled: keadaan.offset === 0,
      onclick: () => { keadaan.offset = Math.max(0, keadaan.offset - keadaan.limit); muat(); }
    }, t('aksi.sebelumnya')),
    el('button', {
      class: 'btn btn-kecil', disabled: sampai >= total,
      onclick: () => { keadaan.offset += keadaan.limit; muat(); }
    }, t('aksi.berikutnya')));
}
