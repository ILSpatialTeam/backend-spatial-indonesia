import { api } from '../api.js';
import {
  el, pasang, kosongkan, tabel, lencana, toast, toastGalat, konfirmasi, drawer,
  bidang, input, textarea, select, tanggalID, tandaiGalat
} from '../ui.js';
import { t } from '../i18n.js';

// Agenda acara.
//
// Perlu diingat saat menyunting halaman ini: acara terdekat menentukan posisi
// planet Event di orbitnya. Menambah acara yang lebih dekat akan memindahkan
// planet itu di layar semua pengunjung — jadi peringatannya ditulis di halaman,
// bukan cuma di komentar kode.
const JENIS = ['MEETUP', 'WORKSHOP', 'KOLABORASI', 'KAMPUS', 'PAMERAN'];

// Ringkasan pendaftaran untuk satu baris tabel. Dipisah jadi fungsi karena
// bentuknya sama di dua tempat: kolom tabel dan kepala panel pendaftar.
function ringkasPendaftaran(reg) {
  if (!reg || reg.mode === 'none') return el('span', { class: 'redup' }, t('agenda.regTerbuka'));
  if (reg.mode === 'external') return lencana(t('agenda.regPihakKetiga'), 'netral');
  const kuota = reg.capacity === null
    ? t('agenda.regTanpaBatas')
    : t('agenda.regKursi', { terpakai: reg.seatsTaken, kuota: reg.capacity });
  return el('div', {},
    lencana(t('agenda.regFormulir'), 'ungu'),
    el('div', { class: 'redup kecil' },
      kuota,
      reg.reason === 'full' ? ` · ${t('agenda.regPenuh')}` : ''));
}

export async function tampilanAgenda(wadah) {
  const isi = el('div');

  async function muat() {
    pasang(kosongkan(isi), el('p', { class: 'redup' }, t('umum.memuat')));
    try {
      const items = await api.get('/admin/agenda');
      const hariIni = new Date().toISOString().slice(0, 10);
      pasang(kosongkan(isi),
        tabel(
          [
            { judul: t('agenda.kolomJenis'), lebar: '110px', sel: (a) => lencana(a.kind, 'ungu') },
            {
              judul: t('agenda.kolomAcara'),
              sel: (a) => el('div', {},
                el('strong', {}, a.title),
                a.note ? el('div', { class: 'redup kecil' }, a.note) : null)
            },
            {
              judul: t('agenda.kolomTanggal'),
              lebar: '130px',
              sel: (a) => el('div', {},
                tanggalID(a.date),
                a.startsAt ? el('div', { class: 'redup kecil' }, a.startsAt) : null,
                a.date < hariIni ? el('div', { class: 'redup kecil' }, t('agenda.sudahLewat')) : null)
            },
            { judul: t('agenda.kolomTempat'), lebar: '110px', sel: (a) => a.place || '—' },
            { judul: t('agenda.kolomPendaftaran'), lebar: '130px', sel: (a) => ringkasPendaftaran(a.registration) },
            {
              judul: '',
              lebar: '250px',
              sel: (a) => el('div', { class: 'aksi-baris' },
                // Tombol pendaftar hanya untuk acara yang benar-benar punya
                // pendaftar di sini. Untuk acara pihak ketiga daftarnya ada di
                // Google Form, dan tombol yang membuka panel kosong hanya
                // membuat orang mengira datanya hilang.
                a.registration?.mode === 'internal'
                  ? el('button', { class: 'btn btn-kecil', onclick: () => bukaPendaftar(a) }, t('agenda.pendaftar'))
                  : null,
                el('button', { class: 'btn btn-kecil', onclick: () => bukaAgenda(a, muat) }, t('aksi.sunting')),
                el('button', {
                  class: 'btn btn-kecil btn-bahaya',
                  onclick: async () => {
                    if (!(await konfirmasi(t('agenda.konfirmasiHapus', { judul: a.title })))) return;
                    try {
                      await api.del(`/admin/agenda/${a.id}`);
                      toast(t('agenda.terhapus'), 'sukses');
                      muat();
                    } catch (err) { toastGalat(err); }
                  }
                }, t('aksi.hapus')))
            }
          ],
          items,
          { kosong: t('agenda.kosong') }
        )
      );
    } catch (err) {
      pasang(kosongkan(isi), el('p', { class: 'galat' }, err.message));
    }
  }

  pasang(kosongkan(wadah),
    el('div', { class: 'halaman-kepala' },
      el('div', {},
        el('h1', {}, t('agenda.judul')),
        el('p', { class: 'redup' }, t('agenda.subjudul'))),
      el('button', { class: 'btn btn-utama', onclick: () => bukaAgenda(null, muat) }, t('agenda.tambah'))),
    isi
  );
  await muat();
}

