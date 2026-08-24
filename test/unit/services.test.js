// Aturan bisnis di lapisan application, diuji dengan repositori palsu.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { MenuAdminService } from '../../src/application/services/menu-admin.service.js';
import { ArticleAdminService } from '../../src/application/services/article-admin.service.js';
import { ParticipationService } from '../../src/application/services/participation.service.js';
import { UserAdminService } from '../../src/application/services/user-admin.service.js';
import {
  cachePalsu, auditPalsu, menuRepoPalsu, artikelRepoPalsu,
  taksonomiPalsu, sparingRepoPalsu, pengaturanPalsu
} from '../helpers/fakes.js';

const PLANET = (id, orbit, size) => ({
  id, kind: 'planet', orbit, size, isActive: true, label: id, no: '01', tag: id,
  accent: '#9E94F9', title: 't', lead: 'l', items: [], links: [],
  speed: 0.05, phase: 1, tilt: 0, skin: 's', hasRing: false
});

describe('MenuAdminService — orbit', () => {
  const buat = () => new MenuAdminService({
    menus: menuRepoPalsu([PLANET('a', 11, 0.7), PLANET('b', 20, 1.0), PLANET('c', 35, 1.3)]),
    audit: auditPalsu(), cache: cachePalsu()
  });

  test('menolak orbit yang bertabrakan dengan planet lain', async () => {
    await assert.rejects(
      () => buat().update('a', { orbit: 20.5 }, null),
      (err) => {
        assert.equal(err.code, 'VALIDATION_ERROR');
        assert.match(err.details.orbit, /Terlalu dekat/);
        return true;
      }
    );
  });

  test('menerima orbit yang cukup berjarak', async () => {
    const s = buat();
    await assert.doesNotReject(() => s.update('a', { orbit: 15 }, null));
  });

  test('jarak minimum ikut memperhitungkan ukuran kedua planet', async () => {
    // b(20, size 1.0) dan c(35, size 1.3): minimum = 1.0 + 1.3 + 1.5 = 3.8
    const s = buat();
    await assert.rejects(() => s.update('b', { orbit: 32 }, null));   // jarak 3
    await assert.doesNotReject(() => s.update('b', { orbit: 31 }, null)); // jarak 4
  });

  test('planet tidak dibandingkan dengan dirinya sendiri', async () => {
    await assert.doesNotReject(() => buat().update('a', { orbit: 11 }, null));
  });

  test('menu inti tidak bisa dihapus', async () => {
    const s = new MenuAdminService({
      menus: menuRepoPalsu([{ id: 'inti', kind: 'core', isActive: true, items: [], links: [] }]),
      audit: auditPalsu(), cache: cachePalsu()
    });
    await assert.rejects(() => s.remove('inti', null), (err) => {
      assert.match(err.details.id, /tidak bisa dihapus/);
      return true;
    });
  });

  test('urutan parsial ditolak', async () => {
    await assert.rejects(() => buat().reorder(['a', 'b'], null), (err) => {
      assert.match(err.details.order, /harus memuat semua menu/);
      return true;
    });
  });
});

