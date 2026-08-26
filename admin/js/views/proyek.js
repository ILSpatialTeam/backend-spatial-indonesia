import { api } from '../api.js';
import {
  el, pasang, kosongkan, tabel, lencana, toast, toastGalat, konfirmasi, drawer,
  bidang, input, select, tandaiGalat
} from '../ui.js';
import { t } from '../i18n.js';

function bidangFoto(urlAwal) {
  let url = urlAwal ?? '';
  const pratinjau = el('div', {
    style: 'width:120px;height:80px;border-radius:6px;background:rgba(243,242,248,.06);background-size:cover;background-position:center;overflow:hidden;flex-shrink:0;'
  });
  if (url) pratinjau.style.backgroundImage = `url(${url})`;

  const berkas = el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/gif,image/avif', style: 'display:none;' });
  const tombol = el('button', { type: 'button', class: 'btn btn-kecil' }, url ? t('tim.form.fotoGanti') : t('tim.form.fotoPilih'));
  tombol.addEventListener('click', () => berkas.click());

  berkas.addEventListener('change', async () => {
    const file = berkas.files?.[0];
    if (!file) return;
    tombol.textContent = t('tim.form.fotoMengunggah');
    tombol.disabled = true;
    try {
      const fd = new FormData();
      fd.append('file', file);
      const hasil = await api.upload('/admin/media', fd);
      url = hasil.url;
      pratinjau.style.backgroundImage = `url(${url})`;
      tombol.textContent = t('tim.form.fotoGanti');
    } catch (err) {
      toastGalat(err);
      tombol.textContent = url ? t('tim.form.fotoGanti') : t('tim.form.fotoPilih');
    } finally {
      tombol.disabled = false;
      berkas.value = '';
    }
  });

  const bungkus = el('div', { style: 'display:flex;gap:12px;align-items:flex-end;' }, pratinjau, el('div', {}, tombol));
  return { node: bungkus, getUrl: () => url || null };
}

let kategoriCache = [];

async function muatKategori() {
  try {
    kategoriCache = await api.get('/admin/project-categories');
  } catch { /* pakai cache lama */ }
  return kategoriCache;
}

export async function tampilanProyek(wadah) {
  const isi = el('div');
  await muatKategori();

  async function muat() {
    pasang(kosongkan(isi), el('p', { class: 'redup' }, t('umum.memuat')));
    try {
      const items = await api.get('/admin/projects');
      pasang(kosongkan(isi),
        tabel(
          [
            {
              judul: t('proyek.kolomGambar'), lebar: '72px',
              sel: (p) => {
                if (!p.image_url) return el('div', { style: 'width:56px;height:38px;border-radius:4px;background:rgba(243,242,248,.06);' });
                return el('img', { src: p.image_url, alt: p.title, style: 'width:56px;height:38px;border-radius:4px;object-fit:cover;' });
              }
            },
            { judul: t('proyek.kolomJudul'), sel: (p) => el('strong', {}, p.title) },
            { judul: t('proyek.kolomAnggota'), lebar: '140px', sel: (p) => p.member_name },
            { judul: t('proyek.kolomTipe'), lebar: '80px', sel: (p) => p.type || '—' },
            { judul: t('proyek.kolomKategori'), lebar: '110px', sel: (p) => p.category_label || '—' },
            {
              judul: t('tim.kolomStatus'), lebar: '90px',
              sel: (p) => lencana(p.is_active ? t('tim.aktif') : t('tim.nonaktif'), p.is_active ? 'hijau' : 'merah')
            },
            {
              judul: '', lebar: '178px',
              sel: (p) => el('div', { class: 'aksi-baris' },
                el('button', { class: 'btn btn-kecil', onclick: () => bukaProyek(p, muat) }, t('aksi.sunting')),
                el('button', {
                  class: 'btn btn-kecil btn-bahaya',
                  onclick: async () => {
                    if (!(await konfirmasi(t('proyek.konfirmasiHapus', { judul: p.title })))) return;
                    try {
                      await api.del(`/admin/projects/${p.id}`);
                      toast(t('proyek.terhapus'), 'sukses');
                      muat();
                    } catch (err) { toastGalat(err); }
                  }
                }, t('aksi.hapus')))
            }
          ],
          items,
          { kosong: t('proyek.kosong') }
        )
      );
    } catch (err) {
      pasang(kosongkan(isi), el('p', { class: 'galat' }, err.message));
    }
  }

  pasang(kosongkan(wadah),
    el('div', { class: 'halaman-kepala' },
      el('div', {},
        el('h1', {}, t('proyek.judul')),
        el('p', { class: 'redup' }, t('proyek.subjudul'))),
      el('div', { class: 'aksi-baris' },
        el('button', { class: 'btn', onclick: () => bukaKategori(muat) }, t('proyek.kelolaKategori')),
        el('button', { class: 'btn btn-utama', onclick: () => bukaProyek(null, muat) }, t('proyek.tambah')))),
    isi
  );
  await muat();
}

