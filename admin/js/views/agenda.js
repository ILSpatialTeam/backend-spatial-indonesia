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
            { judul: t('agenda.kolomJenis'), lebar: '120px', sel: (a) => lencana(a.kind, 'ungu') },
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
                a.date < hariIni ? el('div', { class: 'redup kecil' }, t('agenda.sudahLewat')) : null)
            },
            { judul: t('agenda.kolomTempat'), lebar: '120px', sel: (a) => a.place || '—' },
            {
              judul: '',
              lebar: '178px',
              sel: (a) => el('div', { class: 'aksi-baris' },
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
  const v = acara ?? { kind: 'MEETUP', title: '', date: '', place: '', note: '', url: '', isPublished: true };

  pasang(form,
    bidang(t('agenda.form.judul'), input({ name: 'title', value: v.title, required: true }), { nama: 'title' }),
    el('div', { class: 'baris-2' },
      bidang(t('agenda.form.jenis'), select(JENIS.map((k) => ({ value: k, label: k, selected: k === v.kind })), { name: 'kind' }),
        { nama: 'kind' }),
      bidang(t('agenda.form.tanggal'), input({ name: 'date', type: 'date', value: v.date, required: true }), { nama: 'date' })),
    el('div', { class: 'baris-2' },
      bidang(t('agenda.form.tempat'), input({ name: 'place', value: v.place }), { nama: 'place' }),
      bidang(t('agenda.form.tampil'), select(
        [{ value: 'true', label: t('umum.ya'), selected: v.isPublished !== false },
         { value: 'false', label: t('umum.tidak'), selected: v.isPublished === false }],
        { name: 'isPublished' }
      ), { nama: 'isPublished' })),
    bidang(t('agenda.form.catatan'), textarea({ name: 'note', value: v.note, rows: 2 }), { nama: 'note' }),
    bidang(t('agenda.form.tautan'), input({ name: 'url', type: 'url', value: v.url ?? '' }),
      { nama: 'url', petunjuk: t('umum.opsional') }),
    el('div', { class: 'form-aksi' },
      el('button', { type: 'button', class: 'btn', onclick: tutup }, t('aksi.batal')),
      el('button', { type: 'submit', class: 'btn btn-utama' }, baru ? t('aksi.tambah') : t('aksi.simpan')))
  );

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = new FormData(form);
    const muatan = {
      kind: d.get('kind'), title: d.get('title'), date: d.get('date'),
      place: d.get('place') || '', note: d.get('note') || '',
      url: d.get('url') || null, isPublished: d.get('isPublished') === 'true'
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
