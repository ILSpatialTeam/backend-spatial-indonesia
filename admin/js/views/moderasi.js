import { api } from '../api.js';
import { el, pasang, kosongkan, tabel, lencana, toast, toastGalat, konfirmasi, tanggalID, select } from '../ui.js';
import { t } from '../i18n.js';

// Moderasi sparing, pendaftaran Gabung, dan langit komunitas — tiga antrean
// yang bentuk kerjanya sama: baca, putuskan, lanjut. Ketiganya berbagi
// `buatPemilih` di bawah, karena menumpuknya sama-sama mungkin.

const FREK = { sinyal: 'biru', observasi: 'hijau', sonde: 'netral', anomali: 'perhatian' };

// Kunci terjemahan ditulis utuh, tidak dirangkai dari potongan string.
// `t('sparing.' + status)` jalan di runtime tapi tidak bisa diperiksa: kunci
// yang hilang baru ketahuan saat halamannya dibuka orang.
const LABEL_STATUS_SPARING = {
  pending: 'sparing.menunggu', approved: 'sparing.disetujui', rejected: 'sparing.ditolak'
};
const LABEL_STATUS_DAFTAR = {
  new: 'daftar.baru', contacted: 'daftar.dihubungi', archived: 'daftar.diarsipkan'
};

// ── pemilihan massal ────────────────────────────────────────────────────────
//
// Antrean moderasi bisa menumpuk. Menyetujui delapan puluh sparing satu per
// satu berarti delapan puluh klik, dan halaman digambar ulang di antara setiap
// klik sehingga posisi gulirnya hilang terus.
//
// Permintaannya tetap satu per satu ke server — endpoint massal berarti
// permukaan baru yang harus divalidasi, dibatasi laju, dan diaudit sendiri —
// tapi dikirim bersamaan dan halamannya digambar ulang sekali saja di akhir.
function buatPemilih(muat) {
  const dipilih = new Set();
  const bar = el('div', { class: 'pilih-bar', hidden: true, role: 'toolbar' });
  let aksiKini = [];

  const segarkanBar = () => {
    bar.hidden = dipilih.size === 0;
    if (bar.hidden) return;
    pasang(kosongkan(bar),
      el('span', { class: 'pilih-jumlah' }, t('umum.dipilih', { n: dipilih.size })),
      ...aksiKini.map(({ label, kelas, jalankan, konfirmasiTeks }) =>
        el('button', {
          class: `btn btn-kecil ${kelas ?? ''}`,
          onclick: async () => {
            if (konfirmasiTeks && !(await konfirmasi(konfirmasiTeks(dipilih.size)))) return;
            const daftar = [...dipilih];
            bar.querySelectorAll('button').forEach((b) => { b.disabled = true; });
            // allSettled, bukan all: satu kegagalan tidak boleh membatalkan
            // sisanya, dan pengguna berhak tahu berapa yang berhasil.
            const hasil = await Promise.allSettled(daftar.map(jalankan));
            const gagal = hasil.filter((h) => h.status === 'rejected').length;
            dipilih.clear();
            toast(gagal
              ? t('umum.sebagianGagal', { ok: daftar.length - gagal, gagal })
              : t('umum.diproses', { n: daftar.length }), gagal ? 'galat' : 'sukses');
            muat();
          }
        }, label)),
      el('button', {
        class: 'btn btn-kecil',
        onclick: () => {
          dipilih.clear();
          document.querySelectorAll('.pilih-kotak').forEach((c) => { c.checked = false; });
          segarkanBar();
        }
      }, t('aksi.batalPilih')));
  };

  return {
    bar,
    dipilih,
    siapkan(aksi) { aksiKini = aksi; dipilih.clear(); segarkanBar(); },
    kolom(semuaId) {
      return {
        judul: el('input', {
          type: 'checkbox', class: 'pilih-kotak', 'aria-label': t('umum.semua'),
          onchange: (e) => {
            dipilih.clear();
            if (e.target.checked) semuaId.forEach((id) => dipilih.add(id));
            document.querySelectorAll('tbody .pilih-kotak').forEach((c) => { c.checked = e.target.checked; });
            segarkanBar();
          }
        }),
        lebar: '38px',
        sel: (r) => el('input', {
          type: 'checkbox', class: 'pilih-kotak', 'aria-label': t('umum.dipilih', { n: 1 }),
          onchange: (e) => {
            if (e.target.checked) dipilih.add(r.id); else dipilih.delete(r.id);
            segarkanBar();
          }
        })
      };
    }
  };
}

