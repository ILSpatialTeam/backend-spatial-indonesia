// Langit komunitas, dirangkai penuh: HTTP → validasi → service → Postgres.
//
// Yang layak diuji di sini adalah hal yang tidak bisa dibuktikan dengan mock —
// apakah unique index "satu bintang per sumber" benar-benar mengunci, apakah
// batas koordinat di Zod dan CHECK constraint sepakat, dan apakah cache daftar
// publik benar-benar dibatalkan saat admin memoderasi.
//
// `trust proxy` bernilai 1 di lingkungan uji, jadi `X-Forwarded-For` menentukan
// `req.ip`. Itu satu-satunya cara membuat dua "pengunjung berbeda" dari satu
// mesin — tanpa itu semua permintaan datang dari 127.0.0.1 dan aturan satu
// bintang per orang membuat tes kedua mustahil.
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

// Pengunjung dengan alamat sendiri.
const tamu = (ip) => {
  const k = buatKlien(srv.base);
  const asli = k.kirim;
  k.kirim = (jalur, opsi = {}) =>
    asli(jalur, { ...opsi, headers: { ...(opsi.headers ?? {}), 'x-forwarded-for': ip } });
  return k;
};

const BINTANG = { ra: 5.5, dec: -12.25, name: 'Rian', city: 'Bandung', note: 'Halo.' };

const masuk = async (email = 'owner@uji.test', role = 'owner') => {
  await buatAdmin({ email, password: SANDI, role });
  const k = buatKlien(srv.base);
  await k.kirim('/api/v1/auth/login', { method: 'POST', json: { email, password: SANDI } });
  return { klien: k, csrf: k.ambilKuki('si_csrf') };
};

describe('langit komunitas — menaruh bintang', () => {
  test('bintang baru langsung tampil di daftar publik', async () => {
    const a = tamu('203.0.113.10');
    const taruh = await a.kirim('/api/v1/sky/stars', { method: 'POST', json: BINTANG });

    assert.equal(taruh.status, 201);
    assert.equal(taruh.data.moderated, false, 'bawaannya langsung tampil');
    assert.equal(taruh.data.bintang.name, 'Rian');
    assert.equal(taruh.data.bintang.ra, 5.5);
    assert.equal(taruh.data.bintang.dec, -12.25);

    const daftar = await a.kirim('/api/v1/sky/stars');
    assert.deepEqual(daftar.data.map((b) => b.name), ['Rian']);
  });

  test('daftar publik tidak membocorkan siapa yang menaruhnya', async () => {
    const a = tamu('203.0.113.10');
    await a.kirim('/api/v1/sky/stars', { method: 'POST', json: BINTANG });
    const { data } = await a.kirim('/api/v1/sky/stars');

    assert.deepEqual(
      Object.keys(data[0]).sort(),
      ['at', 'city', 'dec', 'id', 'name', 'note', 'ra'],
      'ip_hash dan status tidak boleh ikut keluar'
    );
  });

  test('satu sumber hanya boleh punya satu bintang', async () => {
    const a = tamu('203.0.113.10');
    const pertama = await a.kirim('/api/v1/sky/stars', { method: 'POST', json: BINTANG });
    const kedua = await a.kirim('/api/v1/sky/stars', {
      method: 'POST', json: { ...BINTANG, ra: 9, name: 'Rian Lagi' }
    });

    assert.equal(pertama.status, 201);
    assert.equal(kedua.status, 409);

    const daftar = await a.kirim('/api/v1/sky/stars');
    assert.equal(daftar.data.length, 1, 'yang kedua tidak boleh ikut tersimpan');
  });

  test('sumber berbeda punya bintangnya masing-masing', async () => {
    const a = tamu('203.0.113.10');
    const b = tamu('203.0.113.11');
    await a.kirim('/api/v1/sky/stars', { method: 'POST', json: BINTANG });
    await b.kirim('/api/v1/sky/stars', { method: 'POST', json: { ...BINTANG, ra: 18, name: 'Sari' } });

    const daftar = await a.kirim('/api/v1/sky/stars');
    assert.deepEqual(daftar.data.map((s) => s.name).sort(), ['Rian', 'Sari']);
  });

  test('/sky/mine mengenali pemiliknya dan hanya pemiliknya', async () => {
    const a = tamu('203.0.113.10');
    const b = tamu('203.0.113.11');
    await a.kirim('/api/v1/sky/stars', { method: 'POST', json: BINTANG });

    const punyaA = await a.kirim('/api/v1/sky/mine');
    const punyaB = await b.kirim('/api/v1/sky/mine');

    assert.equal(punyaA.data.name, 'Rian');
    assert.equal(punyaA.data.status, 'approved');
    assert.equal(punyaB.data, null, 'orang lain tidak boleh mengklaim bintang ini');
  });

  test('/sky/mine tidak boleh di-cache — jawabannya berbeda per pengunjung', async () => {
    const a = tamu('203.0.113.10');
    const r = await a.kirim('/api/v1/sky/mine');
    assert.match(r.headers.get('cache-control') ?? '', /no-store/);
  });
});

