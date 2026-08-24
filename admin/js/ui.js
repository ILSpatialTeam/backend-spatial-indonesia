import { t, localeIntl } from './i18n.js';

// Perkakas DOM kecil. Bukan kerangka kerja — dashboard ini tidak butuh satu.
//
// `el()` membangun elemen dari objek properti, dan yang penting: teks selalu
// masuk lewat `textContent`, tidak pernah lewat innerHTML. Isi tabel dashboard
// datang dari kiriman pengunjung (nama sparing, pesan pendaftaran); merakitnya
// dengan penggabungan string adalah cara paling mudah membuat XSS di halaman
// yang justru paling berbahaya untuk dibobol.
// Custom property (`--warna`) tidak bisa disetel lewat `style.foo = ...` maupun
// `Object.assign(style, …)` — CSSStyleDeclaration hanya mengenali nama properti
// CSS yang sesungguhnya, dan sisanya diabaikan diam-diam. Satu-satunya jalan
// adalah setProperty(), dan itu tidak kentara sampai ada yang bertanya kenapa
// warnanya tidak muncul padahal atributnya jelas terpasang di DOM.
function gaya(n, obj) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    if (k.startsWith('--')) n.style.setProperty(k, v);
    else n.style[k] = v;
  }
}

export function el(tag, props = {}, ...anak) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'style' && typeof v === 'object') gaya(n, v);
    else if (k === 'dataset') Object.assign(n.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') n.innerHTML = v;   // hanya untuk HTML yang sudah disanitasi server
    else if (k in n) n[k] = v;
    else n.setAttribute(k, v);
  }
  for (const a of anak.flat()) {
    if (a === null || a === undefined || a === false) continue;
    n.append(a instanceof Node ? a : document.createTextNode(String(a)));
  }
  return n;
}

// `induk.append(null)` menyisipkan teks "null" ke halaman — DOM mengubah apa
// pun yang bukan Node jadi string. `el()` sudah menyaringnya, tapi begitu ada
// yang memanggil `.append()` langsung dengan `syarat ? node : null`, teks itu
// muncul di layar tanpa satu pun galat di konsol.
//
// Sudah pernah kejadian di layar masuk dashboard ini. Jadi setiap perakitan
// yang bisa memuat cabang kondisional lewat sini, bukan lewat .append().
export function pasang(induk, ...anak) {
  for (const a of anak.flat(Infinity)) {
    if (a === null || a === undefined || a === false) continue;
    induk.append(a instanceof Node ? a : document.createTextNode(String(a)));
  }
  return induk;
}

// Ikon garis, ditulis sebagai path SVG.
//
// Sebelumnya navigasi memakai campuran glif Unicode dan emoji (◎, 🪐, 👤).
// Masalahnya bukan selera: emoji dirender pakai font berwarna milik sistem, jadi
// ia tidak bisa mewarisi warna teks, ukurannya berbeda-beda antar platform, dan
// di samping glif geometris hasilnya terlihat seperti tiga set ikon yang
// tertukar. SVG stroke menyelesaikan ketiganya sekaligus — ia ikut `currentColor`.
const IKON = {
  beranda: 'M12 3a9 9 0 1 0 9 9M12 3a9 9 0 0 1 9 9M12 8a4 4 0 1 0 4 4',
  menu: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16M3 14c4 2.4 14 2.4 18 0M6.5 7.5 4 6M17.5 7.5 20 6',
  artikel: 'M5 4h9l5 5v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1ZM14 4v5h5M8 13h8M8 17h5',
  agenda: 'M4 6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1ZM4 10h16M8 3v4M16 3v4',
  sparing: 'M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14M12 2v2M12 20v2M2 12h2M20 12h2M19 5l-1.5 1.5M5 19l1.5-1.5',
  pendaftaran: 'M3 7a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1ZM3.5 7.5l8.5 6 8.5-6',
  taksonomi: 'M4 6h6M4 12h10M4 18h7M17 5v14M17 5l3 3M17 5l-3 3',
  pengaturan: 'M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.1-2.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.8 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.3a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.5 1.1Z',
  akun: 'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8M4 20a8 8 0 0 1 16 0',
  audit: 'M5 5h14M5 10h14M5 15h9M5 20h6',
  pemantauan: 'M12 3l7.5 3v5.5c0 4.4-3 8.2-7.5 9.5-4.5-1.3-7.5-5.1-7.5-9.5V6ZM8.5 12.2l2.2 2.3 4.8-4.8',
  kejadian: 'M12 3.5 21 19H3ZM12 10v4M12 17.2v.1',
  situs: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M3.5 9h17M3.5 15h17M12 3c-3 3.5-3 14.5 0 18M12 3c3 3.5 3 14.5 0 18',
  keluar: 'M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 8l-4 4 4 4M6 12h11',
  kunci: 'M7 11V8a5 5 0 0 1 10 0v3M5.5 11h13a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Z',
  tutup: 'M6 6l12 12M18 6L6 18',
  tambah: 'M12 5v14M5 12h14',
  buku: 'M4 5a1 1 0 0 1 1-1h5a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H5a1 1 0 0 1-1-1ZM20 5a1 1 0 0 0-1-1h-5a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h5a1 1 0 0 0 1-1Z',
  // Kubah langit dengan satu bintang di dalamnya — bukan bintang lima sudut,
  // supaya tidak tertukar dengan ikon "favorit" yang lazim di tempat lain.
  langit: 'M3 18a9 9 0 0 1 18 0M3 18h18M12 7.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9ZM6.5 13.5h.01M17.5 13.5h.01'
};

