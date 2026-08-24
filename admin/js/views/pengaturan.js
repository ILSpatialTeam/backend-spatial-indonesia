import { api } from '../api.js';
import {
  el, pasang, kosongkan, tabel, lencana, toast, toastGalat, konfirmasi, drawer,
  bidang, input, select, tanggalID, tandaiGalat
} from '../ui.js';
import { t, localeIntl } from '../i18n.js';

// Taksonomi, pengaturan situs, akun admin, dan jejak audit.
//
// Empat hal yang jarang disentuh, dikumpulkan di satu bagian supaya menu utama
// tetap pendek dan berisi hal yang dikerjakan sehari-hari.

export async function tampilanTaksonomi(wadah) {
  const isi = el('div');

  async function muat() {
    pasang(kosongkan(isi), el('p', { class: 'redup' }, t('umum.memuat')));
    const { categories, frequencies } = await api.get('/admin/taxonomy');

    const contoh = (warna) => el('span', { class: 'warna-contoh', style: { background: warna } });

    pasang(kosongkan(isi),
      el('div', { class: 'panel' },
        el('div', { class: 'panel-kepala' },
          el('h2', {}, t('taksonomi.kategori')),
          el('button', { class: 'btn btn-kecil btn-utama', onclick: () => bukaKategori(null, muat) }, t('taksonomi.tambahKategori'))),
        tabel(
          [
            { judul: '', lebar: '40px', sel: (c) => contoh(c.color) },
            { judul: t('taksonomi.kolomLabel'), sel: (c) => el('strong', {}, c.label) },
            { judul: t('taksonomi.kolomId'), lebar: '168px', sel: (c) => el('code', {}, c.id) },
            { judul: t('taksonomi.kolomUrutan'), lebar: '70px', sel: (c) => String(c.position) },
            {
              judul: '',
              lebar: '168px',
              sel: (c) => el('div', { class: 'aksi-baris' },
                el('button', { class: 'btn btn-kecil', onclick: () => bukaKategori(c, muat) }, t('aksi.sunting')),
                el('button', {
                  class: 'btn btn-kecil btn-bahaya',
                  onclick: async () => {
                    if (!(await konfirmasi(t('taksonomi.konfirmasiHapus', { label: c.label })))) return;
                    try { await api.del(`/admin/taxonomy/categories/${c.id}`); toast(t('umum.terhapus'), 'sukses'); muat(); }
                    catch (err) { toastGalat(err); }
                  }
                }, 'Hapus'))
            }
          ],
          categories
        )),

      el('div', { class: 'panel' },
        el('div', { class: 'panel-kepala' },
          el('h2', {}, t('taksonomi.frekuensi')),
          el('button', { class: 'btn btn-kecil btn-utama', onclick: () => bukaFrekuensi(null, muat) }, t('taksonomi.tambahFrekuensi'))),
        el('p', { class: 'redup kecil' },
          t('taksonomi.frekuensiCatatan')),
        tabel(
          [
            { judul: '', lebar: '40px', sel: (f) => contoh(f.color) },
            { judul: t('taksonomi.kolomGlif'), lebar: '50px', sel: (f) => el('span', { class: 'glif' }, f.glyph) },
            { judul: t('taksonomi.kolomLabel'), lebar: '130px', sel: (f) => el('strong', {}, f.label) },
            { judul: t('taksonomi.kolomPetunjuk'), sel: (f) => el('span', { class: 'redup' }, f.hint) },
            {
              judul: '',
              lebar: '90px',
              sel: (f) => el('button', { class: 'btn btn-kecil', onclick: () => bukaFrekuensi(f, muat) }, t('aksi.sunting'))
            }
          ],
          frequencies
        ))
    );
  }

  pasang(kosongkan(wadah),
    el('div', { class: 'halaman-kepala' },
      el('div', {}, el('h1', {}, t('taksonomi.judul')), el('p', { class: 'redup' }, t('taksonomi.subjudul')))),
    isi
  );
  await muat();
}

