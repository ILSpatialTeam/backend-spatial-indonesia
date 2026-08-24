// Tes integrasi: aplikasi sungguhan, database sungguhan, HTTP sungguhan.
//
// Yang diuji di sini adalah hal-hal yang tidak bisa dibuktikan tanpa merangkai
// semuanya — apakah middleware benar-benar terpasang di rute yang benar,
// apakah CHECK constraint database sejalan dengan validasi aplikasi, dan
// apakah sesi berperilaku seperti yang dijanjikan saat token berpindah tangan.
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  siapkanDatabase, bersihkan, isiDataDasar, buatAdmin, nyalakanServer, buatKlien
} from '../helpers/server.js';

const SANDI = 'KataSandiUjiPanjang1';
let srv;

before(async () => {
  await siapkanDatabase();
  srv = await nyalakanServer();
});

after(async () => { await srv?.tutup(); });

beforeEach(async () => {
  await bersihkan();
  await isiDataDasar();
});

const masuk = async (email = 'owner@uji.test', password = SANDI, role = 'owner') => {
  await buatAdmin({ email, password, role });
  const k = buatKlien(srv.base);
  const r = await k.kirim('/api/v1/auth/login', { method: 'POST', json: { email, password } });
  return { klien: k, token: r.data.accessToken, csrf: k.ambilKuki('si_csrf'), respons: r };
};

