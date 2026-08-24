import { api } from '../api.js';
import {
  el, pasang, kosongkan, toast, toastGalat, drawer, bidang, input, textarea, select, lencana, tandaiGalat
} from '../ui.js';
import { t } from '../i18n.js';

// Pengelolaan tujuh menu.
//
// Isi panel dan parameter orbit disunting di formulir yang sama karena
// keduanya adalah satu benda: mengubah "Program" berarti mengubah teks
// panelnya sekaligus planet yang mewakilinya. Memisahkannya jadi dua halaman
// akan menyembunyikan hubungan itu.

export async function tampilanMenu(wadah) {
  const isi = el('div');

  async function muat() {
    pasang(kosongkan(isi), el('p', { class: 'redup' }, t('umum.memuat')));
    try {
      const menus = await api.get('/admin/menus');
      pasang(kosongkan(isi),
        el('div', { class: 'kartu-kisi' }, menus.map((m) => kartuMenu(m, menus, muat)))
      );
    } catch (err) {
      pasang(kosongkan(isi), el('p', { class: 'galat' }, err.message));
    }
  }

  pasang(kosongkan(wadah),
    el('div', { class: 'halaman-kepala' },
      el('div', {},
        el('h1', {}, t('menu.judul')),
        el('p', { class: 'redup' }, t('menu.subjudul')))),
    isi
  );
  await muat();
}

// Kartu menu.
//
// Versi pertama menumpahkan seluruh isi baris database ke layar: orbit,
// ukuran, laju, kemiringan, jumlah butir — lima angka telanjang berjajar tanpa
// menjelaskan apa pun. Angka `0.085` tidak berarti apa-apa bagi orang yang
// sedang menyunting teks panel.
//
// Sekarang kartunya menjawab tiga pertanyaan berbeda dengan tiga cara berbeda:
//
//   "Planet yang mana?"   → gambar orbitnya, bukan angkanya. Posisi dan ukuran
//                           lingkaran memakai nilai asli dari database, jadi
//                           kartunya adalah pratinjau, bukan ilustrasi.
//   "Isinya apa?"         → judul, lead, dan cuplikan butir pertama.
//   "Sehat tidak?"        → satu baris keterangan yang menerjemahkan angka jadi
//                           kalimat ("mengorbit paling cepat", "6 butir").
//
// Angka mentahnya tetap ada — di formulir sunting, tempat ia memang dibutuhkan.

const hex = (int) => `#${Number(int ?? 0).toString(16).padStart(6, '0')}`;

// Orbit terjauh dipakai sebagai skala supaya semua kartu memakai perbandingan
// yang sama; kalau tiap kartu menormalkan dirinya sendiri, planet terdalam dan
// terluar akan tampak sama jauhnya.
function pratinjauOrbit(m, orbitMaks) {
  if (m.kind !== 'planet') {
    return el('div', { class: 'orb-pratinjau orb-inti' },
      el('span', { class: 'orb-matahari', style: { '--w': m.accent } }));
  }
  const rasio = Math.min(1, Number(m.orbit) / orbitMaks);
  // 26%–92% dari lebar kartu: planet terdalam tetap terlihat lepas dari
  // matahari, terluar tidak menyentuh tepi.
  const jarak = 26 + rasio * 66;
  const besar = 7 + Math.min(1, Number(m.size) / 1.6) * 9;
  return el('div', { class: 'orb-pratinjau' },
    el('span', { class: 'orb-matahari orb-kecil' }),
    el('span', { class: 'orb-lintasan', style: { width: `${jarak}%` } }),
    el('span', {
      class: m.hasRing ? 'orb-planet orb-bercincin' : 'orb-planet',
      style: { left: `${jarak}%`, width: `${besar}px`, height: `${besar}px`, '--w': hex(m.color) }
    }));
}