const NS_SVG = 'http://www.w3.org/2000/svg';

export function ikon(nama, { ukuran = 18, tebal = 1.5 } = {}) {
  const s = document.createElementNS(NS_SVG, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('width', ukuran);
  s.setAttribute('height', ukuran);
  s.setAttribute('fill', 'none');
  s.setAttribute('aria-hidden', 'true');
  const d = IKON[nama];
  if (d) {
    const path = document.createElementNS(NS_SVG, 'path');
    path.setAttribute('d', d);
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', tebal);
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    s.appendChild(path);
  }
  return s;
}

// Avatar berbentuk piringan: dua huruf awal nama di atas gradien. Tidak ada
// berkas gambar yang perlu diunggah hanya untuk memberi wajah pada dashboard.
export function inisial(nama = '') {
  return String(nama)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((k) => k[0])
    .join('')
    .toUpperCase() || '?';
}

export const qs = (sel, akar = document) => akar.querySelector(sel);
export const kosongkan = (n) => { while (n.firstChild) n.firstChild.remove(); return n; };

// ── pesan sementara ─────────────────────────────────────────────────────────
let wadahToast;
export function toast(pesan, jenis = 'info') {
  // aria-live: tanpa ini, pembaca layar tidak pernah tahu simpan berhasil atau
  // gagal — pesannya muncul dan hilang di pojok layar tanpa satu pun
  // pengumuman. `polite` untuk info, `assertive` untuk galat: kegagalan layak
  // memotong apa pun yang sedang dibacakan.
  wadahToast ??= document.body.appendChild(
    el('div', { class: 'toast-wrap', 'aria-live': 'polite', 'aria-atomic': 'true' })
  );
  wadahToast.setAttribute('aria-live', jenis === 'galat' ? 'assertive' : 'polite');
  // Variabelnya BUKAN `t`: nama itu sudah dipakai fungsi terjemahan yang
  // diimpor di atas, dan menimpanya di sini membuat setiap t('…') di dalam
  // fungsi ini memanggil sebuah elemen DOM.
  const kotak = el('div', { class: `toast toast-${jenis}`, role: jenis === 'galat' ? 'alert' : 'status' }, pesan);
  wadahToast.append(kotak);
  setTimeout(() => kotak.classList.add('keluar'), 3200);
  setTimeout(() => kotak.remove(), 3600);
}

// Pesan diambil dari KODE error, bukan dari kalimat yang dikirim server.
// Server tidak tahu bahasa apa yang dipilih pengguna, jadi kalimatnya akan
// selalu muncul dalam satu bahasa. Kodenya netral bahasa.
//
// `details` tetap ditampilkan apa adanya: isinya menyebut field mana yang
// bermasalah, dan itu informasi yang tidak bisa direkonstruksi dari kode saja.
export const toastGalat = (err) => {
  const dasar = t(`galat.${err?.code ?? 'INTERNAL_ERROR'}`);
  const detail = err?.details ? ` — ${Object.values(err.details).join(' · ')}` : '';
  toast(dasar + detail, 'galat');
};

// ── konfirmasi ──────────────────────────────────────────────────────────────
// Pengganti confirm() bawaan, yang di sebagian browser memblokir dan terlihat
// asing. Mengembalikan Promise<boolean>.
export function konfirmasi(pesan, { tombol, bahaya = true } = {}) {
  return new Promise((selesai) => {
    // Pendengar Esc dilepas di SETIAP jalan keluar, bukan hanya saat Esc
    // ditekan. Versi sebelumnya melepasnya di dalam handler Esc itu sendiri,
    // jadi dialog yang ditutup lewat tombol meninggalkan pendengarnya
    // menumpuk di document — satu per dialog, selamanya.
    let esc;
    const tutup = (jawab) => {
      if (esc) document.removeEventListener('keydown', esc);
      lapis.remove();
      selesai(jawab);
    };
    const lapis = el(
      'div',
      { class: 'modal-lapis', onclick: (e) => { if (e.target === lapis) tutup(false); } },
      el(
        'div',
        { class: 'modal modal-kecil', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': pesan },
        el('p', { class: 'modal-pesan' }, pesan),
        el(
          'div',
          { class: 'modal-aksi' },
          el('button', { class: 'btn', onclick: () => tutup(false) }, t('aksi.batal')),
          el('button', { class: bahaya ? 'btn btn-bahaya' : 'btn btn-utama', onclick: () => tutup(true) }, tombol ?? t('aksi.hapus'))
        )
      )
    );
    document.body.append(lapis);
    lapis.querySelector('.btn-bahaya, .btn-utama')?.focus();
    esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); tutup(false); } };

    // Pendaftarannya DITUNDA satu putaran event loop, dan itu bukan
    // kehati-hatian berlebihan.
    //
    // Dialog ini sering dibuka DARI penanganan Esc — drawer menangkap Escape di
    // fase capture pada document, lalu memanggil konfirmasi(). Kalau
    // pendengarnya dipasang saat itu juga, ia masuk ke daftar bubble document
    // yang BELUM dijalankan untuk event yang sama, dan Escape tunggal itu
    // langsung menutup dialog yang baru saja dibuatnya. Gejalanya: dialog tidak
    // pernah terlihat, tapi jawabannya "batal".
    setTimeout(() => document.addEventListener('keydown', esc), 0);
  });
}

