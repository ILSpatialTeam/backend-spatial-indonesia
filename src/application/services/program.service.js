import { stripTags } from '../../shared/html.js';
import { ValidationError } from '../../shared/errors.js';
import { TAG } from '../../infrastructure/cache/memory-cache.js';

export class ProgramService {
  constructor({ programs, audit, cache }) {
    this.programs = programs;
    this.audit = audit;
    this.cache = cache;
  }

  async listActive() {
    return this.cache.wrap('programs:active', { tags: [TAG.program] }, () => this.programs.listActive());
  }

  async listAll() {
    return this.programs.listAll();
  }

  async get(id) {
    return this.programs.findById(id);
  }

  async create(input, actor) {
    const data = this._sanitize(input);
    const row = await this.programs.create(data);
    this.cache.invalidate(TAG.program);
    await this.audit.record({
      actorId: actor?.id, actorEmail: actor?.email,
      action: 'create', entity: 'program', entityId: row.id,
      meta: { title: row.title }
    });
    return row;
  }

  async update(id, input, actor) {
    const patch = {};
    if (input.title !== undefined) patch.title = stripTags(input.title);
    if (input.subtitle !== undefined) patch.subtitle = stripTags(input.subtitle);
    if (input.description !== undefined) patch.description = stripTags(input.description);
    if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;
    if (input.isActive !== undefined) patch.isActive = input.isActive;

    const row = await this.programs.update(id, patch);
    this.cache.invalidate(TAG.program);
    await this.audit.record({
      actorId: actor?.id, actorEmail: actor?.email,
      action: 'update', entity: 'program', entityId: id,
      meta: { title: row.title }
    });
    return row;
  }

  async remove(id, actor) {
    await this.programs.remove(id);
    this.cache.invalidate(TAG.program);
    await this.audit.record({
      actorId: actor?.id, actorEmail: actor?.email,
      action: 'delete', entity: 'program', entityId: id
    });
  }

  async reorder(urutan, actor) {
    await this.programs.reorder(urutan);
    this.cache.invalidate(TAG.program);
    await this.audit.record({
      actorId: actor?.id, actorEmail: actor?.email,
      action: 'reorder', entity: 'program', entityId: null
    });
  }

  _sanitize(input) {
    const title = stripTags(input.title ?? '');
    const galat = {};
    if (title.length < 2) galat.title = 'Judul tidak boleh kosong.';
    if (Object.keys(galat).length) throw new ValidationError(galat);
    return {
      title,
      subtitle: stripTags(input.subtitle ?? ''),
      description: stripTags(input.description ?? ''),
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive ?? true
    };
  }
}
