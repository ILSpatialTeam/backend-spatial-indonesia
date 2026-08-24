import { api } from '../api.js';
import { el, pasang, kosongkan, tanggalID, lencana } from '../ui.js';
import { t } from '../i18n.js';

// Beranda dashboard: angka yang menuntut tindakan, bukan sekadar statistik.
//
// Yang ditampilkan hanya hal yang bisa ditindaklanjuti — sparing menunggu
// moderasi, pendaftaran belum dihubungi, acara berikutnya. Grafik jumlah
// kunjungan tidak ada di sini karena tidak ada yang bisa dikerjakan setelah
// melihatnya.
export async function tampilanBeranda(wadah, { aku } = {}) {
  pasang(kosongkan(wadah), el('p', { class: 'redup' }, t('umum.memuat')));

  const [ringkas, agendaState, audit] = await Promise.all([
    api.get('/admin/dashboard'),
    api.get('/agenda/state'),
    api.get('/admin/audit', { limit: 8 })
  ]);

  const kartu = (judul, nilai, catatan, jenis) =>
    el('div', { class: `stat stat-${jenis || 'netral'}` },
      el('span', { class: 'stat-nilai' }, String(nilai)),
      el('span', { class: 'stat-judul' }, judul),
      catatan ? el('span', { class: 'stat-catatan' }, catatan) : null);

  const berikut = agendaState.next;

  // Sapaan mengikuti jam, bukan basa-basi tetap. Dashboard ini dibuka pagi
  // untuk menyiapkan agenda dan malam untuk memoderasi sparing — menyebut
  // waktunya membuat halaman terasa tahu sedang dipakai kapan.
  const jam = new Date().getHours();
  const sapa = t(jam < 11 ? 'home.pagi' : jam < 15 ? 'home.siang' : jam < 19 ? 'home.sore' : 'home.malam');
  const namaDepan = (aku?.name || '').split(' ')[0] || '';
  const menunggu = ringkas.sparingPending + ringkas.submissionsNew;

  pasang(kosongkan(wadah),
    el('div', { class: 'hero' },
      el('h1', {}, `${sapa}${namaDepan ? ', ' + namaDepan : ''}.`),
      el('p', {}, menunggu
        ? t('home.adaTugas', {
            n: menunggu,
            acara: berikut ? t('home.acaraTinggal', { n: agendaState.days }) : t('home.acaraBelum')
          })
        : t('home.bersih', {
            acara: berikut ? t('home.acaraBerikutnya', { n: agendaState.days }) : t('home.belumAdaAcara')
          }))),

    el('div', { class: 'stat-kisi' },
      kartu(t('home.sparingMenunggu'), ringkas.sparingPending,
        t(ringkas.sparingPending ? 'home.sparingBelumTampil' : 'home.antreanBersih'),
        ringkas.sparingPending ? 'perhatian' : 'netral'),
      kartu(t('home.pendaftaranBaru'), ringkas.submissionsNew,
        t(ringkas.submissionsNew ? 'home.belumDihubungi' : 'home.sudahDitangani'),
        ringkas.submissionsNew ? 'perhatian' : 'netral'),
      kartu(t('home.agendaTerbit'), ringkas.agendaCount, t('home.agendaCatatan')),
      kartu(t('home.kategori'), ringkas.categoryCount)),

    el('div', { class: 'panel' },
      el('h2', {}, t('home.acaraJudul')),
      berikut
        ? el('div', { class: 'acara-sorot' },
            el('div', {},
              el('strong', {}, berikut.title),
              el('div', { class: 'redup kecil' }, `${tanggalID(berikut.date)} · ${berikut.place || t('home.lokasiKosong')}`)),
            el('div', { class: 'acara-hitung' },
              el('span', { class: 'acara-angka' }, String(agendaState.days)),
              el('span', { class: 'redup kecil' }, t('home.hariLagi'))))
        : el('p', { class: 'redup' }, t('home.tidakAdaAcara'))),

    el('div', { class: 'panel' },
      el('h2', {}, t('home.perubahanTerakhir')),
      audit.items.length
        ? el('ul', { class: 'jejak' },
            audit.items.map((a) =>
              el('li', {},
                lencana(a.action, 'redup'),
                el('span', {}, ` ${a.entity}`),
                a.entity_id ? el('span', { class: 'redup kecil' }, ` ${a.entity_id.slice(0, 8)}`) : null,
                el('span', { class: 'redup kecil jejak-kanan' }, `${a.actor_email ?? t('home.sistem')} · ${tanggalID(a.created_at)}`))))
        : el('p', { class: 'redup' }, t('home.belumAdaAktivitas')))
  );
}
