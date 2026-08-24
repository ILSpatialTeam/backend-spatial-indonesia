import { api, ApiError } from './api.js';
import { el, pasang, qs, kosongkan, toastGalat, drawer, bidang, input, ikon, inisial } from './ui.js';
import { t, bahasaAktif, gantiBahasa, BAHASA } from './i18n.js';
import { tampilanBeranda } from './views/dashboard.js';
import { tampilanMenu } from './views/menus.js';
import { tampilanArtikel } from './views/articles.js';
import { tampilanAgenda } from './views/agenda.js';
import { tampilanSparing, tampilanPendaftaran, tampilanLangit } from './views/moderasi.js';
import { tampilanTaksonomi, tampilanPengaturan, tampilanAkun, tampilanAudit } from './views/pengaturan.js';
import { tampilanPemantauan, tampilanKejadian } from './views/pemantauan.js';

// Kerangka dashboard: login, navigasi, dan perutean berbasis hash.
//
// Hash, bukan History API, karena dashboard dilayani sebagai berkas statis dari
// Express. Dengan hash, memuat ulang di /admin#/artikel tetap mengambil
// index.html yang sama — tidak perlu aturan rewrite di server, dan tidak ada
// jalur 404 yang muncul hanya saat orang menekan F5.

// Tiap halaman membawa warnanya sendiri, dan warnanya bukan hiasan: ubin ikon
// di navigasi memakainya, jadi menu bisa dikenali dari sudut mata sebelum
// tulisannya terbaca. Nilainya diambil dari palet yang sama dengan planet di
// situsnya supaya dashboard dan tata surya terasa satu benda.
// Label memakai kunci terjemahan, bukan teks jadi. Kalau teksnya ditulis
// langsung di sini, ia akan terkunci pada bahasa yang aktif saat modul dimuat
// dan tidak ikut berubah ketika pengguna berpindah bahasa.
const HALAMAN = [
  { id: '', kunci: 'nav.beranda', ikon: 'beranda', warna: '#9E94F9', render: tampilanBeranda },
  { id: 'menu', kunci: 'nav.menu', ikon: 'menu', warna: '#a99bf2', render: tampilanMenu },
  { id: 'artikel', kunci: 'nav.artikel', ikon: 'artikel', warna: '#5ad1c0', render: tampilanArtikel },
  { id: 'agenda', kunci: 'nav.agenda', ikon: 'agenda', warna: '#f3f2f8', render: tampilanAgenda },
  { id: 'sparing', kunci: 'nav.sparing', ikon: 'sparing', warna: '#f2a65a', render: tampilanSparing, lencana: 'sparingPending' },
  { id: 'pendaftaran', kunci: 'nav.pendaftaran', ikon: 'pendaftaran', warna: '#6a5ae0', render: tampilanPendaftaran, lencana: 'submissionsNew' },
  { id: 'langit', kunci: 'nav.langit', ikon: 'langit', warna: '#ffe9c4', render: tampilanLangit },
  { id: 'taksonomi', kunci: 'nav.taksonomi', ikon: 'taksonomi', warna: '#a99bf2', render: tampilanTaksonomi },
  { id: 'pengaturan', kunci: 'nav.pengaturan', ikon: 'pengaturan', warna: '#8f8aa3', render: tampilanPengaturan },
  { id: 'akun', kunci: 'nav.akun', ikon: 'akun', warna: '#9E94F9', render: tampilanAkun, hanyaOwner: true },
  { id: 'audit', kunci: 'nav.audit', ikon: 'audit', warna: '#6c6782', render: tampilanAudit },
  { id: 'pemantauan', kunci: 'nav.monitoring', ikon: 'pemantauan', warna: '#5ad1c0', render: tampilanPemantauan, hanyaOwner: true },
  // Tidak muncul di navigasi: dicapai dari tombol "Lihat semua" di halaman
  // monitoring. Menu utama sudah sebelas baris, dan halaman ini adalah
  // pendalaman dari satu panel di sana, bukan tujuan tersendiri.
  { id: 'kejadian', kunci: 'nav.securityEvent', ikon: 'kejadian', warna: '#f2686a', render: tampilanKejadian, hanyaOwner: true, tersembunyi: true }
];

const akar = qs('#akar');
let aku = null;