export async function tampilanSparing(wadah) {
  const keadaan = { status: 'pending', offset: 0, limit: 25 };
  const isi = el('div');
  const pemilih = buatPemilih(() => muat());

  async function muat() {
    pasang(kosongkan(isi), el('p', { class: 'redup' }, t('umum.memuat')));
    try {
      const { items, total } = await api.get('/admin/sparing', keadaan);
      const aksi = async (id, status, pesan) => {
        try { await api.patch(`/admin/sparing/${id}`, { status }); toast(pesan, 'sukses'); muat(); }
        catch (err) { toastGalat(err); }
      };
      pemilih.siapkan([
        { label: t('sparing.setujuiSemua'), kelas: 'btn-utama', jalankan: (id) => api.patch(`/admin/sparing/${id}`, { status: 'approved' }) },
        { label: t('sparing.tolakSemua'), jalankan: (id) => api.patch(`/admin/sparing/${id}`, { status: 'rejected' }) },
        {
          label: t('sparing.hapusSemua'), kelas: 'btn-bahaya',
          konfirmasiTeks: (n) => t('sparing.konfirmasiHapusMassal', { n }),
          jalankan: (id) => api.del(`/admin/sparing/${id}`)
        }
      ]);
      pasang(kosongkan(isi),
        el('p', { class: 'redup kecil' }, t('sparing.jumlah', {
          n: total,
          status: keadaan.status ? t(LABEL_STATUS_SPARING[keadaan.status]) : t('umum.semua')
        })),
        pemilih.bar,
        tabel(
          [
            pemilih.kolom(items.map((x) => x.id)),
            { judul: t('sparing.kolomFrekuensi'), lebar: '110px', sel: (s) => lencana(s.freq, FREK[s.freq]) },
            { judul: t('sparing.kolomPengirim'), lebar: '120px', sel: (s) => s.name },
            {
              judul: t('sparing.kolomIsi'),
              sel: (s) => el('div', {},
                el('p', { class: 'sparing-teks' }, s.text),
                el('div', { class: 'redup kecil' }, `${t('sparing.pada', { judul: s.articleTitle })} · ${tanggalID(s.createdAt)}`))
            },
            { judul: t('sparing.kolomBoost'), lebar: '60px', sel: (s) => String(s.boost) },
            {
              judul: '',
              lebar: '215px',
              sel: (s) => el('div', { class: 'aksi-baris' },
                s.status !== 'approved'
                  ? el('button', { class: 'btn btn-kecil btn-utama', onclick: () => aksi(s.id, 'approved', t('sparing.ditampilkan')) }, t('sparing.setujui'))
                  : null,
                s.status !== 'rejected'
                  ? el('button', { class: 'btn btn-kecil', onclick: () => aksi(s.id, 'rejected', t('sparing.ditolakPesan')) }, t('sparing.tolak'))
                  : null,
                el('button', {
                  class: 'btn btn-kecil btn-bahaya',
                  onclick: async () => {
                    if (!(await konfirmasi(t('sparing.konfirmasiHapus')))) return;
                    try { await api.del(`/admin/sparing/${s.id}`); toast(t('umum.terhapus'), 'sukses'); muat(); }
                    catch (err) { toastGalat(err); }
                  }
                }, t('aksi.hapus')))
            }
          ],
          items,
          { kosong: t('sparing.kosong') }
        )
      );
    } catch (err) {
      pasang(kosongkan(isi), el('p', { class: 'galat' }, err.message));
    }
  }

  pasang(kosongkan(wadah),
    el('div', { class: 'halaman-kepala' },
      el('div', {},
        el('h1', {}, t('sparing.judul')),
        el('p', { class: 'redup' }, t('sparing.subjudul'))),
      select(
        [
          { value: 'pending', label: t('sparing.menunggu'), selected: true },
          { value: 'approved', label: t('sparing.disetujui') },
          { value: 'rejected', label: t('sparing.ditolak') },
          { value: '', label: t('umum.semua') }
        ],
        { onchange: (e) => { keadaan.status = e.target.value; keadaan.offset = 0; muat(); } }
      )),
    isi
  );
  await muat();
}

