import { toAdminArticle } from '../../domain/entities/article.js';
import { sanitizeArticleHtml, stripTags, readingMinutes, excerpt } from '../../shared/html.js';
import { uniqueSlug, slugify } from '../../shared/slug.js';
import { NotFoundError, ValidationError, ConflictError } from '../../shared/errors.js';
import { diff } from '../../shared/diff.js';
import { TAG } from '../../infrastructure/cache/memory-cache.js';

// Penulisan artikel dari dashboard.
//
// Dua aturan yang dijaga service ini, dan keduanya alasan kenapa lapisan ini
// ada alih-alih controller memanggil repositori langsung:
//
//   1. HTML dari editor selalu lewat sanitizeArticleHtml() sebelum menyentuh
//      database. Tidak ada jalan lain masuk.
//   2. Artikel `medium` tidak menyimpan isi, artikel `internal` tidak menyimpan
//      tautan luar. Membiarkan keduanya terisi berarti suatu hari ada yang
//      bertanya mana yang menang, dan jawabannya akan bergantung pada halaman
//      mana yang kebetulan membacanya.
export class ArticleAdminService {
  constructor({ articles, taxonomy, sparings, audit, cache }) {
    this.articles = articles;
    this.taxonomy = taxonomy;
    this.sparings = sparings;
    this.audit = audit;
    this.cache = cache;
  }

  async list(opsi) {
    const { rows, total } = await this.articles.listForAdmin(opsi);
    return { items: rows.map(toAdminArticle), total };
  }

  async byId(id) {
    const row = await this.articles.findById(id);
    if (!row) throw new NotFoundError('Artikel');
    return toAdminArticle(row);
  }

  // Normalisasi yang dipakai bersama oleh create dan update. Satu tempat,
  // supaya artikel yang dibuat dan artikel yang disunting tidak pernah tunduk
  // pada aturan yang berbeda.
  _normalkan(input, { existing = null } = {}) {
    const source = input.source ?? existing?.source ?? 'internal';
    const status = input.status ?? existing?.status ?? 'draft';

    const patch = {};
    if (input.title !== undefined) patch.title = stripTags(input.title);
    if (input.lead !== undefined) patch.lead = stripTags(input.lead);
    if (input.author !== undefined) patch.author = stripTags(input.author);
    if (input.categoryId !== undefined) patch.categoryId = input.categoryId;
    if (input.coverUrl !== undefined) patch.coverUrl = input.coverUrl || null;
    if (input.no !== undefined) patch.no = stripTags(input.no);
    patch.source = source;

    if (source === 'medium') {
      if (!input.externalUrl && !existing?.external_url) {
        throw new ValidationError({ externalUrl: 'Artikel Medium wajib punya tautan.' });
      }
      if (input.externalUrl !== undefined) patch.externalUrl = input.externalUrl;
      // Isi dikosongkan, bukan dibiarkan. Kalau seseorang mengubah artikel
      // internal jadi tautan Medium, draf lamanya tidak boleh diam-diam tetap
      // bisa diambil lewat API.
      patch.bodyHtml = '';
      patch.readMinutes = input.readMinutes ?? existing?.read_minutes ?? 3;
    } else {
      patch.externalUrl = null;
      if (input.bodyHtml !== undefined) {
        patch.bodyHtml = sanitizeArticleHtml(input.bodyHtml);
        // Lama baca dihitung dari isinya, bukan diketik penulis — angka yang
        // diketik tangan hampir selalu lupa diperbarui saat tulisannya tumbuh.
        patch.readMinutes = input.readMinutes ?? readingMinutes(patch.bodyHtml);
        // Lead kosong diisi dari paragraf pertama supaya kartu artikel di
        // orbit tidak pernah tampil tanpa keterangan.
        if (!patch.lead && !existing?.lead) patch.lead = excerpt(patch.bodyHtml);
      } else if (input.readMinutes !== undefined) {
        patch.readMinutes = input.readMinutes;
      }
    }

    if (input.status !== undefined) patch.status = status;

    // Tanggal terbit diisi otomatis saat pertama kali artikel diterbitkan, dan
    // tidak diubah lagi kalau sudah ada — menerbitkan ulang bukan menerbitkan
    // yang baru.
    if (status === 'published') {
      patch.publishedAt = input.publishedAt ?? existing?.published_at ?? new Date();
    } else if (input.publishedAt !== undefined) {
      patch.publishedAt = input.publishedAt;
    }

    return patch;
  }