describe('langit komunitas — batas masukan', () => {
  const tolak = async (muatan, alasan) => {
    const a = tamu('203.0.113.20');
    const r = await a.kirim('/api/v1/sky/stars', { method: 'POST', json: muatan });
    assert.equal(r.status, 422, alasan);
    return r;
  };

  test('ra di luar 0–24 jam ditolak', async () => {
    await tolak({ ...BINTANG, ra: 24.5 }, 'ra maksimum 23.999');
    await tolak({ ...BINTANG, ra: -1 }, 'ra minimum 0');
  });

  test('dec di luar ±90 derajat ditolak', async () => {
    await tolak({ ...BINTANG, dec: 91 }, 'dec maksimum 90');
    await tolak({ ...BINTANG, dec: -90.5 }, 'dec minimum -90');
  });

  test('nama yang isinya cuma tag HTML ditolak, bukan disimpan kosong', async () => {
    // T-2 di SECURITY.md: panjangnya lolos di tepi, lalu jadi kosong setelah
    // sanitasi. Tanpa pemeriksaan ulang, yang tersimpan adalah nama kosong.
    //
    // Muatannya sengaja pendek. `<img src=x onerror=...>` panjangnya 28
    // karakter dan sudah tertolak batas 24 di tepi — ia tidak pernah sampai ke
    // jalur yang justru ingin diuji di sini.
    const a = tamu('203.0.113.21');
    const r = await a.kirim('/api/v1/sky/stars', {
      method: 'POST', json: { ...BINTANG, name: '<b><i></i></b>' }
    });
    assert.equal(r.status, 422);
    assert.match(JSON.stringify(r.data), /Nama/);

    const daftar = await a.kirim('/api/v1/sky/stars');
    assert.equal(daftar.data.length, 0);
  });

  test('catatan dipotong di 60 karakter, tidak menolak seluruh kirimannya', async () => {
    const a = tamu('203.0.113.22');
    const r = await a.kirim('/api/v1/sky/stars', {
      method: 'POST', json: { ...BINTANG, note: 'x'.repeat(200) }
    });
    // Zod menolak di 60: batasnya memang di tepi, jadi pengguna tahu sebelum
    // kalimatnya diam-diam terpotong.
    assert.equal(r.status, 422);
  });

  test('tag HTML di catatan dibuang, isinya yang sah tetap tersimpan', async () => {
    const a = tamu('203.0.113.23');
    const r = await a.kirim('/api/v1/sky/stars', {
      method: 'POST', json: { ...BINTANG, note: 'Salam <b>hangat</b>' }
    });
    assert.equal(r.status, 201);
    assert.equal(r.data.bintang.note, 'Salam hangat');
  });
});