// Angka orbit diterjemahkan jadi kalimat. "speed 0.085" tidak memberi tahu
// apa-apa; "paling cepat mengorbit" langsung dimengerti.
function keteranganOrbit(m, semua) {
  if (m.kind !== 'planet') return t('menu.matahari');
  const planet = semua.filter((x) => x.kind === 'planet');
  const urutJarak = [...planet].sort((a, b) => a.orbit - b.orbit);
  const urutLaju = [...planet].sort((a, b) => b.speed - a.speed);
  const bagian = [];
  if (urutJarak[0]?.id === m.id) bagian.push(t('menu.palingDekat'));
  else if (urutJarak[urutJarak.length - 1]?.id === m.id) bagian.push(t('menu.palingJauh'));
  else bagian.push(t('menu.urutanKe', { n: urutJarak.findIndex((x) => x.id === m.id) + 1 }));
  if (urutLaju[0]?.id === m.id) bagian.push(t('menu.palingCepat'));
  if (m.hasRing) bagian.push(t('menu.bercincin'));
  return `${bagian.join(', ')}.`;
}

function kartuMenu(m, semua, muat) {
  const orbitMaks = Math.max(...semua.filter((x) => x.kind === 'planet').map((x) => Number(x.orbit) || 1), 1);
  const butir = m.items ?? [];
  const dinamis = m.id === 'event' || m.id === 'insight';

  return el(
    'article',
    { class: `kartu kartu-menu${m.isActive ? '' : ' kartu-mati'}`, style: { '--w': m.accent } },

    el('div', { class: 'kartu-atas' },
      el('div', { class: 'kartu-identitas' },
        el('span', { class: 'kartu-no' }, m.no),
        el('div', {},
          el('h3', {}, m.label),
          el('span', { class: 'redup kecil' },
            m.kind === 'core' ? t('menu.inti') : `${t('menu.planet')} · ${m.skin ?? '—'}`))),
      m.isActive ? null : lencana(t('menu.disembunyikan'), 'redup')),

    pratinjauOrbit(m, orbitMaks),
    el('p', { class: 'kartu-orbit-teks redup kecil' }, keteranganOrbit(m, semua)),

    el('div', { class: 'kartu-isi' },
      el('p', { class: 'kartu-judul' }, m.title),
      el('p', { class: 'kartu-lead redup' }, m.lead)),

    // Isi panel diringkas jadi satu baris, bukan daftar penuh. Kartu ini untuk
    // mengenali menu, bukan membacanya — bacanya di formulir sunting.
    el('div', { class: 'kartu-butir' },
      dinamis
        ? el('span', { class: 'redup kecil' }, t(m.id === 'event' ? 'menu.dariAgenda' : 'menu.dariArtikel'))
        : butir.length
          ? el('span', { class: 'redup kecil' },
              `${t('menu.jumlahItem', { n: butir.length })} · ${butir.slice(0, 2).map((b) => b.k || b.t).filter(Boolean).join(', ')}${butir.length > 2 ? '…' : ''}`)
          : el('span', { class: 'redup kecil' }, t('menu.belumAdaItem')),
      m.links?.length ? el('span', { class: 'redup kecil' }, t('menu.jumlahTautan', { n: m.links.length })) : null),

    el('div', { class: 'kartu-aksi' },
      el('button', { class: 'btn btn-kecil btn-utama', onclick: () => bukaMenu(m, muat) }, t('aksi.sunting')),
      el('button', {
        class: 'btn btn-kecil',
        title: t(m.isActive ? 'menu.sembunyikanDariSitus' : 'menu.tampilkanDiSitus'),
        onclick: async () => {
          try {
            await api.patch(`/admin/menus/${m.id}`, { isActive: !m.isActive });
            toast(t(m.isActive ? 'menu.disembunyikanPesan' : 'menu.ditampilkanPesan'), 'sukses');
            muat();
          } catch (err) { toastGalat(err); }
        }
      }, t(m.isActive ? 'aksi.sembunyikan' : 'aksi.tampilkan')))
  );
}