  async _pastikanKategori(id) {
    if (!id) return;
    const daftar = await this.taxonomy.listCategories();
    if (!daftar.some((c) => c.id === id)) {
      throw new ValidationError({ categoryId: `Kategori "${id}" tidak ada.` });
    }
  }

  async create(input, actor) {
    await this._pastikanKategori(input.categoryId);
    const patch = this._normalkan(input);

    const terpakai = await this.articles.takenSlugs();
    const slug = input.slug ? slugify(input.slug) : uniqueSlug(patch.title, terpakai);
    if (terpakai.has(slug)) throw new ConflictError(`Slug "${slug}" sudah dipakai artikel lain.`);

    const row = await this.articles.create({
      ...patch,
      slug,
      no: patch.no || (await this.articles.nextNo()),
      lead: patch.lead ?? '',
      author: patch.author || 'Tim Spatial Indonesia',
      bodyHtml: patch.bodyHtml ?? '',
      readMinutes: patch.readMinutes ?? 1,
      status: patch.status ?? 'draft',
      createdBy: actor?.id ?? null
    });

    this.cache.invalidate(TAG.article);
    await this.audit.record({
      actorId: actor?.id, actorEmail: actor?.email, action: 'create',
      entity: 'article', entityId: row.id, meta: { slug: row.slug, status: row.status }
    });
    return toAdminArticle(row);
  }

  async update(id, input, actor) {
    const existing = await this.articles.findById(id);
    if (!existing) throw new NotFoundError('Artikel');
    if (input.categoryId) await this._pastikanKategori(input.categoryId);

    const patch = this._normalkan(input, { existing });
    if (input.slug !== undefined) {
      const slug = slugify(input.slug);
      const terpakai = await this.articles.takenSlugs();
      if (slug !== existing.slug && terpakai.has(slug)) {
        throw new ConflictError(`Slug "${slug}" sudah dipakai artikel lain.`);
      }
      patch.slug = slug;
    }

    // Diff dihitung SEBELUM update dijalankan, terhadap baris lama yang sudah
    // kita pegang. Menghitungnya setelah update berarti membandingkan baris
    // baru dengan dirinya sendiri.
    const perubahan = diff(existing, patch, {
      peta: {
        categoryId: 'category_id', coverUrl: 'cover_url', externalUrl: 'external_url',
        bodyHtml: 'body_html', readMinutes: 'read_minutes', publishedAt: 'published_at'
      }
    });

    const row = await this.articles.update(id, patch);
    this.cache.invalidate(TAG.article, TAG.sparing);
    await this.audit.record({
      actorId: actor?.id, actorEmail: actor?.email, action: 'update',
      entity: 'article', entityId: id, changes: perubahan, requestId: actor?.requestId,
      meta: { slug: row.slug, status: row.status }
    });
    return toAdminArticle(row);
  }

  async remove(id, actor) {
    const existing = await this.articles.findById(id);
    if (!existing) throw new NotFoundError('Artikel');
    await this.articles.remove(id);
    this.cache.invalidate(TAG.article, TAG.sparing);
    await this.audit.record({
      actorId: actor?.id, actorEmail: actor?.email, action: 'delete',
      entity: 'article', entityId: id, meta: { slug: existing.slug }
    });
  }

  // Pratinjau sanitasi: dashboard memakainya untuk memperlihatkan apa yang
  // sebenarnya akan tersimpan, sebelum tersimpan. Editor WYSIWYG apa pun bisa
  // menempelkan HTML dari Word atau dari halaman web, dan penulisnya berhak
  // tahu bagian mana yang akan hilang.
  preview(html) {
    const bersih = sanitizeArticleHtml(html);
    return { html: bersih, readMinutes: readingMinutes(bersih), excerpt: excerpt(bersih) };
  }
}