function bukaAgenda(acara, setelahSimpan) {
  const baru = !acara;
  const form = el('form', { class: 'form' });
  const { tutup } = drawer(baru ? t('agenda.form.baru') : t('agenda.form.sunting', { judul: acara.title }), form);
  const v = acara ?? {
    kind: 'MEETUP', title: '', date: '', startsAt: '', endsAt: '', place: '', address: '',
    note: '', url: '', isPublished: true
  };
  const reg = acara?.registration ?? { mode: 'none', capacity: null };

  // Uraian panjang dipegang Quill, bukan textarea. Editornya dibuat setelah
  // elemennya masuk DOM (lihat di bawah) — Quill mengukur wadahnya saat
  // dipasang, dan wadah yang belum ter-render menghasilkan toolbar setinggi nol.
  const editorEl = el('div', { class: 'editor' });
  const uraianBidang = bidang(t('agenda.form.uraian'), editorEl, { petunjuk: t('agenda.form.uraianPetunjuk') });

  // ── bagian pendaftaran ────────────────────────────────────────────────────
  //
  // Tiga mode, dan tiap mode memakai field yang berbeda. Menampilkan semuanya
  // sekaligus membuat admin mengisi kuota untuk acara yang pendaftarannya di
  // Google Form — angka yang lalu tersimpan tanpa pernah dipakai. Jadi yang
  // tidak relevan disembunyikan, bukan sekadar diberi keterangan.
  const kuotaBidang = bidang(t('agenda.form.kuota'),
    input({ name: 'capacity', type: 'number', min: '0', step: '1', value: reg.capacity ?? '' }),
    { nama: 'capacity', petunjuk: t('agenda.form.kuotaPetunjuk') });

  const tautanLuarBidang = bidang(t('agenda.form.tautanLuar'),
    input({ name: 'registerUrl', type: 'url', value: acara?.registerUrl ?? '' }),
    { nama: 'registerUrl', petunjuk: t('agenda.form.tautanLuarPetunjuk') });

  const tutupPadaBidang = bidang(t('agenda.form.tutupPada'),
    input({ name: 'registrationClosesAt', type: 'date', value: acara?.registrationClosesAt ?? '' }),
    { nama: 'registrationClosesAt', petunjuk: t('agenda.form.tutupPadaPetunjuk') });

  const modeSel = select(
    [
      { value: 'none', label: t('agenda.form.modeNone'), selected: reg.mode === 'none' },
      { value: 'internal', label: t('agenda.form.modeInternal'), selected: reg.mode === 'internal' },
      { value: 'external', label: t('agenda.form.modeExternal'), selected: reg.mode === 'external' }
    ],
    { name: 'registration' }
  );

  const setMode = (mode) => {
    kuotaBidang.hidden = mode !== 'internal';
    tutupPadaBidang.hidden = mode === 'none';
    tautanLuarBidang.hidden = mode !== 'external';
  };
  modeSel.addEventListener('change', () => setMode(modeSel.value));

  pasang(form,
    bidang(t('agenda.form.judul'), input({ name: 'title', value: v.title, required: true }), { nama: 'title' }),
    el('div', { class: 'baris-2' },
      bidang(t('agenda.form.jenis'), select(JENIS.map((k) => ({ value: k, label: k, selected: k === v.kind })), { name: 'kind' }),
        { nama: 'kind' }),
      bidang(t('agenda.form.tanggal'), input({ name: 'date', type: 'date', value: v.date, required: true }), { nama: 'date' })),
    el('div', { class: 'baris-2' },
      bidang(t('agenda.form.jamMulai'), input({ name: 'startsAt', type: 'time', value: v.startsAt ?? '' }), { nama: 'startsAt' }),
      bidang(t('agenda.form.jamSelesai'), input({ name: 'endsAt', type: 'time', value: v.endsAt ?? '' }), { nama: 'endsAt' })),
    el('div', { class: 'baris-2' },
      bidang(t('agenda.form.tempat'), input({ name: 'place', value: v.place }), { nama: 'place' }),
      bidang(t('agenda.form.tampil'), select(
        [{ value: 'true', label: t('umum.ya'), selected: v.isPublished !== false },
         { value: 'false', label: t('umum.tidak'), selected: v.isPublished === false }],
        { name: 'isPublished' }
      ), { nama: 'isPublished' })),
    bidang(t('agenda.form.alamat'), input({ name: 'address', value: v.address ?? '' }),
      { nama: 'address', petunjuk: t('agenda.form.alamatPetunjuk') }),
    bidang(t('agenda.form.catatan'), textarea({ name: 'note', value: v.note, rows: 2 }), { nama: 'note' }),
    uraianBidang,
    el('h3', { class: 'form-bagian' }, t('agenda.form.bagianPendaftaran')),
    bidang(t('agenda.form.mode'), modeSel, { nama: 'registration' }),
    kuotaBidang,
    tautanLuarBidang,
    tutupPadaBidang,
    bidang(t('agenda.form.tautan'), input({ name: 'url', type: 'url', value: v.url ?? '' }),
      { nama: 'url', petunjuk: t('umum.opsional') }),
    el('div', { class: 'form-aksi' },
      el('button', { type: 'button', class: 'btn', onclick: tutup }, t('aksi.batal')),
      el('button', { type: 'submit', class: 'btn btn-utama' }, baru ? t('aksi.tambah') : t('aksi.simpan')))
  );

  setMode(reg.mode);

  // Toolbar-nya sengaja lebih pendek daripada editor artikel: uraian acara
  // adalah beberapa paragraf, bukan tulisan panjang, dan gambar di dalamnya
  // akan bertabrakan dengan tata letak panel detail yang sempit.
  const quill = new window.Quill(editorEl, {
    theme: 'snow',
    placeholder: t('agenda.form.tulisDiSini'),
    modules: {
      toolbar: [
        [{ header: [2, 3, false] }],
        ['bold', 'italic', 'underline'],
        [{ list: 'ordered' }, { list: 'bullet' }],
        ['blockquote', 'link'],
        ['clean']
      ]
    }
  });
  if (acara?.descriptionHtml) quill.clipboard.dangerouslyPasteHTML(acara.descriptionHtml);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = new FormData(form);
    const mode = d.get('registration');
    // Quill menyimpan paragraf kosong sebagai '<p><br></p>'. Dikirim apa
    // adanya, `hasDetail` di frontend jadi true untuk acara yang uraiannya
    // sebetulnya kosong — barisnya lalu bisa diklik dan membuka halaman hampa.
    const uraian = quill.getLength() > 1 ? quill.getSemanticHTML() : '';

    const muatan = {
      kind: d.get('kind'),
      title: d.get('title'),
      date: d.get('date'),
      startsAt: d.get('startsAt') || null,
      endsAt: d.get('endsAt') || null,
      place: d.get('place') || '',
      address: d.get('address') || '',
      note: d.get('note') || '',
      descriptionHtml: uraian,
      url: d.get('url') || null,
      registration: mode,
      // Field yang tidak dipakai mode ini dikirim null, bukan dibiarkan hilang:
      // PATCH tanpa field berarti "jangan diubah", dan nilai lama akan tetap
      // menempel setelah admin berpindah mode.
      registerUrl: mode === 'external' ? (d.get('registerUrl') || null) : null,
      capacity: mode === 'internal' ? (d.get('capacity') === '' ? null : Number(d.get('capacity'))) : null,
      registrationClosesAt: mode === 'none' ? null : (d.get('registrationClosesAt') || null),
      isPublished: d.get('isPublished') === 'true'
    };

    const tombol = form.querySelector('button[type=submit]');
    tombol.disabled = true;
    try {
      if (baru) await api.post('/admin/agenda', muatan);
      else await api.patch(`/admin/agenda/${acara.id}`, muatan);
      toast(t('agenda.tersimpan'), 'sukses');
      tutup();
      setelahSimpan();
    } catch (err) {
      tandaiGalat(form, err.details);
      toastGalat(err);
    } finally {
      tombol.disabled = false;
    }
  });
}