function bukaMenu(m, setelahSimpan) {
  const form = el('form', { class: 'form' });
  const { tutup } = drawer(t('menu.form.judul', { nama: m.label }), form, { lebar: 'min(760px, 94vw)' });

  // Butir panel disunting sebagai daftar yang bisa ditambah dan dikurangi,
  // lalu dikirim utuh. Server mengganti seluruh isinya — tidak ada diff per
  // baris yang perlu dibuat benar di sisi klien.
  const daftarButir = el('div', { class: 'butir-daftar' });
  const tambahButir = (b = { k: '', t: '', d: '' }) => {
    const baris = el(
      'div',
      { class: 'butir' },
      input({ class: 'kendali kendali-kecil', placeholder: t('menu.form.labelItem'), value: b.k ?? '', dataset: { f: 'k' } }),
      input({ class: 'kendali kendali-kecil', placeholder: t('menu.form.judulItem'), value: b.t ?? '', dataset: { f: 't' } }),
      textarea({ class: 'kendali kendali-kecil', placeholder: t('menu.form.deskripsiItem'), rows: 2, value: b.d ?? '', dataset: { f: 'd' } }),
      el('button', { type: 'button', class: 'btn-ikon', title: t('menu.form.hapusItem'), onclick: () => baris.remove() }, '×')
    );
    daftarButir.append(baris);
  };
  m.items.forEach(tambahButir);

  const daftarTautan = el('div', { class: 'butir-daftar' });
  const tambahTautan = (l = { label: '', url: '' }) => {
    const baris = el(
      'div',
      { class: 'butir butir-2' },
      input({ class: 'kendali kendali-kecil', placeholder: t('menu.form.labelItem'), value: l.label ?? '', dataset: { f: 'label' } }),
      input({ class: 'kendali kendali-kecil', placeholder: 'https://…', value: l.url ?? '', dataset: { f: 'url' } }),
      el('button', { type: 'button', class: 'btn-ikon', title: t('menu.form.hapusTautan'), onclick: () => baris.remove() }, '×')
    );
    daftarTautan.append(baris);
  };
  m.links.forEach(tambahTautan);

  const planetBidang = el(
    'fieldset',
    { class: 'kotak' },
    el('legend', {}, t('menu.form.orbit')),
    el('p', { class: 'redup kecil' }, t('menu.form.orbitCatatan')),
    el('div', { class: 'baris-3' },
      bidang(t('menu.form.jarakOrbit'), input({ name: 'orbit', type: 'number', step: '0.5', value: m.orbit ?? '' }), { nama: 'orbit' }),
      bidang(t('menu.form.ukuran'), input({ name: 'size', type: 'number', step: '0.01', value: m.size ?? '' }), { nama: 'size' }),
      bidang(t('menu.form.kecepatan'), input({ name: 'speed', type: 'number', step: '0.001', value: m.speed ?? '' }), { nama: 'speed' })),
    el('div', { class: 'baris-3' },
      bidang(t('menu.form.fase'), input({ name: 'phase', type: 'number', step: '0.1', value: m.phase ?? '' }), { nama: 'phase' }),
      bidang(t('menu.form.kemiringan'), input({ name: 'tilt', type: 'number', step: '0.01', value: m.tilt ?? '' }), { nama: 'tilt' }),
      bidang(t('menu.form.tekstur'), input({ name: 'skin', value: m.skin ?? '', placeholder: 'earth' }),
        { nama: 'skin', petunjuk: t('menu.form.teksturCatatan') })),
    el('div', { class: 'baris-2' },
      bidang(t('menu.form.warnaPlanet'), input({ name: 'colorHex', type: 'color', value: `#${(m.color ?? 0).toString(16).padStart(6, '0')}` }),
        { nama: 'color' }),
      bidang(t('menu.form.cincin'), select(
        [{ value: 'false', label: t('umum.tidak'), selected: !m.hasRing }, { value: 'true', label: t('umum.ya'), selected: m.hasRing }],
        { name: 'hasRing' }
      ), { nama: 'hasRing' }))
  );
  planetBidang.hidden = m.kind !== 'planet';

  pasang(form,
    el('div', { class: 'baris-3' },
      bidang(t('menu.form.label'), input({ name: 'label', value: m.label, required: true }), { nama: 'label' }),
      bidang(t('menu.form.nomor'), input({ name: 'no', value: m.no, required: true, maxLength: 6 }), { nama: 'no' }),
      bidang(t('menu.form.tag'), input({ name: 'tag', value: m.tag, required: true }), { nama: 'tag' })),
    el('div', { class: 'baris-2' },
      bidang(t('menu.form.warna'), input({ name: 'accent', type: 'color', value: m.accent }), { nama: 'accent' }),
      bidang(t('menu.form.tampil'), select(
        [{ value: 'true', label: t('umum.ya'), selected: m.isActive }, { value: 'false', label: t('umum.tidak'), selected: !m.isActive }],
        { name: 'isActive' }
      ), { nama: 'isActive' })),
    bidang(t('menu.form.judulPanel'), input({ name: 'title', value: m.title, required: true }), { nama: 'title' }),
    bidang(t('menu.form.leadPanel'), textarea({ name: 'lead', value: m.lead, rows: 2 }), { nama: 'lead' }),
    el('fieldset', { class: 'kotak' },
      el('legend', {}, t('menu.form.item')),
      m.id === 'event' || m.id === 'insight'
        ? el('p', { class: 'redup kecil' },
            t('menu.form.itemOtomatis', { sumber: t(m.id === 'event' ? 'nav.agenda' : 'nav.artikel').toLowerCase() }))
        : null,
      daftarButir,
      el('button', { type: 'button', class: 'btn btn-kecil', onclick: () => tambahButir() }, t('menu.form.tambahItem'))),
    el('fieldset', { class: 'kotak' },
      el('legend', {}, t('menu.form.tautan')),
      daftarTautan,
      el('button', { type: 'button', class: 'btn btn-kecil', onclick: () => tambahTautan() }, t('menu.form.tambahTautan'))),
    planetBidang,
    el('div', { class: 'form-aksi' },
      el('button', { type: 'button', class: 'btn', onclick: tutup }, t('aksi.batal')),
      el('button', { type: 'submit', class: 'btn btn-utama' }, t('aksi.simpanPerubahan')))
  );

  const kumpulkan = (wadah, medan) =>
    [...wadah.children].map((baris) =>
      Object.fromEntries(medan.map((f) => [f, baris.querySelector(`[data-f="${f}"]`)?.value ?? '']))
    );

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = new FormData(form);
    const muatan = {
      label: d.get('label'), no: d.get('no'), tag: d.get('tag'),
      accent: d.get('accent'), title: d.get('title'), lead: d.get('lead') ?? '',
      isActive: d.get('isActive') === 'true',
      items: kumpulkan(daftarButir, ['k', 't', 'd']).map((b) => ({ ...b, t: b.t || null })),
      links: kumpulkan(daftarTautan, ['label', 'url']).filter((l) => l.label && l.url)
    };

    if (m.kind === 'planet') {
      Object.assign(muatan, {
        orbit: Number(d.get('orbit')),
        size: Number(d.get('size')),
        speed: Number(d.get('speed')),
        phase: Number(d.get('phase')),
        tilt: Number(d.get('tilt')),
        skin: d.get('skin'),
        hasRing: d.get('hasRing') === 'true',
        // Input warna memberi "#rrggbb"; database menyimpan integer karena itu
        // yang langsung diterima three.js tanpa penguraian ulang.
        color: parseInt(String(d.get('colorHex')).slice(1), 16)
      });
    }

    const tombol = form.querySelector('button[type=submit]');
    tombol.disabled = true;
    try {
      await api.patch(`/admin/menus/${m.id}`, muatan);
      toast(t('umum.tersimpan'), 'sukses');
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