// ── layar login ─────────────────────────────────────────────────────────────
function layarMasuk(pesan) {
  const form = el('form', { class: 'masuk-form' });
  const galatEl = el('p', { class: 'masuk-galat', hidden: !pesan }, pesan || '');

  pasang(form,
    galatEl,
    bidang(t('login.email'), input({
      name: 'email', type: 'email', required: true, autocomplete: 'username',
      autofocus: true, placeholder: 'nama@spatialindonesia.id'
    })),
    bidang(t('login.sandi'), input({
      name: 'password', type: 'password', required: true, autocomplete: 'current-password',
      placeholder: '••••••••••••'
    })),
    el('button', { type: 'submit', class: 'btn btn-utama btn-lebar' }, t('login.masuk'))
  );

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = new FormData(form);
    const tombol = form.querySelector('button');
    tombol.disabled = true;
    tombol.textContent = t('login.memeriksa');
    galatEl.hidden = true;
    try {
      const hasil = await api.login(d.get('email'), d.get('password'));
      aku = hasil.user;
      layarUtama();
    } catch (err) {
      // Pesannya diperbarui di tempat, bukan disisipkan baru tiap kegagalan.
      // Versi sebelumnya menumpuk satu baris merah per percobaan.
      galatEl.textContent = err.message;
      galatEl.hidden = false;
      tombol.disabled = false;
      tombol.textContent = t('login.masuk');
    }
  });

  pasang(kosongkan(akar),
    el('div', { class: 'masuk' },
      el('div', { class: 'masuk-kartu' },
        // Tata surya kecil sebagai penanda halaman: matahari di tengah, dua
        // planet mengorbit. Murni CSS — tidak ada gambar yang dimuat, dan
        // animasinya berhenti sendiri kalau sistem meminta gerak dikurangi.
        el('div', { class: 'masuk-orbit', 'aria-hidden': 'true' },
          el('span', { class: 'orbit-matahari' }),
          el('span', { class: 'orbit-cincin orbit-cincin-1' }, el('i')),
          el('span', { class: 'orbit-cincin orbit-cincin-2' }, el('i'))),
        el('div', { class: 'masuk-kepala' },
          el('h1', {}, t('login.judul')),
          el('p', {}, t('login.subjudul'))),
        form,
        pemilihBahasa(() => layarMasuk(pesan)))));
}

// Pemilih bahasa. Dipakai di layar login maupun di topbar — orang yang belum
// bisa masuk pun berhak membaca formulirnya dalam bahasa yang ia mengerti.
function pemilihBahasa(setelahGanti) {
  return el('div', { class: 'pilih-bahasa', role: 'group', 'aria-label': t('shell.bahasa') },
    Object.entries(BAHASA).map(([kode, nama]) =>
      el('button', {
        type: 'button',
        class: `bahasa-btn${bahasaAktif() === kode ? ' aktif' : ''}`,
        'aria-pressed': String(bahasaAktif() === kode),
        onclick: () => {
          if (bahasaAktif() === kode) return;
          gantiBahasa(kode);
          setelahGanti();
        }
      }, kode.toUpperCase(), el('span', { class: 'bahasa-penuh' }, nama))));
}

