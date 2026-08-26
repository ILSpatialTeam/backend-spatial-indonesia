import { stripTags } from '../../shared/html.js';
import { slugify } from '../../shared/slug.js';
import { ValidationError } from '../../shared/errors.js';
import { TAG } from '../../infrastructure/cache/memory-cache.js';

export class ProjectService {
  constructor({ projects, projectCategories, audit, cache }) {
    this.projects = projects;
    this.projectCategories = projectCategories;
    this.audit = audit;
    this.cache = cache;
  }

  // ── proyek ─────────────────────────────────────────────────────────────────

  async listActive() {
    return this.cache.wrap('projects:active', { tags: [TAG.project] }, () => this.projects.listActive());
  }

  async listAll(opsi) {
    return this.projects.listAll(opsi);
  }

  async get(id) {
    return this.projects.findById(id);
  }

  async create(input, actor) {
    const data = this._sanitize(input);
    const row = await this.projects.create(data);
    this.cache.invalidate(TAG.project);
    await this.audit.record({
      actorId: actor?.id, actorEmail: actor?.email,
      action: 'create', entity: 'project', entityId: row.id,
      meta: { title: row.title }
    });
    return row;
  }

  async update(id, input, actor) {
    const patch = {};
    if (input.title !== undefined) patch.title = stripTags(input.title);
    if (input.description !== undefined) patch.description = stripTags(input.description);
    if (input.memberName !== undefined) patch.memberName = stripTags(input.memberName);
    if (input.imageUrl !== undefined) patch.imageUrl = input.imageUrl;
    if (input.categoryId !== undefined) patch.categoryId = input.categoryId;
    if (input.type !== undefined) patch.type = stripTags(input.type);
    if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;
    if (input.isActive !== undefined) patch.isActive = input.isActive;

    const row = await this.projects.update(id, patch);
    this.cache.invalidate(TAG.project);
    await this.audit.record({
      actorId: actor?.id, actorEmail: actor?.email,
      action: 'update', entity: 'project', entityId: id,
      meta: { title: row.title }
    });
    return row;
  }

  async remove(id, actor) {
    await this.projects.remove(id);
    this.cache.invalidate(TAG.project);
    await this.audit.record({
      actorId: actor?.id, actorEmail: actor?.email,
      action: 'delete', entity: 'project', entityId: id
    });
  }

  async reorder(urutan, actor) {
    await this.projects.reorder(urutan);
    this.cache.invalidate(TAG.project);
    await this.audit.record({
      actorId: actor?.id, actorEmail: actor?.email,
      action: 'reorder', entity: 'project', entityId: null
    });
  }

  // ── kategori ───────────────────────────────────────────────────────────────

  async categoryList() {
    return this.projectCategories.listAll();
  }

  async categoryUpsert(input, actor) {
    const id = slugify(input.id || input.label);
    if (!id) throw new ValidationError({ id: 'Id kategori tidak boleh kosong.' });
    const row = await this.projectCategories.upsert({ id, label: input.label, sortOrder: input.sortOrder ?? 0 });
    this.cache.invalidate(TAG.project);
    await this.audit.record({
      actorId: actor?.id, actorEmail: actor?.email,
      action: 'upsert', entity: 'project_category', entityId: row.id
    });
    return row;
  }

  async categoryRemove(id, actor) {
    await this.projectCategories.remove(id);
    this.cache.invalidate(TAG.project);
    await this.audit.record({
      actorId: actor?.id, actorEmail: actor?.email,
      action: 'delete', entity: 'project_category', entityId: id
    });
  }

  _sanitize(input) {
    const title = stripTags(input.title ?? '');
    const memberName = stripTags(input.memberName ?? '');
    const galat = {};
    if (title.length < 2) galat.title = 'Judul tidak boleh kosong.';
    if (memberName.length < 2) galat.memberName = 'Nama anggota tidak boleh kosong.';
    if (Object.keys(galat).length) throw new ValidationError(galat);
    return {
      title,
      description: stripTags(input.description ?? ''),
      memberName,
      imageUrl: input.imageUrl ?? null,
      categoryId: input.categoryId ?? null,
      type: stripTags(input.type ?? ''),
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive ?? true
    };
  }
}
