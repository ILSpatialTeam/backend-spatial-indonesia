// Logika domain murni: tanpa database, tanpa HTTP.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { diff, adaPerubahan } from '../../src/shared/diff.js';
import { slugify, uniqueSlug } from '../../src/shared/slug.js';
import { agendaState } from '../../src/domain/entities/agenda.js';
import { isFresh, toArticle } from '../../src/domain/entities/article.js';
import { MemoryCache, TAG } from '../../src/infrastructure/cache/memory-cache.js';

describe('diff untuk jejak audit', () => {
  test('hanya medan yang benar-benar berubah', () => {
    const d = diff({ title: 'A', lead: 'sama' }, { title: 'B', lead: 'sama' });
    assert.deepEqual(Object.keys(d), ['title']);
    assert.deepEqual(d.title, { dari: 'A', jadi: 'B' });
  });

  test('"11.00" dan 11 bukan perubahan', () => {
    // Kolom numeric Postgres kadang kembali sebagai string. Tanpa perbandingan
    // longgar, setiap penyimpanan menu akan mencatat orbit "berubah".
    assert.equal(adaPerubahan(diff({ orbit: '11.00' }, { orbit: 11 })), false);
  });

  test('medan yang tidak dikirim tidak diperiksa', () => {
    // `undefined` berarti "jangan disentuh", bukan "dikosongkan".
    assert.equal(adaPerubahan(diff({ a: 1, b: 2 }, { a: 1, b: undefined })), false);
  });

  test('kata sandi tercatat berubah tapi nilainya tidak pernah bocor', () => {
    const d = diff({ password: 'lama' }, { password: 'baru' });
    assert.deepEqual(d.password, { dari: '[disunting]', jadi: '[disunting]' });
  });

  test('nilai panjang dipotong beserta keterangan panjang aslinya', () => {
    const d = diff({ body: 'x'.repeat(500) }, { body: 'y'.repeat(500) });
    assert.ok(d.body.jadi.length < 200);
    assert.match(d.body.jadi, /500 karakter/);
  });

  test('pemetaan nama kolom database ke nama field', () => {
    const d = diff({ is_active: true }, { isActive: false }, { peta: { isActive: 'is_active' } });
    assert.deepEqual(d.isActive, { dari: true, jadi: false });
  });
});

describe('slug', () => {
  test('membuang diakritik dan tanda baca', () => {
    assert.equal(slugify('Café Déjà — Vu!'), 'cafe-deja-vu');
  });
  test('tidak pernah berakhir dengan tanda hubung', () => {
    assert.doesNotMatch(slugify('Judul dengan ekor —'), /-$/);
    assert.doesNotMatch(slugify('x'.repeat(78) + ' ekor', { max: 80 }), /-$/);
  });
  test('slug unik menambah angka, bukan menimpa', () => {
    const terpakai = new Set(['artikel', 'artikel-2']);
    assert.equal(uniqueSlug('Artikel', terpakai), 'artikel-3');
  });
  test('judul yang seluruhnya simbol tetap menghasilkan slug', () => {
    assert.equal(uniqueSlug('!!! ???', new Set()), 'artikel');
  });
});

describe('agendaState', () => {
  const acara = [
    { id: 'a', date: '2026-01-10', title: 'A' },
    { id: 'b', date: '2026-02-10', title: 'B' },
    { id: 'c', date: '2026-03-10', title: 'C' }
  ];
  const pada = (iso) => new Date(`${iso}T12:00:00Z`).getTime();

  test('memilih acara berikutnya dan sebelumnya', () => {
    const s = agendaState(acara, pada('2026-01-20'));
    assert.equal(s.next.id, 'b');
    assert.equal(s.prev.id, 'a');
  });

  test('kemajuan selalu di antara 0 dan 1', () => {
    for (const hari of ['2026-01-01', '2026-01-11', '2026-02-09', '2026-04-01']) {
      const s = agendaState(acara, pada(hari));
      assert.ok(s.progress >= 0 && s.progress <= 1, `progress di luar rentang pada ${hari}`);
    }
  });

  test('setelah acara terakhir lewat, tidak ada yang berikutnya', () => {
    const s = agendaState(acara, pada('2026-06-01'));
    assert.equal(s.next, null);
    assert.equal(s.progress, 1);
    assert.equal(s.days, 0);
  });

  test('daftar kosong tidak melempar', () => {
    assert.doesNotThrow(() => agendaState([], Date.now()));
  });

  test('hitungan hari tidak pernah negatif', () => {
    assert.ok(agendaState(acara, pada('2026-03-10')).days >= 0);
  });
});