describe('ArticleAdminService — aturan sumber', () => {
  const buat = (rows = []) => new ArticleAdminService({
    articles: artikelRepoPalsu(rows), taxonomy: taksonomiPalsu(),
    sparings: sparingRepoPalsu(), audit: auditPalsu(), cache: cachePalsu()
  });

  test('artikel Medium wajib punya tautan', async () => {
    await assert.rejects(
      () => buat().create({ title: 'T', categoryId: 'teknis', source: 'medium' }, null),
      (err) => { assert.match(err.details.externalUrl, /wajib punya tautan/); return true; }
    );
  });

  test('artikel Medium tidak menyimpan isi, walau dikirim', async () => {
    const a = await buat().create({
      title: 'T', categoryId: 'teknis', source: 'medium',
      externalUrl: 'https://medium.com/x', bodyHtml: '<p>harus dibuang</p>'
    }, null);
    assert.equal(a.bodyHtml, '');
  });

  test('beralih dari internal ke Medium mengosongkan isi lama', async () => {
    const s = buat([{ id: 'id-1', slug: 's', source: 'internal', body_html: '<p>draf lama</p>', lead: 'x', status: 'draft' }]);
    const a = await s.update('id-1', { source: 'medium', externalUrl: 'https://medium.com/y' }, null);
    assert.equal(a.bodyHtml, '');
  });

  test('HTML disanitasi sebelum disimpan', async () => {
    const a = await buat().create({
      title: 'T', categoryId: 'teknis',
      bodyHtml: '<p>ok</p><script>alert(1)</script>'
    }, null);
    assert.doesNotMatch(a.bodyHtml, /<script/i);
  });

  test('lama baca dihitung dari isi, bukan diketik', async () => {
    const a = await buat().create({
      title: 'T', categoryId: 'teknis', bodyHtml: `<p>${'kata '.repeat(600)}</p>`
    }, null);
    assert.equal(a.readMinutes, 3);
  });

  test('kategori yang tidak ada ditolak', async () => {
    await assert.rejects(
      () => buat().create({ title: 'T', categoryId: 'tidak-ada' }, null),
      (err) => { assert.match(err.details.categoryId, /tidak ada/); return true; }
    );
  });

  test('slug bentrok ditolak, bukan menimpa', async () => {
    const s = buat([{ id: 'id-1', slug: 'judul', source: 'internal' }]);
    await assert.rejects(
      () => s.create({ title: 'X', categoryId: 'teknis', slug: 'judul' }, null),
      /sudah dipakai/          // ConflictError memakai message, bukan details
    );
  });

  test('perubahan tercatat di jejak audit dengan nilai lama dan baru', async () => {
    const audit = auditPalsu();
    const s = new ArticleAdminService({
      articles: artikelRepoPalsu([{ id: 'id-1', slug: 's', title: 'Lama', source: 'internal', body_html: '', lead: '', status: 'draft' }]),
      taxonomy: taksonomiPalsu(), sparings: sparingRepoPalsu(), audit, cache: cachePalsu()
    });
    await s.update('id-1', { title: 'Baru' }, { id: 'u1', email: 'a@b.c' });
    const rec = audit.catatan.find((c) => c.action === 'update');
    assert.deepEqual(rec.changes.title, { dari: 'Lama', jadi: 'Baru' });
  });
});

describe('ParticipationService — kiriman publik', () => {
  const buat = (opsi = {}) => {
    const sparings = sparingRepoPalsu();
    Object.assign(sparings, opsi.sparings ?? {});
    return {
      sparings,
      service: new ParticipationService({
        articles: artikelRepoPalsu([{ id: 'a1', slug: 'artikel', status: 'published' }]),
        sparings,
        presence: { async record(path) { return { id: 1, path }; } },
        submissions: { async create(d) { return d; } },
        settings: pengaturanPalsu({ 'insight.sparing_moderation': true }),
        cache: cachePalsu()
      })
    };
  };

  test('tag dibuang dari nama dan isi', async () => {
    const { service } = buat();
    const r = await service.submitSparing({
      slug: 'artikel', frequencyId: 'sinyal',
      authorName: 'Budi <b>S</b>', text: '<script>x()</script> Isi sparing yang cukup panjang.'
    });
    assert.equal(r.sparing.name, 'Budi S');
    assert.doesNotMatch(r.sparing.text, /script/i);
  });

  test('nama yang jadi kosong setelah sanitasi ditolak dengan pesan jelas', async () => {
    // Regresi T-2: dulu lolos Zod lalu ditolak CHECK constraint database.
    const { service } = buat();
    await assert.rejects(
      () => service.submitSparing({
        slug: 'artikel', frequencyId: 'sinyal',
        authorName: '<img src=x onerror=alert(1)>', text: 'Isi yang cukup panjang untuk lolos.'
      }),
      (err) => {
        assert.equal(err.code, 'VALIDATION_ERROR');
        assert.match(err.details.authorName, /kosong setelah tag/);
        return true;
      }
    );
  });

  test('batas per sumber ditegakkan dari database', async () => {
    const { service } = buat({ sparings: { jumlahTerkini: 5 } });
    await assert.rejects(
      () => service.submitSparing({
        slug: 'artikel', frequencyId: 'sinyal', authorName: 'Budi',
        text: 'Isi yang cukup panjang untuk lolos.', ipHash: 'abc'
      }),
      (err) => { assert.equal(err.code, 'RATE_LIMITED'); return true; }
    );
  });

  test('moderasi menyala berarti sparing belum tampil', async () => {
    const { service } = buat();
    const r = await service.submitSparing({
      slug: 'artikel', frequencyId: 'sinyal', authorName: 'Budi',
      text: 'Isi yang cukup panjang untuk lolos.'
    });
    assert.equal(r.moderated, true);
  });

  test('jejak kunjungan menyaring id planet yang tidak dikenali', async () => {
    const { service } = buat();
    const r = await service.recordPresence({
      path: ['inti', 'planet-karangan', 'karya'],
      menuIds: new Set(['inti', 'karya'])
    });
    assert.deepEqual(r.path, ['inti', 'karya']);
  });

  test('pendaftaran ganda dijawab identik dengan yang baru', async () => {
    const { ConflictError } = await import('../../src/shared/errors.js');
    const service = new ParticipationService({
      articles: artikelRepoPalsu(), sparings: sparingRepoPalsu(),
      presence: {}, settings: pengaturanPalsu(), cache: cachePalsu(),
      submissions: { async create() { throw new ConflictError('sudah ada'); } }
    });
    const r = await service.submitJoin({ name: 'Budi', email: 'a@b.co' });
    assert.equal(r.ok, true);
    assert.equal('id' in r, false, 'id tidak boleh dikembalikan — itu membedakan dua jalur');
  });
});

