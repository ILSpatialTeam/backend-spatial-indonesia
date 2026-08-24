// Repositori palsu untuk menguji service tanpa Postgres.
//
// Inilah bayaran dari aturan "service menerima repositori lewat konstruktor".
// Tanpa itu, menguji aturan tabrakan orbit menuntut database yang menyala,
// migrasi yang terpasang, dan data yang disiapkan — untuk memeriksa satu
// perbandingan angka.
export const cachePalsu = () => ({
  dibatalkan: [],
  invalidate(...tags) { this.dibatalkan.push(...tags); return tags.length; },
  async wrap(_k, _o, hitung) { return hitung(); },
  get() { return undefined; },
  set(_k, v) { return v; },
  clear() { return 0; },
  get size() { return 0; }
});

export const auditPalsu = () => ({
  catatan: [],
  async record(e) { this.catatan.push(e); },
  async list() { return { rows: [], total: 0 }; }
});

export const menuRepoPalsu = (menus = []) => ({
  data: [...menus],
  async listAll() { return this.data; },
  async listActive() { return this.data.filter((m) => m.isActive); },
  async findById(id) { return this.data.find((m) => m.id === id) ?? null; },
  async create(d) { this.data.push({ items: [], links: [], ...d }); return d; },
  async update(id, patch) {
    const m = this.data.find((x) => x.id === id);
    Object.assign(m, patch);
    return m;
  },
  async remove(id) { this.data = this.data.filter((m) => m.id !== id); },
  async replaceItems() {}, async replaceLinks() {}, async reorder() {}
});

// Repositori asli mengembalikan BARIS DATABASE (snake_case), bukan objek yang
// dikirim ke dalamnya. Yang palsu harus menghormati kontrak yang sama —
// kalau tidak, tesnya lulus terhadap bentuk yang tidak pernah ada di produksi,
// dan itu lebih buruk daripada tidak punya tes sama sekali.
const KE_KOLOM = {
  categoryId: 'category_id', coverUrl: 'cover_url', externalUrl: 'external_url',
  bodyHtml: 'body_html', readMinutes: 'read_minutes', publishedAt: 'published_at',
  createdBy: 'created_by', viewCount: 'view_count'
};
const keBaris = (obj) =>
  Object.fromEntries(Object.entries(obj).map(([k, v]) => [KE_KOLOM[k] ?? k, v]));

export const artikelRepoPalsu = (rows = []) => ({
  data: [...rows],
  async findById(id) { return this.data.find((a) => a.id === id) ?? null; },
  async findBySlug(slug) { return this.data.find((a) => a.slug === slug) ?? null; },
  async takenSlugs() { return new Set(this.data.map((a) => a.slug)); },
  async nextNo() { return String(this.data.length + 1).padStart(3, '0'); },
  async create(d) {
    const row = { id: `id-${this.data.length + 1}`, view_count: 0, ...keBaris(d) };
    this.data.push(row);
    return row;
  },
  async update(id, patch) {
    const a = this.data.find((x) => x.id === id);
    Object.assign(a, keBaris(patch));
    return a;
  },
  async remove(id) { this.data = this.data.filter((a) => a.id !== id); },
  async listForAdmin() { return { rows: this.data, total: this.data.length }; },
  async listPublished() { return this.data; },
  async incrementView() {}
});

export const taksonomiPalsu = (kategori = [{ id: 'teknis', label: 'Teknis', color: '#9E94F9' }]) => ({
  async listCategories() { return kategori; },
  async listFrequencies() { return []; },
  async upsertCategory(d) { return d; },
  async removeCategory() {},
  async upsertFrequency(d) { return d; }
});

export const sparingRepoPalsu = () => ({
  dibuat: [],
  jumlahTerkini: 0,
  async create(d) { this.dibuat.push(d); return { ...d, id: 'sp-1', freq: d.frequencyId, name: d.authorName, text: d.body, anchor_x: d.anchorX, anchor_y: d.anchorY, boost: 0, created_at: new Date() }; },
  async countRecentFrom() { return this.jumlahTerkini; },
  async listApprovedByArticle() { return []; },
  async listApprovedGrouped() { return {}; },
  async listForModeration() { return { rows: [], total: 0 }; },
  async setStatus(id, status) { return { id, status }; },
  async boost(id) { return { id, boost: 1 }; },
  async remove() {}
});

export const pengaturanPalsu = (nilai = {}) => ({
  async all() { return nilai; },
  async get(k) { return nilai[k] ?? null; },
  async set(k, v) { nilai[k] = v; return { key: k, value: v }; }
});