export async function tampilanPendaftaran(wadah) {
  const keadaan = { status: 'new', offset: 0, limit: 25 };
  const isi = el('div');
  const pemilih = buatPemilih(() => muat());

  async function muat() {
    pasang(kosongkan(isi), el('p', { class: 'redup' }, t('umum.memuat')));
    try {
      const { items, total } = await api.get('/admin/submissions', keadaan);
      const ubah = async (id, status) => {
        try { await api.patch(`/admin/submissions/${id}`, { status }); toast(t('daftar.statusDiperbarui'), 'sukses'); muat(); }
        catch (err) { toastGalat(err); }
      };
      pemilih.siapkan([
        { label: t('daftar.tandaiDihubungi'), kelas: 'btn-utama', jalankan: (id) => api.patch(`/admin/submissions/${id}`, { status: 'contacted' }) },
        { label: t('daftar.arsipkanSemua'), jalankan: (id) => api.patch(`/admin/submissions/${id}`, { status: 'archived' }) },
        {
          label: t('sparing.hapusSemua'), kelas: 'btn-bahaya',
          konfirmasiTeks: (n) => t('daftar.konfirmasiHapusMassal', { n }),
          jalankan: (id) => api.del(`/admin/submissions/${id}`)
        }
      ]);
      pasang(kosongkan(isi),
        el('p', { class: 'redup kecil' }, t('daftar.jumlah', { n: total })),
        pemilih.bar,
        tabel(
          [
            pemilih.kolom(items.map((x) => x.id)),
            { judul: t('daftar.kolomNama'), lebar: '178px', sel: (s) => el('strong', {}, s.name) },
            {
              judul: t('daftar.kolomKontak'),
              sel: (s) => el('div', {},
                el('a', { href: `mailto:${s.email}`, class: 'tautan' }, s.email),
                s.focus ? el('div', { class: 'redup kecil' }, s.focus) : null,
                s.message ? el('p', { class: 'sparing-teks' }, s.message) : null)
            },
            { judul: t('daftar.kolomMasuk'), lebar: '110px', sel: (s) => tanggalID(s.created_at) },
            {
              judul: t('artikel.kolomStatus'),
              lebar: '110px',
              sel: (s) => lencana(t(LABEL_STATUS_DAFTAR[s.status]),
                s.status === 'new' ? 'perhatian' : s.status === 'contacted' ? 'hijau' : 'redup')
            },
            {
              judul: '',
              lebar: '240px',
              sel: (s) => el('div', { class: 'aksi-baris' },
                s.status !== 'contacted'
                  ? el('button', { class: 'btn btn-kecil btn-utama', onclick: () => ubah(s.id, 'contacted') }, t('daftar.tandaiDihubungi'))
                  : null,
                s.status !== 'archived'
                  ? el('button', { class: 'btn btn-kecil', onclick: () => ubah(s.id, 'archived') }, t('daftar.arsipkan'))
                  : null,
                el('button', {
                  class: 'btn btn-kecil btn-bahaya',
                  onclick: async () => {
                    if (!(await konfirmasi(t('daftar.konfirmasiHapus', { nama: s.name })))) return;
                    try { await api.del(`/admin/submissions/${s.id}`); toast(t('umum.terhapus'), 'sukses'); muat(); }
                    catch (err) { toastGalat(err); }
                  }
                }, t('aksi.hapus')))
            }
          ],
          items,
          { kosong: t('daftar.kosong') }
        )
      );
    } catch (err) {
      pasang(kosongkan(isi), el('p', { class: 'galat' }, err.message));
    }
  }

  pasang(kosongkan(wadah),
    el('div', { class: 'halaman-kepala' },
      el('div', {},
        el('h1', {}, t('daftar.judul')),
        el('p', { class: 'redup' }, t('daftar.subjudul'))),
      select(
        [
          { value: 'new', label: t('daftar.baru'), selected: true },
          { value: 'contacted', label: t('daftar.dihubungi') },
          { value: 'archived', label: t('daftar.diarsipkan') },
          { value: '', label: t('umum.semua') }
        ],
        { onchange: (e) => { keadaan.status = e.target.value; keadaan.offset = 0; muat(); } }
      )),
    isi
  );
  await muat();
}

// ── langit komunitas ────────────────────────────────────────────────────────
//
// Antrean ini berbeda dari dua di atas dalam satu hal yang menentukan bentuk
// halamannya: yang dimoderasi bukan teks, tapi tempat. "Apakah kalimat ini
// pantas" bisa dijawab dari satu baris tabel; "apakah langitnya masih terasa
// seperti langit" tidak bisa — itu pertanyaan tentang sebaran.
//
// Maka di atas tabel ada peta. Bukan hiasan: ia menjawab satu-satunya
// pertanyaan yang tidak bisa dijawab tabel, yaitu apakah bintangnya menumpuk
// di satu titik atau benar-benar tersebar.

const LABEL_STATUS_LANGIT = {
  pending: 'langit.menunggu', approved: 'langit.disetujui', rejected: 'langit.ditolak'
};
const WARNA_STATUS_LANGIT = { pending: 'perhatian', approved: 'hijau', rejected: 'netral' };

// ra 0–24 jam → 0–100% mendatar; dec +90…-90° → 0–100% menurun.
function petaLangit(items) {
  const titik = items.map((b) => el('span', {
    class: `lg-titik lg-${b.status}`,
    style: { left: `${(b.ra / 24) * 100}%`, top: `${((90 - b.dec) / 180) * 100}%` },
    title: `${b.name} · ra ${b.ra.toFixed(2)}j · dec ${b.dec.toFixed(1)}°`
  }));
  return el('div', { class: 'kartu lg-peta-kartu' },
    el('div', { class: 'lg-peta-kepala' },
      el('h3', {}, t('langit.petaJudul')),
      el('p', { class: 'redup kecil' }, t('langit.petaKeterangan'))),
    el('div', { class: 'lg-peta' },
      // Garis khatulistiwa langit (dec 0°) sebagai satu-satunya penanda skala.
      el('span', { class: 'lg-khatulistiwa' }),
      ...titik));
}

