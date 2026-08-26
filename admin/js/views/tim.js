import { api } from '../api.js';
import {
  el, pasang, kosongkan, tabel, lencana, toast, toastGalat, konfirmasi, drawer,
  bidang, input, select, tandaiGalat
} from '../ui.js';
import { t } from '../i18n.js';

function bidangFoto(urlAwal) {
  let url = urlAwal ?? '';
  const pratinjau = el('div', {
    style: 'width:80px;height:107px;border-radius:6px;background:rgba(243,242,248,.06);background-size:cover;background-position:center top;overflow:hidden;flex-shrink:0;'
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

export async function tampilanTim(wadah) {
  const isi = el('div');

  async function muat() {
    pasang(kosongkan(isi), el('p', { class: 'redup' }, t('umum.memuat')));
    try {
      const items = await api.get('/admin/team');
      pasang(kosongkan(isi),
        tabel(
          [
            {
              judul: t('tim.kolomFoto'), lebar: '56px',
              sel: (m) => {
                if (!m.photo_url) return el('div', { class: 'avatar-placeholder', style: 'width:40px;height:53px;border-radius:6px;background:rgba(243,242,248,.06);' });
                return el('img', { src: m.photo_url, alt: m.name, style: 'width:40px;height:53px;border-radius:6px;object-fit:cover;' });
              }
            },
            { judul: t('tim.kolomNama'), sel: (m) => el('strong', {}, m.name) },
            { judul: t('tim.kolomPeran'), sel: (m) => m.role },
            {
              judul: t('tim.kolomStatus'), lebar: '90px',
              sel: (m) => lencana(m.is_active ? t('tim.aktif') : t('tim.nonaktif'), m.is_active ? 'hijau' : 'merah')
            },
            {
              judul: '', lebar: '178px',
              sel: (m) => el('div', { class: 'aksi-baris' },
                el('button', { class: 'btn btn-kecil', onclick: () => bukaAnggota(m, muat) }, t('aksi.sunting')),
                el('button', {
                  class: 'btn btn-kecil btn-bahaya',
                  onclick: async () => {
                    if (!(await konfirmasi(t('tim.konfirmasiHapus', { nama: m.name })))) return;
                    try {
                      await api.del(`/admin/team/${m.id}`);
                      toast(t('tim.terhapus'), 'sukses');
                      muat();
                    } catch (err) { toastGalat(err); }
                  }
                }, t('aksi.hapus')))
            }
          ],
          items,
          { kosong: t('tim.kosong') }
        )
      );
    } catch (err) {
      pasang(kosongkan(isi), el('p', { class: 'galat' }, err.message));
    }
  }

  pasang(kosongkan(wadah),
    el('div', { class: 'halaman-kepala' },
      el('div', {},
        el('h1', {}, t('tim.judul')),
        el('p', { class: 'redup' }, t('tim.subjudul'))),
      el('button', { class: 'btn btn-utama', onclick: () => bukaAnggota(null, muat) }, t('tim.tambah'))),
    isi
  );
  await muat();
}

function bukaAnggota(anggota, setelahSimpan) {
  const baru = !anggota;
  const form = el('form', { class: 'form' });
  const { tutup } = drawer(baru ? t('tim.form.baru') : t('tim.form.sunting', { nama: anggota.name }), form);
  const v = anggota ?? { name: '', role: '', photo_url: '', sort_order: 0, is_active: true };
  const foto = bidangFoto(v.photo_url);

  pasang(form,
    bidang(t('tim.form.nama'), input({ name: 'name', value: v.name, required: true }), { nama: 'name' }),
    bidang(t('tim.form.peran'), input({ name: 'role', value: v.role, required: true }), { nama: 'role' }),
    bidang(t('tim.form.foto'), foto.node, { nama: 'photoUrl', petunjuk: t('tim.form.fotoPetunjuk') }),
    el('div', { class: 'baris-2' },
      bidang(t('tim.form.urutan'), input({ name: 'sortOrder', type: 'number', value: v.sort_order, min: 0, max: 100 }),
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
      name: d.get('name'),
      role: d.get('role'),
      photoUrl: foto.getUrl(),
      sortOrder: Number(d.get('sortOrder')) || 0,
      isActive: d.get('isActive') === 'true'
    };
    const tombol = form.querySelector('button[type=submit]');
    tombol.disabled = true;
    try {
      if (baru) await api.post('/admin/team', muatan);
      else await api.patch(`/admin/team/${anggota.id}`, muatan);
      toast(t('tim.tersimpan'), 'sukses');
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