// ── pendaftar ───────────────────────────────────────────────────────────────

// CSV dirakit di peramban, bukan diminta dari server.
//
// Datanya sudah ada di tangan — panel ini baru saja mengambilnya — jadi
// endpoint ekspor tersendiri berarti kueri kedua untuk baris yang sama, plus
// satu rute lagi yang harus dijaga izinnya. Yang perlu diperhatikan cuma
// kutipnya: nama dan catatan bisa memuat koma, dan Excel membaca sel yang
// diawali '=' sebagai rumus.
function unduhCsv(acara, daftar) {
  const sel = (v) => {
    const s = String(v ?? '');
    const aman = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return `"${aman.replace(/"/g, '""')}"`;
  };
  const baris = [
    ['Nama', 'Email', 'Telepon', 'Catatan', 'Status', 'Waktu daftar'],
    ...daftar.map((r) => [r.name, r.email, r.phone, r.note, r.status, r.at])
  ];
  const isi = '﻿' + baris.map((b) => b.map(sel).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([isi], { type: 'text/csv;charset=utf-8' }));
  const a = el('a', { href: url, download: `pendaftar-${acara.id}.csv` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function bukaPendaftar(acara) {
  const isi = el('div');
  const { tutup } = drawer(t('agenda.pendaftarJudul', { judul: acara.title }), isi, { lebar: '760px' });

  async function muat() {
    pasang(kosongkan(isi), el('p', { class: 'redup' }, t('umum.memuat')));
    try {
      const { event, registrations } = await api.get(`/admin/agenda/${acara.id}/registrations`);
      const aktif = registrations.filter((r) => r.status === 'confirmed');

      pasang(kosongkan(isi),
        el('div', { class: 'halaman-kepala' },
          ringkasPendaftaran(event.registration),
          aktif.length
            ? el('button', { class: 'btn btn-kecil', onclick: () => unduhCsv(acara, registrations) }, t('agenda.pendaftarUnduh'))
            : null),
        tabel(
          [
            {
              judul: t('agenda.pendaftarNama'),
              sel: (r) => el('div', {},
                el('strong', {}, r.name),
                r.status === 'cancelled'
                  ? el('span', { class: 'redup kecil' }, ` · ${t('agenda.pendaftarDibatalkan')}`)
                  : null)
            },
            {
              judul: t('agenda.pendaftarKontak'),
              lebar: '230px',
              sel: (r) => el('div', {},
                el('div', {}, r.email),
                r.phone ? el('div', { class: 'redup kecil' }, r.phone) : null)
            },
            { judul: t('agenda.pendaftarCatatan'), sel: (r) => r.note || '—' },
            { judul: t('agenda.pendaftarWaktu'), lebar: '120px', sel: (r) => tanggalID(r.at.slice(0, 10)) },
            {
              judul: '',
              lebar: '110px',
              sel: (r) => r.status !== 'confirmed' ? null : el('button', {
                class: 'btn btn-kecil btn-bahaya',
                onclick: async () => {
                  if (!(await konfirmasi(t('agenda.pendaftarKonfirmasiBatal', { nama: r.name })))) return;
                  try {
                    await api.del(`/admin/agenda/registrations/${r.id}`);
                    toast(t('agenda.pendaftarTerbatal'), 'sukses');
                    muat();
                  } catch (err) { toastGalat(err); }
                }
              }, t('agenda.pendaftarBatal'))
            }
          ],
          registrations,
          { kosong: t('agenda.pendaftarKosong') }
        )
      );
    } catch (err) {
      pasang(kosongkan(isi), el('p', { class: 'galat' }, err.message));
    }
  }

  muat();
  return tutup;
}