function bukaKategori(c, setelahSimpan) {
  const baru = !c;
  const form = el('form', { class: 'form' });
  const { tutup } = drawer(baru ? t('taksonomi.kategoriBaru') : t('agenda.form.sunting', { judul: c.label }), form, { lebar: 'min(480px, 94vw)' });
  pasang(form,
    bidang(t('taksonomi.kolomLabel'), input({ name: 'label', value: c?.label ?? '', required: true }), { nama: 'label' }),
    bidang(t('taksonomi.kolomId'), input({ name: 'id', value: c?.id ?? '', readOnly: !baru, placeholder: t('taksonomi.idOtomatis') }),
      { nama: 'id', petunjuk: baru ? t('taksonomi.idOtomatis') : t('taksonomi.idTetap') }),
    bidang(t('taksonomi.warna'), input({ name: 'color', type: 'color', value: c?.color ?? '#9E94F9' }), { nama: 'color' }),
    el('div', { class: 'form-aksi' },
      el('button', { type: 'button', class: 'btn', onclick: tutup }, 'Batal'),
      el('button', { type: 'submit', class: 'btn btn-utama' }, 'Simpan'))
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = new FormData(form);
    try {
      await api.put('/admin/taxonomy/categories', {
        id: d.get('id') || undefined, label: d.get('label'), color: d.get('color')
      });
      toast(t('taksonomi.kategoriTersimpan'), 'sukses'); tutup(); setelahSimpan();
    } catch (err) { tandaiGalat(form, err.details); toastGalat(err); }
  });
}

function bukaFrekuensi(f, setelahSimpan) {
  const baru = !f;
  const form = el('form', { class: 'form' });
  const { tutup } = drawer(baru ? t('taksonomi.frekuensiBaru') : t('agenda.form.sunting', { judul: f.label }), form, { lebar: 'min(520px, 94vw)' });
  pasang(form,
    el('div', { class: 'baris-2' },
      bidang(t('taksonomi.kolomLabel'), input({ name: 'label', value: f?.label ?? '', required: true }), { nama: 'label' }),
      bidang(t('taksonomi.kolomGlif'), input({ name: 'glyph', value: f?.glyph ?? '▲', maxLength: 4, required: true }),
        { nama: 'glyph', petunjuk: t('taksonomi.glifCatatan') })),
    bidang(t('taksonomi.kolomId'), input({ name: 'id', value: f?.id ?? '', readOnly: !baru, placeholder: t('taksonomi.idOtomatis') }), { nama: 'id' }),
    bidang(t('taksonomi.warna'), input({ name: 'color', type: 'color', value: f?.color ?? '#9E94F9' }), { nama: 'color' }),
    bidang(t('taksonomi.kolomPetunjuk'), input({ name: 'hint', value: f?.hint ?? '' }),
      { nama: 'hint', petunjuk: t('taksonomi.petunjukCatatan') }),
    el('div', { class: 'form-aksi' },
      el('button', { type: 'button', class: 'btn', onclick: tutup }, 'Batal'),
      el('button', { type: 'submit', class: 'btn btn-utama' }, 'Simpan'))
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = new FormData(form);
    try {
      await api.put('/admin/taxonomy/frequencies', {
        id: d.get('id') || undefined, label: d.get('label'), glyph: d.get('glyph'),
        color: d.get('color'), hint: d.get('hint') ?? ''
      });
      toast(t('taksonomi.frekuensiTersimpan'), 'sukses'); tutup(); setelahSimpan();
    } catch (err) { tandaiGalat(form, err.details); toastGalat(err); }
  });
}

// ── pengaturan situs ────────────────────────────────────────────────────────
const KETERANGAN = {
  'insight.fresh_days': 'pengaturan.ket.freshDays',
  'insight.sparing_moderation': 'pengaturan.ket.moderation',
  'presence.limit': 'pengaturan.ket.presenceLimit',
  'site.name': 'pengaturan.ket.siteName',
  'site.tagline': 'pengaturan.ket.tagline'
};