const posisiSingkat = (b) => `${b.ra.toFixed(2)}j · ${b.dec > 0 ? '+' : ''}${b.dec.toFixed(1)}°`;

export async function tampilanLangit(wadah) {
  const keadaan = { status: '', offset: 0, limit: 50 };
  const isi = el('div');
  const pemilih = buatPemilih(() => muat());

  async function muat() {
    pasang(kosongkan(isi), el('p', { class: 'redup' }, t('umum.memuat')));
    try {
      const { items, total } = await api.get('/admin/sky', keadaan);
      const aksi = async (id, status, pesan) => {
        try { await api.patch(`/admin/sky/${id}`, { status }); toast(pesan, 'sukses'); muat(); }
        catch (err) { toastGalat(err); }
      };
      pemilih.siapkan([
        { label: t('langit.nyalakanSemua'), kelas: 'btn-utama', jalankan: (id) => api.patch(`/admin/sky/${id}`, { status: 'approved' }) },
        { label: t('langit.padamkanSemua'), jalankan: (id) => api.patch(`/admin/sky/${id}`, { status: 'rejected' }) },
        {
          label: t('langit.hapusSemua'), kelas: 'btn-bahaya',
          konfirmasiTeks: (n) => t('langit.konfirmasiHapusMassal', { n }),
          jalankan: (id) => api.del(`/admin/sky/${id}`)
        }
      ]);

      pasang(kosongkan(isi),
        items.length ? petaLangit(items) : null,
        el('p', { class: 'redup kecil' }, t('langit.jumlah', {
          n: total,
          status: keadaan.status ? t(LABEL_STATUS_LANGIT[keadaan.status]) : t('umum.semua')
        })),
        pemilih.bar,
        tabel(
          [
            pemilih.kolom(items.map((x) => x.id)),
            { judul: t('langit.kolomNama'), lebar: '130px', sel: (b) => b.name },
            { judul: t('langit.kolomAsal'), lebar: '120px', sel: (b) => b.city || '—' },
            { judul: t('langit.kolomCatatan'), sel: (b) => el('span', { class: 'sparing-teks' }, b.note || '—') },
            {
              judul: t('langit.kolomPosisi'), lebar: '130px',
              sel: (b) => el('span', { class: 'kecil mono' }, posisiSingkat(b))
            },
            {
              judul: t('langit.kolomStatus'), lebar: '100px',
              sel: (b) => lencana(t(LABEL_STATUS_LANGIT[b.status]), WARNA_STATUS_LANGIT[b.status])
            },
            { judul: t('langit.kolomTanggal'), lebar: '110px', sel: (b) => tanggalID(b.createdAt) },
            {
              judul: '', lebar: '215px',
              sel: (b) => el('div', { class: 'aksi-baris' },
                b.status !== 'approved'
                  ? el('button', { class: 'btn btn-kecil btn-utama', onclick: () => aksi(b.id, 'approved', t('langit.sudahMenyala')) }, t('langit.nyalakan'))
                  : null,
                b.status !== 'rejected'
                  ? el('button', { class: 'btn btn-kecil', onclick: () => aksi(b.id, 'rejected', t('langit.sudahPadam')) }, t('langit.padamkan'))
                  : null,
                el('button', {
                  class: 'btn btn-kecil btn-bahaya',
                  onclick: async () => {
                    if (!(await konfirmasi(t('langit.konfirmasiHapus', { nama: b.name })))) return;
                    try { await api.del(`/admin/sky/${b.id}`); toast(t('umum.terhapus'), 'sukses'); muat(); }
                    catch (err) { toastGalat(err); }
                  }
                }, t('aksi.hapus')))
            }
          ],
          items,
          { kosong: t('langit.kosong') }
        )
      );
    } catch (err) {
      pasang(kosongkan(isi), el('p', { class: 'galat' }, err.message));
    }
  }

  pasang(kosongkan(wadah),
    el('div', { class: 'halaman-kepala' },
      el('div', {},
        el('h1', {}, t('langit.judul')),
        el('p', { class: 'redup' }, t('langit.subjudul'))),
      select(
        [
          { value: '', label: t('umum.semua'), selected: true },
          { value: 'pending', label: t('langit.menunggu') },
          { value: 'approved', label: t('langit.disetujui') },
          { value: 'rejected', label: t('langit.ditolak') }
        ],
        { onchange: (e) => { keadaan.status = e.target.value; keadaan.offset = 0; muat(); } }
      )),
    isi
  );
  await muat();
}