describe('UserAdminService — owner terakhir', () => {
  const buatUsers = (daftar) => ({
    data: daftar,
    async list() { return this.data; },
    async findById(id) { return this.data.find((u) => u.id === id) ?? null; },
    async update(id, patch) { const u = this.data.find((x) => x.id === id); Object.assign(u, patch); return u; },
    async remove(id) { this.data = this.data.filter((u) => u.id !== id); },
    async create(d) { return d; }
  });
  const sesi = { async revokeAllForUser() { return 0; } };
  const hasher = { async hash() { return 'hash'; }, async verify() { return true; } };

  test('owner terakhir tidak bisa diturunkan', async () => {
    const s = new UserAdminService({
      users: buatUsers([{ id: '1', role: 'owner', is_active: true, email: 'o@x.c' }]),
      sessions: sesi, audit: auditPalsu(), hasher
    });
    await assert.rejects(() => s.update('1', { role: 'editor' }, null), (err) => {
      assert.match(err.details.role, /satu-satunya owner/);
      return true;
    });
  });

  test('owner terakhir tidak bisa dinonaktifkan', async () => {
    const s = new UserAdminService({
      users: buatUsers([{ id: '1', role: 'owner', is_active: true, email: 'o@x.c' }]),
      sessions: sesi, audit: auditPalsu(), hasher
    });
    await assert.rejects(() => s.update('1', { isActive: false }, null), (err) => {
      assert.match(err.details.role, /satu-satunya owner/);
      return true;
    });
  });

  test('owner boleh diturunkan kalau masih ada owner aktif lain', async () => {
    const s = new UserAdminService({
      users: buatUsers([
        { id: '1', role: 'owner', is_active: true, email: 'a@x.c' },
        { id: '2', role: 'owner', is_active: true, email: 'b@x.c' }
      ]),
      sessions: sesi, audit: auditPalsu(), hasher
    });
    await assert.doesNotReject(() => s.update('1', { role: 'editor' }, null));
  });

  test('tidak bisa menghapus akun sendiri', async () => {
    const s = new UserAdminService({
      users: buatUsers([{ id: '1', role: 'owner', is_active: true, email: 'a@x.c' }]),
      sessions: sesi, audit: auditPalsu(), hasher
    });
    await assert.rejects(() => s.remove('1', { id: '1' }), /akun sendiri/);  // ForbiddenError
  });

  test('mengganti kata sandi mencabut semua sesi', async () => {
    let dicabut = 0;
    const s = new UserAdminService({
      users: buatUsers([{ id: '1', role: 'editor', is_active: true, email: 'e@x.c' }]),
      sessions: { async revokeAllForUser() { dicabut += 1; return 1; } },
      audit: auditPalsu(), hasher
    });
    await s.update('1', { password: 'KataSandiPanjang1' }, null);
    assert.equal(dicabut, 1);
  });
});