export async function tampilanPengaturan(wadah) {
  const isi = el('div');

  async function muat() {
    pasang(kosongkan(isi), el('p', { class: 'redup' }, t('umum.memuat')));
    const semua = await api.get('/admin/settings');
    const form = el('form', { class: 'form' });

    for (const [kunci, nilai] of Object.entries(semua)) {
      const isBool = typeof nilai === 'boolean';
      const kendali = isBool
        ? select([{ value: 'true', label: t('umum.ya'), selected: nilai }, { value: 'false', label: t('umum.tidak'), selected: !nilai }],
            { dataset: { kunci, jenis: 'bool' } })
        : input({
            value: typeof nilai === 'string' ? nilai : JSON.stringify(nilai),
            dataset: { kunci, jenis: typeof nilai === 'number' ? 'number' : 'string' }
          });
      pasang(form, bidang(kunci, kendali, { nama: kunci, petunjuk: KETERANGAN[kunci] ? t(KETERANGAN[kunci]) : undefined }));
    }

    pasang(form, el('div', { class: 'form-aksi' },
      el('button', { type: 'submit', class: 'btn btn-utama' }, t('pengaturan.simpanSemua'))));

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const kendali = [...form.querySelectorAll('[data-kunci]')];
      try {
        // Dikirim satu per satu, tapi berbarengan. Endpointnya per-kunci karena
        // itu yang membuat jejak audit menyebut pengaturan mana yang berubah.
        await Promise.all(kendali.map((k) => {
          const { kunci, jenis } = k.dataset;
          const nilai = jenis === 'bool' ? k.value === 'true' : jenis === 'number' ? Number(k.value) : k.value;
          return api.put(`/admin/settings/${kunci}`, { value: nilai });
        }));
        toast(t('pengaturan.tersimpan'), 'sukses');
        muat();
      } catch (err) { toastGalat(err); }
    });

    pasang(kosongkan(isi), form);
  }

  pasang(kosongkan(wadah),
    el('div', { class: 'halaman-kepala' },
      el('div', {}, el('h1', {}, t('pengaturan.judul')), el('p', { class: 'redup' }, t('pengaturan.subjudul')))),
    isi
  );
  await muat();
}

// ── akun admin ──────────────────────────────────────────────────────────────
export async function tampilanAkun(wadah, { aku }) {
  const isi = el('div');

  async function muat() {
    pasang(kosongkan(isi), el('p', { class: 'redup' }, t('umum.memuat')));
    try {
      const users = await api.get('/admin/users');
      pasang(kosongkan(isi),
        tabel(
          [
            {
              judul: t('akun.kolomNama'),
              sel: (u) => el('div', {},
                el('strong', {}, u.name),
                el('div', { class: 'redup kecil' }, u.email),
                u.id === aku.id ? el('div', { class: 'redup kecil' }, t('akun.akunAnda')) : null)
            },
            { judul: t('akun.kolomPeran'), lebar: '90px', sel: (u) => lencana(u.role, u.role === 'owner' ? 'ungu' : 'netral') },
            { judul: t('akun.kolomAktif'), lebar: '80px', sel: (u) => (u.is_active ? lencana(t('akun.aktif'), 'hijau') : lencana(t('akun.nonaktif'), 'redup')) },
            { judul: t('akun.kolomMasukTerakhir'), lebar: '130px', sel: (u) => tanggalID(u.last_login_at) },
            {
              judul: '',
              lebar: '178px',
              sel: (u) => el('div', { class: 'aksi-baris' },
                el('button', { class: 'btn btn-kecil', onclick: () => bukaAkun(u, muat) }, t('aksi.sunting')),
                u.id !== aku.id
                  ? el('button', {
                      class: 'btn btn-kecil btn-bahaya',
                      onclick: async () => {
                        if (!(await konfirmasi(t('akun.konfirmasiHapus', { email: u.email })))) return;
                        try { await api.del(`/admin/users/${u.id}`); toast(t('akun.terhapus'), 'sukses'); muat(); }
                        catch (err) { toastGalat(err); }
                      }
                    }, t('aksi.hapus'))
                  : null)
            }
          ],
          users
        )
      );
    } catch (err) {
      pasang(kosongkan(isi), el('p', { class: 'galat' },
        err.status === 403 ? t('akun.hanyaOwner') : err.message));
    }
  }

  pasang(kosongkan(wadah),
    el('div', { class: 'halaman-kepala' },
      el('div', {}, el('h1', {}, t('akun.judul')), el('p', { class: 'redup' }, t('akun.subjudul'))),
      el('button', { class: 'btn btn-utama', onclick: () => bukaAkun(null, muat) }, t('akun.tambah'))),
    isi
  );
  await muat();
}

