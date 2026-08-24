import { ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors.js';
import { stripTags } from '../../shared/html.js';

// Pengelolaan akun admin. Hanya peran `owner` yang boleh menyentuhnya —
// pemeriksaan itu ada di rute, tapi dua aturan di bawah ada di sini karena
// keduanya aturan bisnis, bukan aturan HTTP.
export class UserAdminService {
  constructor({ users, sessions, audit, hasher }) {
    this.users = users;
    this.sessions = sessions;
    this.audit = audit;
    this.hasher = hasher;
  }

  list() {
    return this.users.list();
  }

  async create({ email, name, password, role }, actor) {
    const user = await this.users.create({
      email: String(email).trim().toLowerCase(),
      name: stripTags(name),
      passwordHash: await this.hasher.hash(password),
      role
    });
    await this.audit.record({
      actorId: actor?.id, actorEmail: actor?.email, action: 'create',
      entity: 'admin_user', entityId: user.id, meta: { email: user.email, role: user.role }
    });
    return user;
  }

  async update(id, patch, actor) {
    const target = await this.users.findById(id);
    if (!target) throw new NotFoundError('Akun admin');

    // Owner terakhir tidak boleh menurunkan perannya sendiri atau menonaktifkan
    // dirinya. Kalau lolos, tidak ada lagi yang bisa mengelola akun — dan
    // memperbaikinya menuntut akses langsung ke database.
    const menurunkan = (patch.role && patch.role !== 'owner') || patch.isActive === false;
    if (target.role === 'owner' && menurunkan) {
      const semua = await this.users.list();
      const ownerAktif = semua.filter((u) => u.role === 'owner' && u.is_active);
      if (ownerAktif.length <= 1) {
        throw new ValidationError({ role: 'Ini satu-satunya owner yang aktif. Angkat owner lain dulu.' });
      }
    }

    const bersih = { ...patch };
    if (bersih.name !== undefined) bersih.name = stripTags(bersih.name);
    if (bersih.email !== undefined) bersih.email = String(bersih.email).trim().toLowerCase();
    if (bersih.password) {
      bersih.passwordHash = await this.hasher.hash(bersih.password);
      delete bersih.password;
    }

    const user = await this.users.update(id, bersih);
    // Akun yang dinonaktifkan atau diganti kata sandinya kehilangan seluruh
    // sesinya seketika. Tanpa ini, "nonaktifkan akun" baru berlaku setelah
    // access token yang sedang berjalan kedaluwarsa.
    if (bersih.isActive === false || bersih.passwordHash) {
      await this.sessions.revokeAllForUser(id);
    }
    await this.audit.record({
      actorId: actor?.id, actorEmail: actor?.email, action: 'update',
      entity: 'admin_user', entityId: id, meta: { email: user.email, role: user.role }
    });
    return user;
  }

  async remove(id, actor) {
    if (id === actor?.id) throw new ForbiddenError('Tidak bisa menghapus akun sendiri.');
    const target = await this.users.findById(id);
    if (!target) throw new NotFoundError('Akun admin');
    if (target.role === 'owner') {
      const semua = await this.users.list();
      if (semua.filter((u) => u.role === 'owner').length <= 1) {
        throw new ValidationError({ id: 'Ini owner terakhir. Angkat owner lain sebelum menghapusnya.' });
      }
    }
    await this.sessions.revokeAllForUser(id);
    await this.users.remove(id);
    await this.audit.record({
      actorId: actor?.id, actorEmail: actor?.email, action: 'delete',
      entity: 'admin_user', entityId: id, meta: { email: target.email }
    });
  }
}