describe('artikel', () => {
  test('"baru" dihitung dari tanggal terbit, bukan kolom', () => {
    const kemarin = new Date(Date.now() - 86400000).toISOString();
    const duaBulanLalu = new Date(Date.now() - 60 * 86400000).toISOString();
    assert.equal(isFresh(kemarin, 30), true);
    assert.equal(isFresh(duaBulanLalu, 30), false);
    assert.equal(isFresh(null, 30), false);
  });

  test('artikel Medium diarahkan keluar, isinya tidak ikut', () => {
    const a = toArticle({
      slug: 's', no: '1', category_id: 'teknis', title: 'T', lead: '', author: 'x',
      published_at: new Date().toISOString(), read_minutes: 3,
      source: 'medium', external_url: 'https://medium.com/x', body_html: 'harusnya diabaikan'
    }, { withBody: true });
    assert.equal(a.external, true);
    assert.equal(a.href, 'https://medium.com/x');
    assert.equal(a.bodyHtml, '', 'isi artikel medium tidak boleh ikut terkirim');
  });

  test('artikel internal diarahkan ke pembaca di situs', () => {
    const a = toArticle({
      slug: 'frame-budget-vr', no: '1', category_id: 'teknis', title: 'T', lead: '',
      author: 'x', published_at: new Date().toISOString(), read_minutes: 3,
      source: 'internal', body_html: '<p>isi</p>'
    }, { withBody: true });
    assert.equal(a.external, false);
    assert.equal(a.href, '/insight/frame-budget-vr');
    assert.equal(a.bodyHtml, '<p>isi</p>');
  });

  test('daftar tanpa isi tidak membawa bodyHtml sama sekali', () => {
    const a = toArticle({ slug: 's', source: 'internal', body_html: '<p>berat</p>' });
    assert.equal('bodyHtml' in a, false);
  });
});

describe('cache bertag', () => {
  test('wrap menghitung sekali, lalu melayani dari cache', async () => {
    const c = new MemoryCache();
    let panggil = 0;
    const hitung = async () => { panggil += 1; return 'hasil'; };
    await c.wrap('k', { tags: [TAG.menu] }, hitung);
    await c.wrap('k', { tags: [TAG.menu] }, hitung);
    assert.equal(panggil, 1);
  });

  test('pembatalan bertag mengenai semua entri dengan tag itu', async () => {
    const c = new MemoryCache();
    await c.wrap('a', { tags: [TAG.menu] }, async () => 1);
    await c.wrap('b', { tags: [TAG.menu, TAG.article] }, async () => 2);
    await c.wrap('c', { tags: [TAG.agenda] }, async () => 3);
    assert.equal(c.invalidate(TAG.menu), 2);
    assert.equal(c.get('c'), 3, 'tag lain tidak boleh ikut terbuang');
  });

  test('entri kedaluwarsa dianggap tidak ada', async () => {
    const c = new MemoryCache({ ttlMs: 1 });
    c.set('k', 'v');
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(c.get('k'), undefined);
  });

  test('membuang yang paling lama menganggur saat penuh', () => {
    const c = new MemoryCache({ max: 2 });
    c.set('a', 1); c.set('b', 2);
    c.get('a');            // 'a' jadi yang terakhir dipakai
    c.set('c', 3);
    assert.equal(c.get('b'), undefined, '"b" seharusnya yang dibuang');
    assert.equal(c.get('a'), 1);
  });
});