// ── kerangka utama ──────────────────────────────────────────────────────────
function layarUtama() {
  const isi = el('main', { class: 'isi', id: 'isi', tabindex: '-1' });
  const navEl = el('nav', { class: 'nav', 'aria-label': t('shell.navigasi') });
  const jejakEl = el('div', { class: 'jejak-nav' });

  const daftar = HALAMAN.filter((h) => !h.hanyaOwner || aku.role === 'owner');
  // Halaman tersembunyi tetap bisa dibuka lewat hash, hanya tidak dicetak di
  // navigasi — dua daftar berbeda untuk dua kebutuhan berbeda.
  const terlihat = daftar.filter((h) => !h.tersembunyi);

  const gambarNav = (hitungan = {}) => {
    pasang(kosongkan(navEl),
      terlihat.map((h) => {
        const aktif = (location.hash.slice(2) || '') === h.id;
        const n = hitungan[h.lencana];
        return el(
          'a',
          {
            href: `#/${h.id}`,
            class: `nav-item${aktif ? ' aktif' : ''}`,
            // Warna halaman diteruskan sebagai custom property, bukan gaya
            // inline per properti — satu nilai menyetel ubin, cincin, dan
            // pendarnya sekaligus lewat CSS.
            style: { '--warna': h.warna },
            'aria-current': aktif ? 'page' : null
          },
          el('span', { class: 'nav-ubin' }, ikon(h.ikon)),
          el('span', { class: 'nav-teks' }, t(h.kunci)),
          n ? el('span', { class: 'nav-lencana' }, String(n)) : null
        );
      })
    );

    const kini = daftar.find((h) => h.id === (location.hash.slice(2) || '')) ?? daftar[0];
    pasang(kosongkan(jejakEl),
      el('span', { class: 'jejak-akar' }, t('shell.beranda')),
      el('span', { class: 'jejak-pisah' }, '/'),
      el('span', { class: 'jejak-kini', style: { '--warna': kini.warna } }, t(kini.kunci))
    );
  };

  const avatar = el('span', { class: 'avatar' }, inisial(aku.name));

  const topbar = el(
    'header',
    { class: 'topbar' },
    jejakEl,
    el('div', { class: 'topbar-aksi' },
      // Ganti bahasa menggambar ulang seluruh shell: label navigasi, breadcrumb,
      // dan halaman yang sedang terbuka semuanya dibangun ulang dari kamus.
      pemilihBahasa(() => layarUtama()),
      el('a', {
        class: 'ikon-btn', href: 'http://localhost:8899/index.html',
        target: '_blank', rel: 'noopener', title: t('shell.bukaSitus'), 'aria-label': t('shell.bukaSitus')
      }, ikon('situs')),
      el('a', {
        class: 'ikon-btn', href: '/docs', target: '_blank', rel: 'noopener',
        title: t('shell.docsApi'), 'aria-label': t('shell.docsApi')
      }, ikon('buku')),
      el('button', {
        class: 'ikon-btn', title: t('shell.gantiSandi'), 'aria-label': t('shell.gantiSandi'), onclick: gantiSandi
      }, ikon('kunci')),
      el('div', { class: 'pengguna' },
        avatar,
        el('span', { class: 'pengguna-teks' },
          el('strong', {}, aku.name),
          el('em', {}, aku.role))),
      el('button', {
        class: 'ikon-btn ikon-btn-keluar', title: t('shell.keluar'), 'aria-label': t('shell.keluar'), onclick: keluar
      }, ikon('keluar')))
  );

  pasang(kosongkan(akar),
    // Tautan pertama di halaman, tersembunyi sampai difokuskan. Sepuluh menu
    // navigasi yang harus dilewati setiap kali pindah halaman adalah salah satu
    // hal paling melelahkan bagi pengguna papan tik.
    el('a', { class: 'lewati', href: '#isi',
      onclick: (e) => { e.preventDefault(); isi.focus(); } }, t('shell.lewati')),
    el(
      'div',
      { class: 'kerangka' },
      el(
        'aside',
        { class: 'sisi' },
        el('a', { class: 'merek', href: '#/' },
          el('span', { class: 'merek-orb' }),
          el('span', { class: 'merek-teks' },
            el('strong', {}, 'Spatial Indonesia'),
            el('em', {}, t('shell.merek')))),
        navEl,
        el('div', { class: 'sisi-kaki' },
          el('span', { class: 'sisi-kaki-titik' }),
          el('span', {}, t('shell.sistemNormal')))
      ),
      el('div', { class: 'utama' }, topbar, isi)
    )
  );

  const gambar = async () => {
    const id = location.hash.slice(2) || '';
    const halaman = daftar.find((h) => h.id === id) ?? daftar[0];
    gambarNav(await hitungLencana());
    // Warna halaman aktif dipakai seluruh kulit — pendar latar ikut berubah
    // saat berpindah menu, jadi perpindahannya terasa, bukan cuma tabel yang
    // berganti isi.
    document.documentElement.style.setProperty('--halaman', halaman.warna);
    isi.classList.add('isi-masuk');
    try {
      await halaman.render(isi, { aku });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      pasang(kosongkan(isi), el('p', { class: 'galat' }, err.message));
    }
    // Animasi masuk dipicu ulang dengan melepas lalu memasang kelasnya; tanpa
    // reflow di antaranya, browser menggabungkan keduanya jadi bukan perubahan.
    isi.classList.remove('isi-masuk');
    void isi.offsetWidth;
    isi.classList.add('isi-masuk');
  };

  // Angka di samping menu ambil dari ringkasan yang sama dengan beranda —
  // satu permintaan, bukan satu per menu.
  const hitungLencana = async () => {
    try { return await api.get('/admin/dashboard'); } catch { return {}; }
  };

  window.addEventListener('hashchange', gambar);
  gambar();
}

async function gantiSandi() {
  const form = el('form', { class: 'form' });
  const { tutup } = drawer(t('sandi.judul'), form, { lebar: 'min(460px, 94vw)' });
  pasang(form,
    el('p', { class: 'redup kecil' }, t('sandi.catatan')),
    bidang(t('sandi.sekarang'), input({ name: 'currentPassword', type: 'password', required: true, autocomplete: 'current-password' })),
    bidang(t('sandi.baru'), input({ name: 'newPassword', type: 'password', required: true, minLength: 12, autocomplete: 'new-password' }),
      { petunjuk: t('sandi.syarat') }),
    el('div', { class: 'form-aksi' },
      el('button', { type: 'button', class: 'btn', onclick: tutup }, t('aksi.batal')),
      el('button', { type: 'submit', class: 'btn btn-utama' }, t('sandi.ganti')))
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = new FormData(form);
    try {
      await api.post('/auth/change-password', {
        currentPassword: d.get('currentPassword'), newPassword: d.get('newPassword')
      });
      tutup();
      layarMasuk(t('sandi.berhasil'));
    } catch (err) { toastGalat(err); }
  });
}

async function keluar() {
  try { await api.logout(); } catch { /* sesi mungkin memang sudah habis */ }
  aku = null;
  location.hash = '';
  layarMasuk();
}

// Kalau token kedaluwarsa dan refresh gagal, api.js memancarkan ini.
window.addEventListener('sesi-habis', () => {
  if (aku) { aku = null; layarMasuk(t('login.sesiHabis')); }
});

// ── mulai ───────────────────────────────────────────────────────────────────
// Cookie sesi mungkin masih hidup dari kunjungan sebelumnya, jadi dicoba dulu
// sebelum menampilkan layar masuk — memaksa login ulang setiap muat ulang
// halaman adalah cara cepat membuat dashboard menjengkelkan.
try {
  aku = await api.me();
  layarUtama();
} catch {
  layarMasuk();
}
