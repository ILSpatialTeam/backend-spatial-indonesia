import { toPlanetShape, toPanelShape } from '../../domain/entities/menu.js';
import { toArticle } from '../../domain/entities/article.js';
import { toAgendaEvent, agendaState } from '../../domain/entities/agenda.js';
import { toTrail } from '../../domain/entities/presence.js';
import { NotFoundError } from '../../shared/errors.js';
import { TAG } from '../../infrastructure/cache/memory-cache.js';

// Baca-saja untuk pengunjung situs.
//
// Semua ketergantungannya disuntik lewat konstruktor, tidak satu pun diimpor
// dari infrastructure/ — itu yang membuat service ini bisa diuji dengan
// repositori palsu dan tidak tahu-menahu soal Postgres.
export class ContentService {
  constructor({ menus, articles, taxonomy, sparings, agenda, presence, settings, cache }) {
    this.menus = menus;
    this.articles = articles;
    this.taxonomy = taxonomy;
    this.sparings = sparings;
    this.agenda = agenda;
    this.presence = presence;
    this.settings = settings;
    this.cache = cache;
  }

  async _freshDays() {
    const nilai = await this.cache.wrap('setting:fresh_days', { tags: [TAG.settings] }, () =>
      this.settings.get('insight.fresh_days')
    );
    return Number(nilai ?? 30);
  }

  async _presenceLimit() {
    const nilai = await this.cache.wrap('setting:presence_limit', { tags: [TAG.settings] }, () =>
      this.settings.get('presence.limit')
    );
    return Number(nilai ?? 12);
  }

  // ── satu panggilan untuk seluruh isi situs ────────────────────────────────
  //
  // Frontend membutuhkan tujuh hal sekaligus sebelum bisa menggambar apa pun
  // yang benar: planet, panel, kategori, frekuensi, daftar artikel, agenda,
  // dan jejak. Tujuh permintaan HTTP berarti tujuh kali latensi jaringan
  // sebelum tata suryanya betul — dan di sambungan seluler itu terasa.
  //
  // Jejak kehadiran sengaja TIDAK ikut di sini: isinya berubah setiap kali ada
  // orang membuka situs, jadi kalau digabung, seluruh muatan ini jadi tidak
  // bisa di-cache. Ia diambil terpisah dan boleh datang belakangan.
  async bootstrap() {
    return this.cache.wrap(
      'bootstrap',
      { tags: [TAG.menu, TAG.article, TAG.taxonomy, TAG.agenda, TAG.sparing, TAG.settings], ttlMs: 120_000 },
      async () => {
        const freshDays = await this._freshDays();
        // Dijalankan berbarengan: tidak ada yang bergantung pada hasil yang
        // lain, jadi menjalankannya berurutan hanya menjumlahkan latensinya.
        const [menus, kategori, frekuensi, artikel, acara, sparing] = await Promise.all([
          this.menus.listActive(),
          this.taxonomy.listCategories(),
          this.taxonomy.listFrequencies(),
          this.articles.listPublished({ limit: 100 }),
          this.agenda.listPublished(),
          this.sparings.listApprovedGrouped()
        ]);

        const planets = menus.filter((m) => m.kind === 'planet').map(toPlanetShape);

        return {
          // Bentuk-bentuk di bawah sengaja meniru persis modul data lama di
          // frontend, supaya sisi 3D dan UI tidak perlu diubah: PLANETS,
          // PANELS, NAV, CATEGORIES, FREQ, ARTICLES, AGENDA.
          planets,
          nav: menus.map((m) => ({ id: m.id, label: m.label })),
          panels: Object.fromEntries(menus.map((m) => [m.id, toPanelShape(m)])),
          icons: Object.fromEntries(menus.map((m) => [m.id, m.icon])),
          categories: Object.fromEntries(kategori.map((c) => [c.id, { label: c.label, color: c.color }])),
          frequencies: Object.fromEntries(
            frekuensi.map((f) => [f.id, { id: f.id, label: f.label, glyph: f.glyph, color: f.color, hint: f.hint }])
          ),
          articles: artikel.map((row) => toArticle(row, { freshDays })),
          sparing,
          agenda: acara.map(toAgendaEvent),
          generatedAt: new Date().toISOString()
        };
      }
    );
  }

  async menuList() {
    return this.cache.wrap('menus', { tags: [TAG.menu] }, async () => {
      const menus = await this.menus.listActive();
      return menus.map(toPanelShape);
    });
  }

  async menuById(id) {
    const menu = await this.menus.findById(id);
    if (!menu || !menu.isActive) throw new NotFoundError('Menu');
    return toPanelShape(menu);
  }

  async articleList({ category = null, limit = 50, offset = 0 } = {}) {
    const freshDays = await this._freshDays();
    const rows = await this.articles.listPublished({ category, limit, offset });
    return rows.map((row) => toArticle(row, { freshDays }));
  }

  // Membaca satu artikel. Penghitung kunjungan dinaikkan tanpa ditunggu:
  // pembaca tidak perlu menunggu satu UPDATE selesai untuk melihat tulisannya,
  // dan kalau UPDATE-nya gagal, yang hilang cuma satu angka statistik.
  async articleBySlug(slug, { countView = true } = {}) {
    const row = await this.articles.findBySlug(slug, { publishedOnly: true });
    if (!row) throw new NotFoundError('Artikel');

    const freshDays = await this._freshDays();
    const artikel = toArticle(row, { freshDays, withBody: true });
    const sparing = await this.sparings.listApprovedByArticle(row.id);

    if (countView) {
      this.articles.incrementView(row.id).catch(() => {});
    }

    return {
      ...artikel,
      sparing: sparing.map((s) => ({
        id: s.id,
        freq: s.freq,
        name: s.name,
        text: s.text,
        anchor: [s.anchor_x, s.anchor_y],
        boost: s.boost,
        at: new Date(s.created_at).toISOString().slice(0, 10)
      }))
    };
  }

  // Bukan `taxonomy()`: konstruktor memasang `this.taxonomy` sebagai
  // repositorinya, dan properti instans menang atas method prototipe.
  async taxonomyAll() {
    return this.cache.wrap('taxonomy', { tags: [TAG.taxonomy] }, async () => {
      const [categories, frequencies] = await Promise.all([
        this.taxonomy.listCategories(),
        this.taxonomy.listFrequencies()
      ]);
      return { categories, frequencies };
    });
  }

  async agendaList() {
    return this.cache.wrap('agenda', { tags: [TAG.agenda] }, async () => {
      const rows = await this.agenda.listPublished();
      return rows.map(toAgendaEvent);
    });
  }

  // Keadaan agenda dihitung dari daftar yang sama yang dipakai frontend, lewat
  // fungsi yang sama pula. Endpoint ini untuk panel di dalam headset dan
  // pratinjau dashboard — bukan untuk dipanggil per frame.
  async agendaNow(now = Date.now()) {
    const list = await this.agendaList();
    return agendaState(list, now);
  }

  async presenceTrails() {
    const limit = await this._presenceLimit();
    const rows = await this.presence.listRecent(limit);
    const sekarang = Date.now();
    return rows.map((r) => toTrail(r, sekarang));
  }

  async publicSettings() {
    return this.cache.wrap('settings:public', { tags: [TAG.settings] }, async () => {
      const semua = await this.settings.all();
      // Hanya kunci ber-awalan publik yang dikeluarkan. Pengaturan operasional
      // tidak ikut hanya karena kebetulan ada di tabel yang sama.
      return Object.fromEntries(
        Object.entries(semua).filter(([k]) => k.startsWith('site.') || k.startsWith('insight.'))
      );
    });
  }
}
