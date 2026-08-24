import { toAgendaEvent } from '../../domain/entities/agenda.js';
import { stripTags } from '../../shared/html.js';
import { slugify } from '../../shared/slug.js';
import { ValidationError } from '../../shared/errors.js';
import { TAG } from '../../infrastructure/cache/memory-cache.js';

// Agenda, moderasi sparing, pendaftaran Gabung, taksonomi, dan pengaturan.
//
// Dikumpulkan dalam satu service karena semuanya adalah pekerjaan kurasi yang
// sama bentuknya: daftar, ubah status, hapus, batalkan cache. Memecahnya jadi
// lima kelas berisi tiga method masing-masing akan menambah berkas tanpa
// menambah kejelasan.
export class CurationService {
  constructor({ agenda, sparings, submissions, taxonomy, settings, audit, cache }) {
    this.agenda = agenda;
    this.sparings = sparings;
    this.submissions = submissions;
    this.taxonomy = taxonomy;
    this.settings = settings;
    this.audit = audit;
    this.cache = cache;
  }

  _catat(actor, action, entity, entityId, meta) {
    return this.audit.record({
      actorId: actor?.id, actorEmail: actor?.email, action, entity, entityId, meta
    });
  }

  // ── agenda ────────────────────────────────────────────────────────────────
  async agendaList() {
    const rows = await this.agenda.listAll();
    return rows.map((r) => toAgendaEvent(r));
  }

  async agendaCreate(input, actor) {
    const id = slugify(input.id || input.title);
    if (!id) throw new ValidationError({ id: 'Id agenda tidak boleh kosong.' });
    const row = await this.agenda.create({
      ...input,
      id,
      kind: String(input.kind).toUpperCase(),
      title: stripTags(input.title),
      place: stripTags(input.place ?? ''),
      note: stripTags(input.note ?? '')
    });
    this.cache.invalidate(TAG.agenda);
    await this._catat(actor, 'create', 'agenda', id, { title: row.title });
    return toAgendaEvent(row);
  }

  async agendaUpdate(id, input, actor) {
    const patch = { ...input };
    for (const k of ['title', 'place', 'note']) if (patch[k] !== undefined) patch[k] = stripTags(patch[k]);
    if (patch.kind !== undefined) patch.kind = String(patch.kind).toUpperCase();
    const row = await this.agenda.update(id, patch);
    this.cache.invalidate(TAG.agenda);
    await this._catat(actor, 'update', 'agenda', id, { title: row.title });
    return toAgendaEvent(row);
  }

  async agendaRemove(id, actor) {
    await this.agenda.remove(id);
    this.cache.invalidate(TAG.agenda);
    await this._catat(actor, 'delete', 'agenda', id);
  }

  // ── moderasi sparing ──────────────────────────────────────────────────────
  async sparingList(opsi) {
    const { rows, total } = await this.sparings.listForModeration(opsi);
    return {
      items: rows.map((s) => ({
        id: s.id,
        articleSlug: s.article_slug,
        articleTitle: s.article_title,
        freq: s.frequency_id,
        name: s.author_name,
        text: s.body,
        boost: s.boost,
        status: s.status,
        createdAt: s.created_at
      })),
      total
    };
  }

  async sparingModerate(id, status, actor) {
    const hasil = await this.sparings.setStatus(id, status);
    this.cache.invalidate(TAG.sparing);
    await this._catat(actor, `sparing_${status}`, 'sparing', id);
    return hasil;
  }

  async sparingRemove(id, actor) {
    await this.sparings.remove(id);
    this.cache.invalidate(TAG.sparing);
    await this._catat(actor, 'delete', 'sparing', id);
  }

  // ── pendaftaran Gabung ────────────────────────────────────────────────────
  async submissionList(opsi) {
    const { rows, total } = await this.submissions.list(opsi);
    return { items: rows, total };
  }

  async submissionSetStatus(id, status, actor) {
    const row = await this.submissions.setStatus(id, status, actor?.id ?? null);
    await this._catat(actor, `submission_${status}`, 'join_submission', id);
    return row;
  }

  async submissionRemove(id, actor) {
    await this.submissions.remove(id);
    await this._catat(actor, 'delete', 'join_submission', id);
  }

  // ── taksonomi ─────────────────────────────────────────────────────────────
  // Namanya bukan `taxonomy()` karena konstruktor sudah memasang properti
  // `this.taxonomy` (repositorinya), dan properti instans menutupi method
  // prototipe dengan nama yang sama — methodnya tidak akan pernah terpanggil.
  async taxonomyAll() {
    const [categories, frequencies] = await Promise.all([
      this.taxonomy.listCategories(),
      this.taxonomy.listFrequencies()
    ]);
    return { categories, frequencies };
  }

  async categoryUpsert(input, actor) {
    const row = await this.taxonomy.upsertCategory({ ...input, id: slugify(input.id || input.label) });
    this.cache.invalidate(TAG.taxonomy, TAG.article);
    await this._catat(actor, 'upsert', 'article_category', row.id);
    return row;
  }

  async categoryRemove(id, actor) {
    await this.taxonomy.removeCategory(id);
    this.cache.invalidate(TAG.taxonomy, TAG.article);
    await this._catat(actor, 'delete', 'article_category', id);
  }

  async frequencyUpsert(input, actor) {
    const row = await this.taxonomy.upsertFrequency({ ...input, id: slugify(input.id || input.label) });
    this.cache.invalidate(TAG.taxonomy, TAG.sparing);
    await this._catat(actor, 'upsert', 'sparing_frequency', row.id);
    return row;
  }

  // ── pengaturan ────────────────────────────────────────────────────────────
  async settingsAll() {
    return this.settings.all();
  }

  async settingSet(key, value, actor) {
    if (!/^[a-z][a-z0-9_.]{1,60}$/.test(key)) {
      throw new ValidationError({ key: 'Kunci pengaturan hanya boleh huruf kecil, angka, titik, dan garis bawah.' });
    }
    const row = await this.settings.set(key, value);
    this.cache.invalidate(TAG.settings);
    await this._catat(actor, 'update', 'site_setting', key, { value });
    return row;
  }

  // ── jejak audit ───────────────────────────────────────────────────────────
  async auditList(opsi) {
    const { rows, total } = await this.audit.list(opsi);
    return { items: rows, total };
  }

  // ── statistik ringkas untuk beranda dashboard ─────────────────────────────
  async dashboard() {
    const [sparingMenunggu, pendaftaranBaru, acara, kategori] = await Promise.all([
      this.sparings.listForModeration({ status: 'pending', limit: 1 }),
      this.submissions.list({ status: 'new', limit: 1 }),
      this.agenda.listPublished(),
      this.taxonomy.listCategories()
    ]);
    return {
      sparingPending: sparingMenunggu.total,
      submissionsNew: pendaftaranBaru.total,
      agendaCount: acara.length,
      categoryCount: kategori.length
    };
  }
}