// ── autentikasi ─────────────────────────────────────────────────────────────
describe('autentikasi', () => {
  test('kredensial salah ditolak 401 dengan pesan yang tidak membedakan', async () => {
    await buatAdmin({ email: 'a@uji.test', password: SANDI });
    const k = buatKlien(srv.base);
    const adaTapiSalah = await k.kirim('/api/v1/auth/login', { method: 'POST', json: { email: 'a@uji.test', password: 'salah' } });
    const tidakAda = await k.kirim('/api/v1/auth/login', { method: 'POST', json: { email: 'z@uji.test', password: 'salah' } });
    assert.equal(adaTapiSalah.status, 401);
    assert.equal(tidakAda.status, 401);
    assert.equal(adaTapiSalah.data.error.message, tidakAda.data.error.message,
      'pesan berbeda akan memberi tahu email mana yang terdaftar');
  });

  test('cookie sesi httpOnly, SameSite=Strict, dan refresh dibatasi path-nya', async () => {
    const { respons } = await masuk();
    const kuki = respons.headers.getSetCookie();
    const akses = kuki.find((c) => c.startsWith('si_access'));
    const refresh = kuki.find((c) => c.startsWith('si_refresh'));
    assert.match(akses, /HttpOnly/i);
    assert.match(akses, /SameSite=Strict/i);
    assert.match(refresh, /HttpOnly/i);
    assert.match(refresh, /Path=\/api\/v1\/auth/);
  });

  test('token yang ditandatangani alg=none ditolak', async () => {
    const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const palsu = `${b({ alg: 'none', typ: 'JWT' })}.${b({
      sub: 'x', email: 'a@b.c', role: 'owner', sid: 'y',
      iss: 'spatial-indonesia', aud: 'admin-dashboard'
    })}.`;
    const k = buatKlien(srv.base);
    const r = await k.kirim('/api/v1/admin/articles', { headers: { authorization: `Bearer ${palsu}` } });
    assert.equal(r.status, 401);
  });

  test('refresh token yang sudah dirotasi, kalau dipakai lagi, mencabut seluruh keluarga', async () => {
    const { klien, csrf } = await masuk();
    const kukiAwal = new Map(klien.kuki);

    const rotasi = await klien.kirim('/api/v1/auth/refresh', { method: 'POST', headers: { 'x-csrf-token': csrf } });
    assert.equal(rotasi.status, 200, 'rotasi pertama harus berhasil');

    // Pencuri memakai salinan token yang sudah dirotasi.
    const pencuri = buatKlien(srv.base);
    for (const [k2, v] of kukiAwal) pencuri.kuki.set(k2, v);
    const replay = await pencuri.kirim('/api/v1/auth/refresh', { method: 'POST', headers: { 'x-csrf-token': csrf } });
    assert.equal(replay.status, 401);

    // Pemilik aslinya ikut terlempar: seluruh keluarga sesi dicabut.
    const csrfBaru = klien.ambilKuki('si_csrf');
    const setelah = await klien.kirim('/api/v1/auth/refresh', { method: 'POST', headers: { 'x-csrf-token': csrfBaru } });
    assert.equal(setelah.status, 401, 'sesi turunan seharusnya ikut dicabut');
  });

  test('replay tercatat sebagai kejadian kritis', async () => {
    const { klien, csrf } = await masuk();
    const kukiAwal = new Map(klien.kuki);
    await klien.kirim('/api/v1/auth/refresh', { method: 'POST', headers: { 'x-csrf-token': csrf } });
    const pencuri = buatKlien(srv.base);
    for (const [k2, v] of kukiAwal) pencuri.kuki.set(k2, v);
    await pencuri.kirim('/api/v1/auth/refresh', { method: 'POST', headers: { 'x-csrf-token': csrf } });

    const { token } = await masuk('owner2@uji.test', SANDI);
    // Pencatatan tidak ditunggu pemanggilnya; beri waktu sekejap.
    await new Promise((r) => setTimeout(r, 200));
    const ev = await buatKlien(srv.base).kirim('/api/v1/admin/monitor/events?severity=critical', {
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(ev.status, 200);
    assert.ok(ev.data.items.some((e) => e.kind === 'session_revoked'), 'tidak ada catatan session_revoked');
  });
});

// ── otorisasi ───────────────────────────────────────────────────────────────
describe('otorisasi', () => {
  test('tanpa sesi, seluruh rute admin tertutup', async () => {
    const k = buatKlien(srv.base);
    for (const jalur of ['/api/v1/admin/articles', '/api/v1/admin/menus', '/api/v1/admin/users', '/api/v1/admin/monitor']) {
      assert.equal((await k.kirim(jalur)).status, 401, `${jalur} tidak terlindungi`);
    }
  });

  test('editor tidak boleh menyentuh akun, pemantauan, atau cache', async () => {
    const { token } = await masuk('editor@uji.test', SANDI, 'editor');
    const k = buatKlien(srv.base);
    const h = { authorization: `Bearer ${token}` };
    for (const jalur of ['/api/v1/admin/users', '/api/v1/admin/monitor', '/api/v1/admin/monitor/database']) {
      assert.equal((await k.kirim(jalur, { headers: h })).status, 403, `${jalur} bocor ke editor`);
    }
    assert.equal((await k.kirim('/api/v1/admin/articles', { headers: h })).status, 200,
      'editor tetap harus bisa mengelola artikel');
  });

  test('tulisan lewat cookie tanpa token CSRF ditolak', async () => {
    const { klien } = await masuk();
    const r = await klien.kirim('/api/v1/admin/articles', {
      method: 'POST', json: { title: 'Tanpa CSRF', categoryId: 'teknis' }
    });
    assert.equal(r.status, 403);
  });

  test('tulisan lewat cookie dengan token CSRF diterima', async () => {
    const { klien, csrf } = await masuk();
    const r = await klien.kirim('/api/v1/admin/articles', {
      method: 'POST', headers: { 'x-csrf-token': csrf },
      json: { title: 'Dengan CSRF', categoryId: 'teknis' }
    });
    assert.equal(r.status, 201);
  });

  test('Bearer tidak butuh CSRF — ia tidak bisa jadi korban CSRF', async () => {
    const { token } = await masuk();
    const r = await buatKlien(srv.base).kirim('/api/v1/admin/articles', {
      method: 'POST', headers: { authorization: `Bearer ${token}` },
      json: { title: 'Lewat Bearer', categoryId: 'teknis' }
    });
    assert.equal(r.status, 201);
  });
});

// ── CORS ────────────────────────────────────────────────────────────────────
describe('CORS', () => {
  test('origin dalam daftar putih diterima, origin asing ditolak', async () => {
    const k = buatKlien(srv.base);
    assert.equal((await k.kirim('/api/v1/bootstrap', { headers: { origin: 'http://localhost:8899' } })).status, 200);
    assert.equal((await k.kirim('/api/v1/bootstrap', { headers: { origin: 'https://jahat.example' } })).status, 403);
  });

  test('origin milik server sendiri selalu diterima', async () => {
    // Skrip type="module" membawa header Origin walau same-origin. Tanpa ini,
    // dashboard menolak memuat modulnya sendiri.
    const k = buatKlien(srv.base);
    const r = await k.kirim('/api/v1/bootstrap', { headers: { origin: 'http://localhost:4000' } });
    assert.equal(r.status, 200);
  });

  test('If-None-Match diizinkan di preflight', async () => {
    // Kalau tidak, preflight lolos tapi permintaan sebenarnya dibatalkan
    // browser tanpa satu pun galat di konsol.
    const k = buatKlien(srv.base);
    const r = await k.kirim('/api/v1/bootstrap', {
      method: 'OPTIONS',
      headers: {
        origin: 'http://localhost:8899',
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'if-none-match'
      }
    });
    assert.equal(r.status, 204);
    assert.match(r.headers.get('access-control-allow-headers') ?? '', /If-None-Match/i);
  });
});

// ── kiriman publik ──────────────────────────────────────────────────────────
describe('kiriman publik', () => {
  test('formulir Gabung tidak membocorkan email yang sudah terdaftar', async () => {
    const k = buatKlien(srv.base);
    const isi = { name: 'Budi Santoso', email: 'budi@uji.test' };
    const pertama = await k.kirim('/api/v1/join', { method: 'POST', json: isi });
    const kedua = await k.kirim('/api/v1/join', { method: 'POST', json: { ...isi, name: 'Orang Lain' } });
    assert.equal(pertama.status, kedua.status);
    assert.deepEqual(pertama.data, kedua.data,
      'respons berbeda memungkinkan siapa pun menguji keanggotaan seseorang');
  });

  test('sparing dibersihkan dari HTML sebelum tersimpan', async () => {
    const k = buatKlien(srv.base);
    const r = await k.kirim('/api/v1/articles/artikel-uji/sparing', {
      method: 'POST',
      json: {
        frequencyId: 'sinyal', authorName: 'Budi <b>S</b>',
        text: '<script>alert(1)</script> Isi sparing yang cukup panjang untuk lolos.'
      }
    });
    assert.equal(r.status, 201);
    assert.equal(r.data.sparing.name, 'Budi S');
    assert.doesNotMatch(r.data.sparing.text, /<script/i);
  });

  test('nama yang jadi kosong setelah sanitasi ditolak dengan pesan yang bisa ditindak', async () => {
    const k = buatKlien(srv.base);
    const r = await k.kirim('/api/v1/articles/artikel-uji/sparing', {
      method: 'POST',
      json: { frequencyId: 'sinyal', authorName: '<img src=x onerror=alert(1)>', text: 'Isi yang cukup panjang untuk lolos.' }
    });
    assert.equal(r.status, 422);
    assert.match(r.data.error.details.authorName, /kosong setelah tag/);
  });

  test('injeksi SQL lewat parameter tidak merusak apa pun', async () => {
    const k = buatKlien(srv.base);
    for (const jahat of ["' OR '1'='1", "'; DROP TABLE articles; --"]) {
      await k.kirim(`/api/v1/articles?category=${encodeURIComponent(jahat)}`);
    }
    const r = await k.kirim('/api/v1/articles');
    assert.equal(r.status, 200);
    assert.equal(r.data.length, 1, 'tabel artikel seharusnya masih utuh');
  });
});

// ── jejak & pemantauan ──────────────────────────────────────────────────────
describe('jejak audit', () => {
  test('perubahan artikel tercatat beserta nilai lama dan barunya', async () => {
    const { token } = await masuk();
    const k = buatKlien(srv.base);
    const h = { authorization: `Bearer ${token}` };
    const dibuat = await k.kirim('/api/v1/admin/articles', {
      method: 'POST', headers: h, json: { title: 'Judul Lama', categoryId: 'teknis' }
    });
    await k.kirim(`/api/v1/admin/articles/${dibuat.data.id}`, {
      method: 'PATCH', headers: h, json: { title: 'Judul Baru' }
    });
    const audit = await k.kirim('/api/v1/admin/audit?entity=article&action=update', { headers: h });
    const rec = audit.data.items[0];
    assert.deepEqual(rec.changes.title, { dari: 'Judul Lama', jadi: 'Judul Baru' });
  });

  test('catatan audit tidak bisa dihapus, bahkan oleh aplikasi sendiri', async () => {
    const { token } = await masuk();
    const k = buatKlien(srv.base);
    await k.kirim('/api/v1/admin/articles', {
      method: 'POST', headers: { authorization: `Bearer ${token}` },
      json: { title: 'Sesuatu', categoryId: 'teknis' }
    });
    const { pool } = await import('../../src/infrastructure/db/pool.js');
    await assert.rejects(() => pool.query('DELETE FROM audit_logs'), /append-only/);
    await assert.rejects(() => pool.query("UPDATE audit_logs SET action = 'palsu'"), /append-only/);
  });

  test('kesehatan database terbaca dan masuk akal', async () => {
    const { token } = await masuk();
    const r = await buatKlien(srv.base).kirim('/api/v1/admin/monitor/database', {
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(r.status, 200);
    assert.ok(r.data.database.koneksi > 0);
    assert.ok(r.data.tabel.length > 0);
    assert.ok(r.data.database.cacheHitRatio === null || r.data.database.cacheHitRatio <= 100);
  });
});

// ── cache & ETag ────────────────────────────────────────────────────────────
describe('cache', () => {
  test('ETag menghasilkan 304 pada permintaan berikutnya', async () => {
    const k = buatKlien(srv.base);
    const pertama = await k.kirim('/api/v1/bootstrap');
    const etag = pertama.headers.get('etag');
    assert.ok(etag, 'ETag tidak dipasang');
    const kedua = await k.kirim('/api/v1/bootstrap', { headers: { 'if-none-match': etag } });
    assert.equal(kedua.status, 304);
  });

  test('menyunting menu langsung membatalkan cache bootstrap', async () => {
    const { token } = await masuk();
    const k = buatKlien(srv.base);
    await k.kirim('/api/v1/bootstrap');
    await k.kirim('/api/v1/admin/menus/inti', {
      method: 'PATCH', headers: { authorization: `Bearer ${token}` },
      json: { title: 'Judul Yang Sudah Diubah' }
    });
    const setelah = await k.kirim('/api/v1/bootstrap');
    assert.equal(setelah.data.panels.inti.title, 'Judul Yang Sudah Diubah');
  });
});