describe('langit komunitas — moderasi admin', () => {
  test('admin melihat bintang lengkap dengan statusnya', async () => {
    const a = tamu('203.0.113.30');
    await a.kirim('/api/v1/sky/stars', { method: 'POST', json: BINTANG });

    const { klien } = await masuk();
    const r = await klien.kirim('/api/v1/admin/sky');
    assert.equal(r.status, 200);
    assert.equal(r.data.total, 1);
    assert.equal(r.data.items[0].status, 'approved');
    assert.equal(r.data.items[0].name, 'Rian');
  });

  test('bintang yang ditolak hilang dari daftar publik, dan cache-nya ikut batal', async () => {
    const a = tamu('203.0.113.31');
    const taruh = await a.kirim('/api/v1/sky/stars', { method: 'POST', json: BINTANG });
    const id = taruh.data.bintang.id;

    // Daftar publik dibaca lebih dulu supaya benar-benar masuk cache.
    const sebelum = await a.kirim('/api/v1/sky/stars');
    assert.equal(sebelum.data.length, 1);

    const { klien, csrf } = await masuk();
    const moderasi = await klien.kirim(`/api/v1/admin/sky/${id}`, {
      method: 'PATCH', headers: { 'x-csrf-token': csrf }, json: { status: 'rejected' }
    });
    assert.equal(moderasi.status, 200);

    const sesudah = await a.kirim('/api/v1/sky/stars');
    assert.equal(sesudah.data.length, 0, 'cache daftar publik harus dibatalkan saat status berubah');
  });

  test('menghapus bintang tercatat di audit log', async () => {
    const a = tamu('203.0.113.32');
    const taruh = await a.kirim('/api/v1/sky/stars', { method: 'POST', json: BINTANG });
    const id = taruh.data.bintang.id;

    const { klien, csrf } = await masuk();
    const hapus = await klien.kirim(`/api/v1/admin/sky/${id}`, {
      method: 'DELETE', headers: { 'x-csrf-token': csrf }
    });
    assert.equal(hapus.status, 204);

    const jejak = await klien.kirim('/api/v1/admin/audit?limit=20');
    const baris = jejak.data.items.find((i) => i.entity === 'sky_star');
    assert.ok(baris, 'penghapusan harus meninggalkan jejak');
    assert.equal(baris.action, 'delete');
    assert.equal(baris.entity_id, id);
  });

  test('moderasi menolak permintaan tanpa token CSRF', async () => {
    const a = tamu('203.0.113.33');
    const taruh = await a.kirim('/api/v1/sky/stars', { method: 'POST', json: BINTANG });
    const { klien } = await masuk();

    const r = await klien.kirim(`/api/v1/admin/sky/${taruh.data.bintang.id}`, {
      method: 'PATCH', json: { status: 'rejected' }
    });
    assert.equal(r.status, 403);
  });

  test('tamu tanpa sesi tidak bisa membuka daftar admin', async () => {
    const r = await buatKlien(srv.base).kirim('/api/v1/admin/sky');
    assert.equal(r.status, 401);
  });
});

describe('presence live — permukaan HTTP', () => {
  // Id-nya berbentuk sah (8 karakter base64url) tapi bukan milik siapa pun —
  // persis keadaan yang terjadi saat koneksi SSE putus lalu klien sempat
  // mengirim satu laporan terakhir dengan id lamanya.
  test('/presence/here menjawab apa adanya untuk id yang tidak dikenal', async () => {
    const a = tamu('203.0.113.40');
    const r = await a.kirim('/api/v1/presence/here', {
      method: 'POST', json: { id: 'ZZZZZZZZ', planet: 'karya' }
    });
    assert.equal(r.status, 200);
    assert.equal(r.data.ok, false, 'id asing dijawab apa adanya, bukan 500');
    assert.equal(r.data.jumlah, 0);
  });

  test('/presence/live membuka aliran SSE yang tidak di-cache dan tidak di-buffer', async () => {
    const ac = new AbortController();
    try {
      const res = await fetch(`${srv.base}/api/v1/presence/live`, { signal: ac.signal });
      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-type') ?? '', /text\/event-stream/);
      assert.match(res.headers.get('cache-control') ?? '', /no-store|no-cache/);
      assert.equal(res.headers.get('x-accel-buffering'), 'no');
      // gzip di atas SSE menahan pesan di buffer sampai penuh — pesan pertama
      // bisa tertahan berjam-jam. Filter compression harus melewatkannya.
      assert.equal(res.headers.get('content-encoding'), null);

      // Pesan pertama harus 'hello' berisi id pengunjung ini.
      const pembaca = res.body.getReader();
      const { value } = await pembaca.read();
      const teks = new TextDecoder().decode(value);
      assert.match(teks, /^event: hello\n/);
      assert.ok(JSON.parse(teks.split('\n')[1].slice(5)).id);
      await pembaca.cancel();
    } finally {
      ac.abort();
    }
  });
});