// ── panel geser untuk form ──────────────────────────────────────────────────
const BISA_FOKUS = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function drawer(judul, isi, { lebar = '640px' } = {}) {
  // Elemen yang tadi dipegang pengguna, supaya fokusnya bisa dikembalikan.
  // Tanpa ini, menutup panel melempar fokus ke <body> dan pengguna papan tik
  // harus menelusuri seluruh halaman dari awal untuk kembali ke tempatnya.
  const sebelumnya = document.activeElement;

  // Penjaga penutupan.
  //
  // Sempat dicoba memasang pendengar kedua di tombol tutup dengan
  // `capture: true`, dan itu tidak bekerja: pada elemen target, pendengar
  // capture dan bubble dipanggil berurutan sesuai urutan pendaftaran — jadi
  // handler asli `tutup` tetap jalan lebih dulu dan panelnya sudah hilang
  // sebelum dialog konfirmasinya sempat muncul.
  //
  // Jadi penjaganya harus hidup di dalam `tutup` itu sendiri.
  let penjaga = null;

  const tutup = async ({ paksa = false } = {}) => {
    if (!paksa && penjaga && !(await penjaga())) return;
    lapis.remove();
    document.removeEventListener('keydown', papanTik, true);
    sebelumnya?.focus?.();
  };

  const lapis = el(
    'div',
    { class: 'drawer-lapis', onclick: (e) => { if (e.target === lapis) tutup(); } },
    el(
      'aside',
      {
        class: 'drawer', style: { width: lebar },
        role: 'dialog', 'aria-modal': 'true', 'aria-label': judul
      },
      el('header', { class: 'drawer-kepala' },
        el('h2', {}, judul),
        el('button', { class: 'btn-ikon', title: t('aksi.tutup'), 'aria-label': t('aksi.tutup'), onclick: tutup }, '×')),
      el('div', { class: 'drawer-isi' }, isi)
    )
  );
  document.body.append(lapis);

  // Jebakan fokus. Panel ini modal — kalau Tab bisa keluar darinya, pengguna
  // papan tik akan mengisi formulir di belakangnya tanpa pernah melihat bahwa
  // fokusnya sudah pindah.
  const papanTik = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); tutup(); return; }
    if (e.key !== 'Tab') return;
    const bisa = [...lapis.querySelectorAll(BISA_FOKUS)].filter((n) => n.offsetParent !== null);
    if (!bisa.length) return;
    const awal = bisa[0];
    const akhir = bisa[bisa.length - 1];
    if (e.shiftKey && document.activeElement === awal) { e.preventDefault(); akhir.focus(); }
    else if (!e.shiftKey && document.activeElement === akhir) { e.preventDefault(); awal.focus(); }
    else if (!lapis.contains(document.activeElement)) { e.preventDefault(); awal.focus(); }
  };
  document.addEventListener('keydown', papanTik, true);

  // Fokus dipindahkan ke dalam panel, ke kendali pertama yang bisa diisi.
  requestAnimationFrame(() => {
    (lapis.querySelector('.drawer-isi ' + BISA_FOKUS) ?? lapis.querySelector('.btn-ikon'))?.focus();
  });

  // `setPenjaga(fn)` dipanggil pemakai setelah panelnya berdiri. fn harus
  // mengembalikan true kalau penutupan boleh lanjut.
  return { tutup, akar: lapis, setPenjaga(fn) { penjaga = fn; } };
}

