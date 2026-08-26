import { api } from '../api.js';
import {
  el, pasang, kosongkan, tabel, lencana, toast, toastGalat, konfirmasi, drawer,
  bidang, input, select, tandaiGalat
} from '../ui.js';
import { t } from '../i18n.js';

export async function tampilanProgram(wadah) {
  const isi = el('div');

  async function muat() {
    pasang(kosongkan(isi), el('p', { class: 'redup' }, t('umum.memuat')));
    try {
      const items = await api.get('/admin/programs');
      pasang(kosongkan(isi),
        tabel(
          [
            { judul: t('program.kolomJudul'), sel: (p) => el('strong', {}, p.title) },
            { judul: t('program.kolomSubjudul'), lebar: '140px', sel: (p) => p.subtitle || '—' },
            { judul: t('program.kolomDeskripsi'), sel: (p) => el('span', { class: 'sparing-teks' }, p.description || '—') },
            {
              judul: t('tim.kolomStatus'), lebar: '90px',
              sel: (p) => lencana(p.is_active ? t('tim.aktif') : t('tim.nonaktif'), p.is_active ? 'hijau' : 'merah')
            },
            {
              judul: '', lebar: '178px',
              sel: (p) => el('div', { class: 'aksi-baris' },
                el('button', { class: 'btn btn-kecil', onclick: () => bukaProgram(p, muat) }, t('aksi.sunting')),
                el('button', {
                  class: 'btn btn-kecil btn-bahaya',
                  onclick: async () => {
                    if (!(await konfirmasi(t('program.konfirmasiHapus', { judul: p.title })))) return;
                    try {
                      await api.del(`/admin/programs/${p.id}`);
                      toast(t('program.terhapus'), 'sukses');
                      muat();
                    } catch (err) { toastGalat(err); }
                  }
                }, t('aksi.hapus')))
            }
          ],
          items,
          { kosong: t('program.kosong') }
        )
      );
    } catch (err) {
      pasang(kosongkan(isi), el('p', { class: 'galat' }, err.message));
    }
  }

  pasang(kosongkan(wadah),
    el('div', { class: 'halaman-kepala' },
      el('div', {},
        el('h1', {}, t('program.judul')),
        el('p', { class: 'redup' }, t('program.subjudul'))),
      el('button', { class: 'btn btn-utama', onclick: () => bukaProgram(null, muat) }, t('program.tambah'))),
    isi
  );
  await muat();
}

function bukaProgram(program, setelahSimpan) {
  const baru = !program;
  const form = el('form', { class: 'form' });
  const { tutup } = drawer(baru ? t('program.form.baru') : t('program.form.sunting', { judul: program.title }), form);
  const v = program ?? { title: '', subtitle: '', description: '', sort_order: 0, is_active: true };

  pasang(form,
    bidang(t('program.form.judul'), input({ name: 'title', value: v.title, required: true }), { nama: 'title' }),
    bidang(t('program.form.subjudul'), input({ name: 'subtitle', value: v.subtitle }), { nama: 'subtitle', petunjuk: t('program.form.subjudulPetunjuk') }),
    bidang(t('program.form.deskripsi'), el('textarea', { name: 'description', rows: 3, class: 'input', maxLength: 600 }, v.description), { nama: 'description' }),
    el('div', { class: 'baris-2' },
      bidang(t('program.form.urutan'), input({ name: 'sortOrder', type: 'number', value: v.sort_order, min: 0, max: 100 }),
        { nama: 'sortOrder' }),
      bidang(t('tim.form.aktif'), select(
        [{ value: 'true', label: t('umum.ya'), selected: v.is_active !== false },
         { value: 'false', label: t('umum.tidak'), selected: v.is_active === false }],
        { name: 'isActive' }
      ), { nama: 'isActive' })),
    el('div', { class: 'form-aksi' },
      el('button', { type: 'button', class: 'btn', onclick: tutup }, t('aksi.batal')),
      el('button', { type: 'submit', class: 'btn btn-utama' }, baru ? t('aksi.tambah') : t('aksi.simpan')))
  );

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = new FormData(form);
    const muatan = {
      title: d.get('title'),
      subtitle: d.get('subtitle'),
      description: d.get('description'),
      sortOrder: Number(d.get('sortOrder')) || 0,
      isActive: d.get('isActive') === 'true'
    };
    const tombol = form.querySelector('button[type=submit]');
    tombol.disabled = true;
    try {
      if (baru) await api.post('/admin/programs', muatan);
      else await api.patch(`/admin/programs/${program.id}`, muatan);
      toast(t('program.tersimpan'), 'sukses');
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
