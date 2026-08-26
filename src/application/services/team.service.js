import { stripTags } from '../../shared/html.js';
import { ValidationError } from '../../shared/errors.js';
import { TAG } from '../../infrastructure/cache/memory-cache.js';

export class TeamService {
  constructor({ team, audit, cache }) {
    this.team = team;
    this.audit = audit;
    this.cache = cache;
  }

  async listActive() {
    return this.cache.wrap('team:active', { tags: [TAG.team] }, () => this.team.listActive());
  }

  async listAll() {
    return this.team.listAll();
  }

  async get(id) {
    return this.team.findById(id);
  }

  async create(input, actor) {
    const data = this._sanitize(input);
    const row = await this.team.create(data);
    this.cache.invalidate(TAG.team);
    await this.audit.record({
      actorId: actor?.id, actorEmail: actor?.email,
      action: 'create', entity: 'team_member', entityId: row.id,
      meta: { name: row.name }
    });
    return row;
  }

  async update(id, input, actor) {
    const patch = {};
    if (input.name !== undefined) patch.name = stripTags(input.name);
    if (input.role !== undefined) patch.role = stripTags(input.role);
    if (input.photoUrl !== undefined) patch.photoUrl = input.photoUrl;
    if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;
    if (input.isActive !== undefined) patch.isActive = input.isActive;

    const row = await this.team.update(id, patch);
    this.cache.invalidate(TAG.team);
    await this.audit.record({
      actorId: actor?.id, actorEmail: actor?.email,
      action: 'update', entity: 'team_member', entityId: id,
      meta: { name: row.name }
    });
    return row;
  }

  async remove(id, actor) {
    await this.team.remove(id);
    this.cache.invalidate(TAG.team);
    await this.audit.record({
      actorId: actor?.id, actorEmail: actor?.email,
      action: 'delete', entity: 'team_member', entityId: id
    });
  }

  async reorder(urutan, actor) {
    await this.team.reorder(urutan);
    this.cache.invalidate(TAG.team);
    await this.audit.record({
      actorId: actor?.id, actorEmail: actor?.email,
      action: 'reorder', entity: 'team_member', entityId: null
    });
  }

  _sanitize(input) {
    const name = stripTags(input.name ?? '');
    const role = stripTags(input.role ?? '');
    const galat = {};
    if (name.length < 2) galat.name = 'Nama tidak boleh kosong.';
    if (role.length < 2) galat.role = 'Peran tidak boleh kosong.';
    if (Object.keys(galat).length) throw new ValidationError(galat);
    return {
      name,
      role,
      photoUrl: input.photoUrl ?? null,
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive ?? true
    };
  }
}