function bukaAkun(u, setelahSimpan) {
  const baru = !u;
  const form = el('form', { class: 'form' });
  const { tutup } = drawer(baru ? t('akun.baru') : t('akun.sunting', { email: u.email }), form, { lebar: 'min(520px, 94vw)' });
  pasang(form,
    bidang(t('akun.kolomNama'), input({ name: 'name', value: u?.name ?? '', required: true }), { nama: 'name' }),
    bidang(t('login.email'), input({ name: 'email', type: 'email', value: u?.email ?? '', required: true }), { nama: 'email' }),
    bidang(t('login.sandi'), input({ name: 'password', type: 'password', required: baru, minLength: 12, autocomplete: 'new-password' }),
      { nama: 'password', petunjuk: t(baru ? 'akun.sandiBaru' : 'akun.sandiKosong') }),
    el('div', { class: 'baris-2' },
      bidang(t('akun.kolomPeran'), select(
        [{ value: 'editor', label: 'editor', selected: u?.role !== 'owner' },
         { value: 'owner', label: 'owner', selected: u?.role === 'owner' }],
        { name: 'role' }
      ), { nama: 'role' }),
      baru ? null : bidang(t('akun.kolomAktif'), select(
        [{ value: 'true', label: t('umum.ya'), selected: u.is_active }, { value: 'false', label: t('umum.tidak'), selected: !u.is_active }],
        { name: 'isActive' }
      ), { nama: 'isActive' })),
    el('div', { class: 'form-aksi' },
      el('button', { type: 'button', class: 'btn', onclick: tutup }, 'Batal'),
      el('button', { type: 'submit', class: 'btn btn-utama' }, 'Simpan'))
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = new FormData(form);
    const muatan = { name: d.get('name'), email: d.get('email'), role: d.get('role') };
    if (d.get('password')) muatan.password = d.get('password');
    if (!baru) muatan.isActive = d.get('isActive') === 'true';
    try {
      if (baru) await api.post('/admin/users', muatan);
      else await api.patch(`/admin/users/${u.id}`, muatan);
      toast(t('akun.tersimpan'), 'sukses'); tutup(); setelahSimpan();
    } catch (err) { tandaiGalat(form, err.details); toastGalat(err); }
  });
}

// ── jejak audit ─────────────────────────────────────────────────────────────
//
// Setiap baris sekarang membawa *apa* yang berubah, bukan cuma bahwa sesuatu
// berubah. Itu perbedaan antara catatan yang bisa dipakai menjawab "siapa yang
// mengubah orbit planet Tim minggu lalu, dan dari berapa?" dan catatan yang
// hanya bisa menjawab "ada yang menyunting menu, entah apa".
const AKSI = {
  create: 'hijau', update: 'biru', delete: 'bahaya', login: 'netral', logout: 'redup',
  reorder: 'ungu', upsert: 'biru', upload: 'netral', change_password: 'perhatian'
};

