import { sanitizeArticleHtml, stripTags } from '../../shared/html.js';
import { NotFoundError, ValidationError } from '../../shared/errors.js';
import { diff } from '../../shared/diff.js';
import { TAG } from '../../infrastructure/cache/memory-cache.js';

// Pengelolaan tujuh menu dari dashboard.
//
// Yang membedakan ini dari CRUD biasa: sebagian kolomnya bukan teks, melainkan
// parameter yang langsung menggerakkan benda di layar. Mengubah `orbit` sebuah
// planet memindahkannya; menukar dua orbit membuat lintasannya bersilangan.
// Karena itu ada pemeriksaan tambahan yang tidak akan ada di admin panel biasa.
export class MenuAdminService {
  constructor({ menus, audit, cache }) {
    this.menus = menus;
    this.audit = audit;
    this.cache = cache;
  }

  async list() {
    return this.menus.listAll();
  }

  async byId(id) {
    const menu = await this.menus.findById(id);
    if (!menu) throw new NotFoundError('Menu');
    return menu;
  }

  _bersihkan(input) {
    const patch = { ...input };
    for (const kunci of ['label', 'no', 'tag', 'title', 'lead', 'skin']) {
      if (patch[kunci] !== undefined) patch[kunci] = stripTags(patch[kunci]);
    }
    // Blok bebas panel juga HTML dari editor, jadi tunduk pada gerbang yang
    // sama dengan isi artikel.
    if (patch.bodyHtml !== undefined) patch.bodyHtml = sanitizeArticleHtml(patch.bodyHtml);
    return patch;
  }

  // Orbit yang berdempetan membuat dua planet tampak bertabrakan saat keduanya
  // kebetulan sefase. Jaraknya harus lebih besar dari jumlah jari-jari plus
  // sedikit ruang — diperiksa terhadap seluruh planet lain, bukan cuma
  // tetangga terdekat menurut posisi menu.
  async _periksaOrbit(id, orbit, size) {
    if (orbit == null) return;
    const lain = (await this.menus.listAll()).filter((m) => m.id !== id && m.kind === 'planet');
    const jari = Number(size ?? 1);
    for (const m of lain) {
      const jarak = Math.abs(Number(m.orbit) - Number(orbit));
      const minimum = jari + Number(m.size) + 1.5;
      if (jarak < minimum) {
        throw new ValidationError({
          orbit: `Terlalu dekat dengan planet "${m.id}" (orbit ${m.orbit}). Beri jarak minimal ${minimum.toFixed(1)}.`
        });
      }
    }
  }

  async create(input, actor) {
    const patch = this._bersihkan(input);
    if (patch.kind === 'planet') await this._periksaOrbit(patch.id, patch.orbit, patch.size);

    const daftar = await this.menus.listAll();
    const menu = await this.menus.create({
      ...patch,
      position: patch.position ?? daftar.length
    });
    if (input.items) await this.menus.replaceItems(menu.id, input.items);
    if (input.links) await this.menus.replaceLinks(menu.id, input.links);

    this.cache.invalidate(TAG.menu);
    await this.audit.record({
      actorId: actor?.id, actorEmail: actor?.email, action: 'create', entity: 'menu', entityId: menu.id
    });
    return this.menus.findById(menu.id);
  }

  async update(id, input, actor) {
    const existing = await this.menus.findById(id);
    if (!existing) throw new NotFoundError('Menu');

    const patch = this._bersihkan(input);
    const kind = patch.kind ?? existing.kind;
    if (kind === 'planet' && (patch.orbit !== undefined || patch.size !== undefined)) {
      await this._periksaOrbit(id, patch.orbit ?? existing.orbit, patch.size ?? existing.size);
    }

    const perubahan = diff(existing, patch, {
      peta: { isActive: 'isActive', bodyHtml: 'bodyHtml', hasRing: 'hasRing' }
    });

    await this.menus.update(id, patch);
    // `items` dan `links` dikirim sebagai daftar utuh atau tidak dikirim sama
    // sekali. `undefined` berarti "jangan disentuh"; array kosong berarti
    // "kosongkan" — dua hal yang berbeda dan sering tertukar.
    if (input.items !== undefined) await this.menus.replaceItems(id, input.items);
    if (input.links !== undefined) await this.menus.replaceLinks(id, input.links);

    this.cache.invalidate(TAG.menu);
    await this.audit.record({
      actorId: actor?.id, actorEmail: actor?.email, action: 'update',
      entity: 'menu', entityId: id, changes: perubahan,
      // Butir dan tautan diganti utuh, jadi yang berguna dicatat bukan isinya
      // melainkan bahwa daftarnya disusun ulang dan jadi berapa banyak.
      meta: {
        ...(input.items !== undefined ? { butir: input.items.length } : {}),
        ...(input.links !== undefined ? { tautan: input.links.length } : {})
      }
    });
    return this.menus.findById(id);
  }

  async remove(id, actor) {
    const existing = await this.menus.findById(id);
    if (!existing) throw new NotFoundError('Menu');
    // `inti` adalah matahari — pusat scene, tujuan tombol "kembali", dan induk
    // seluruh orbit. Menghapusnya tidak mengosongkan satu menu, tapi merusak
    // navigasinya. Kalau memang tidak ingin ditampilkan, matikan is_active.
    if (id === 'inti') {
      throw new ValidationError({ id: 'Menu inti tidak bisa dihapus. Nonaktifkan saja kalau perlu disembunyikan.' });
    }
    await this.menus.remove(id);
    this.cache.invalidate(TAG.menu);
    await this.audit.record({
      actorId: actor?.id, actorEmail: actor?.email, action: 'delete', entity: 'menu', entityId: id
    });
  }

  async reorder(urutan, actor) {
    const semua = (await this.menus.listAll()).map((m) => m.id);
    const hilang = semua.filter((id) => !urutan.includes(id));
    if (hilang.length) {
      throw new ValidationError({ order: `Urutan harus memuat semua menu. Belum ada: ${hilang.join(', ')}.` });
    }
    await this.menus.reorder(urutan);
    this.cache.invalidate(TAG.menu);
    await this.audit.record({
      actorId: actor?.id, actorEmail: actor?.email, action: 'reorder', entity: 'menu', meta: { urutan }
    });
    return this.menus.listAll();
  }
}