function bukaProyek(proyek, setelahSimpan) {
  const baru = !proyek;
  const form = el('form', { class: 'form' });
  const { tutup } = drawer(baru ? t('proyek.form.baru') : t('proyek.form.sunting', { judul: proyek.title }), form);
  const v = proyek ?? { title: '', description: '', member_name: '', image_url: '', category_id: '', type: '', sort_order: 0, is_active: true };
  const foto = bidangFoto(v.image_url);

  const kategoriOpsi = [
    { value: '', label: '—' },
    ...kategoriCache.map((c) => ({ value: c.id, label: c.label, selected: c.id === v.category_id }))
  ];

  pasang(form,
    bidang(t('proyek.form.judul'), input({ name: 'title', value: v.title, required: true }), { nama: 'title' }),
    bidang(t('proyek.form.deskripsi'), el('textarea', { name: 'description', rows: 3, class: 'input', maxLength: 2000 }, v.description), { nama: 'description' }),
    bidang(t('proyek.form.anggota'), input({ name: 'memberName', value: v.member_name, required: true }), { nama: 'memberName' }),
    bidang(t('proyek.form.gambar'), foto.node, { nama: 'imageUrl', petunjuk: t('proyek.form.gambarPetunjuk') }),
    el('div', { class: 'baris-2' },
      bidang(t('proyek.form.tipe'), input({ name: 'type', value: v.type, placeholder: 'VR / AR / XR' }), { nama: 'type' }),
      bidang(t('proyek.form.kategori'), select(kategoriOpsi, { name: 'categoryId' }), { nama: 'categoryId' })),
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
      description: d.get('description'),
      memberName: d.get('memberName'),
      imageUrl: foto.getUrl(),
      categoryId: d.get('categoryId') || null,
      type: d.get('type'),
      sortOrder: Number(d.get('sortOrder')) || 0,
      isActive: d.get('isActive') === 'true'
    };
    const tombol = form.querySelector('button[type=submit]');
    tombol.disabled = true;
    try {
      if (baru) await api.post('/admin/projects', muatan);
      else await api.patch(`/admin/projects/${proyek.id}`, muatan);
      toast(t('proyek.tersimpan'), 'sukses');
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

function bukaKategori(setelahSimpan) {
  const form = el('form', { class: 'form' });
  const daftar = el('div');
  const { tutup } = drawer(t('proyek.kategori.judul'), el('div', {}, daftar, el('hr', { style: 'border-color:rgba(243,242,248,.08);margin:16px 0;' }), form));

  const gambarDaftar = async () => {
    await muatKategori();
    pasang(kosongkan(daftar),
      kategoriCache.length
        ? kategoriCache.map((c) =>
            el('div', { class: 'aksi-baris', style: 'padding:6px 0;' },
              el('span', {}, c.label),
              el('button', {
                class: 'btn btn-kecil btn-bahaya',
                onclick: async () => {
                  if (!(await konfirmasi(t('proyek.kategori.konfirmasiHapus', { label: c.label })))) return;
                  try {
                    await api.del(`/admin/project-categories/${c.id}`);
                    toast(t('umum.terhapus'), 'sukses');
                    gambarDaftar();
                  } catch (err) { toastGalat(err); }
                }
              }, t('aksi.hapus'))))
        : el('p', { class: 'redup kecil' }, t('proyek.kategori.kosong')));
  };

  pasang(form,
    bidang(t('proyek.kategori.label'), input({ name: 'label', required: true }), { nama: 'label' }),
    el('div', { class: 'form-aksi' },
      el('button', { type: 'submit', class: 'btn btn-utama' }, t('aksi.tambah')))
  );

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = new FormData(form);
    try {
      await api.put('/admin/project-categories', { label: d.get('label') });
      toast(t('proyek.kategori.tersimpan'), 'sukses');
      form.reset();
      gambarDaftar();
      setelahSimpan();
    } catch (err) { toastGalat(err); }
  });

  gambarDaftar();
}