// ── tabel ───────────────────────────────────────────────────────────────────
export function tabel(kolom, baris, { kosong } = {}) {
  if (!baris.length) return el('p', { class: 'kosong' }, kosong ?? t('umum.kosong'));
  return el(
    'div',
    { class: 'tabel-bungkus' },
    el(
      'table',
      { class: 'tabel' },
      el('thead', {}, el('tr', {}, kolom.map((k) => el('th', { style: k.lebar ? { width: k.lebar } : {} }, k.judul)))),
      el('tbody', {}, baris.map((r) => el('tr', {}, kolom.map((k) => el('td', {}, k.sel(r))))))
    )
  );
}

export const lencana = (teks, jenis = '') => el('span', { class: `lencana lencana-${jenis || 'netral'}` }, teks);

// Format tanggal mengikuti bahasa yang dipilih. Nama bulan tidak lagi ditulis
// tangan: Intl sudah tahu "Agu" di Indonesia dan "Aug" di Inggris, dan daftar
// bulan buatan sendiri hanya akan salah begitu bahasa ketiga ditambahkan.
export const tanggalID = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(localeIntl(), {
    day: 'numeric', month: 'short', year: 'numeric'
  });
};

// ── form ────────────────────────────────────────────────────────────────────
export function bidang(label, kendali, { petunjuk, nama } = {}) {
  return el(
    'label',
    { class: 'bidang', dataset: nama ? { bidang: nama } : {} },
    el('span', { class: 'bidang-label' }, label),
    kendali,
    petunjuk ? el('small', { class: 'bidang-petunjuk' }, petunjuk) : null
  );
}

export const input = (props = {}) => el('input', { class: 'kendali', ...props });
export const textarea = (props = {}) => el('textarea', { class: 'kendali', rows: 3, ...props });
export const select = (opsi, props = {}) =>
  el('select', { class: 'kendali', ...props },
    opsi.map((o) => el('option', { value: o.value, selected: o.selected }, o.label)));

// Menandai field yang ditolak server. `details` dari API memakai kunci
// "body.namaField", jadi awalannya dibuang di sini — satu tempat, bukan di
// setiap form.
export function tandaiGalat(form, details) {
  form.querySelectorAll('.bidang-galat').forEach((n) => n.remove());
  form.querySelectorAll('.kendali-galat').forEach((n) => n.classList.remove('kendali-galat'));
  if (!details) return;
  for (const [kunci, pesan] of Object.entries(details)) {
    const nama = kunci.replace(/^(body|query|params)\./, '');
    const bidangEl = form.querySelector(`[data-bidang="${nama}"]`);
    if (!bidangEl) continue;
    bidangEl.querySelector('.kendali')?.classList.add('kendali-galat');
    bidangEl.append(el('small', { class: 'bidang-galat' }, pesan));
  }
}