export async function tampilanAudit(wadah) {
  const keadaan = { limit: 40, offset: 0, entity: '', action: '' };
  const isi = el('div');

  async function muat() {
    pasang(kosongkan(isi), el('p', { class: 'redup' }, t('umum.memuat')));
    try {
      const { items, total } = await api.get('/admin/audit', keadaan);
      pasang(kosongkan(isi),
        el('p', { class: 'redup kecil' }, t('audit.jumlah', { n: total })),
        tabel(
          [
            {
              judul: t('audit.kolomWaktu'),
              lebar: '150px',
              sel: (a) => el('div', {},
                el('span', {}, tanggalID(a.created_at)),
                el('div', { class: 'redup kecil' },
                  new Date(a.created_at).toLocaleTimeString(localeIntl(), { hour: '2-digit', minute: '2-digit' })))
            },
            { judul: t('audit.kolomAksi'), lebar: '110px', sel: (a) => lencana(a.action, AKSI[a.action] ?? 'netral') },
            {
              judul: t('audit.kolomObjek'),
              lebar: '190px',
              sel: (a) => el('div', {},
                el('strong', {}, a.entity),
                a.entity_id ? el('div', { class: 'redup kecil' }, String(a.entity_id).slice(0, 24)) : null)
            },
            { judul: t('audit.kolomPerubahan'), sel: (a) => daftarPerubahan(a) },
            { judul: t('audit.kolomPelaku'), lebar: '200px', sel: (a) => a.actor_email ?? t('home.sistem') }
          ],
          items,
          { kosong: t('audit.kosong') }),
        navHalaman(total, keadaan, muat));
    } catch (err) { toastGalat(err); }
  }

  pasang(kosongkan(wadah),
    el('div', { class: 'halaman-kepala' },
      el('div', {},
        el('h1', {}, t('audit.judul')),
        el('p', { class: 'redup' },
          t('audit.subjudul')))),
    el('div', { class: 'saring' },
      select(
        [{ value: '', label: t('audit.semuaObjek'), selected: true },
         ...['menu', 'article', 'agenda', 'sparing', 'join_submission', 'article_category',
             'sparing_frequency', 'site_setting', 'admin_user', 'media', 'session']
           .map((v) => ({ value: v, label: v }))],
        { onchange: (e) => { keadaan.entity = e.target.value; keadaan.offset = 0; muat(); } }),
      select(
        [{ value: '', label: t('audit.semuaAksi'), selected: true },
         ...Object.keys(AKSI).map((v) => ({ value: v, label: v }))],
        { onchange: (e) => { keadaan.action = e.target.value; keadaan.offset = 0; muat(); } })),
    isi);
  await muat();
}

function daftarPerubahan(a) {
  const c = a.changes ?? {};
  const kunci = Object.keys(c);
  if (!kunci.length) {
    const meta = a.meta && Object.keys(a.meta).length
      ? Object.entries(a.meta).map(([k, v]) => `${k}: ${v}`).join(' · ')
      : null;
    return el('span', { class: 'redup kecil' }, meta ?? '—');
  }
  return el('div', { class: 'ubah-daftar' },
    kunci.slice(0, 4).map((k) => el('div', { class: 'ubah' },
      el('span', { class: 'ubah-medan' }, k),
      el('span', { class: 'ubah-dari' }, ringkasNilai(c[k].dari)),
      el('span', { class: 'ubah-panah' }, '→'),
      el('span', { class: 'ubah-jadi' }, ringkasNilai(c[k].jadi)))),
    kunci.length > 4 ? el('span', { class: 'redup kecil' }, t('audit.medanLain', { n: kunci.length - 4 })) : null);
}

const ringkasNilai = (v) => {
  if (v === null || v === undefined) return '∅';
  const s = String(v);
  return s.length > 42 ? `${s.slice(0, 42)}…` : s;
};

function navHalaman(total, keadaan, muat) {
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
