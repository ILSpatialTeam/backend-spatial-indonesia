// PresenceHub: seluruh keadaannya ada di memori, jadi ia bisa diuji tanpa
// HTTP sama sekali. Yang dipalsukan cuma dua hal — `res` (cukup punya `.write`
// dan `.end`) dan jam, supaya kedaluwarsa bisa diuji tanpa menunggu 90 detik.
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { PresenceHub } from '../../src/application/services/presence-hub.service.js';

// Menampung apa yang ditulis ke aliran dan menguraikannya kembali jadi kejadian.
function aliranPalsu() {
  const potongan = [];
  return {
    tertulis: potongan,
    selesai: false,
    write(teks) { potongan.push(teks); return true; },
    end() { this.selesai = true; },
    // "event: join\ndata: {...}\n\n" → { jenis: 'join', data: {...} }
    get kejadian() {
      return potongan
        .filter((p) => p.startsWith('event:'))
        .map((p) => {
          const [baris1, baris2] = p.split('\n');
          return { jenis: baris1.slice(7).trim(), data: JSON.parse(baris2.slice(5)) };
        });
    },
    get denyut() { return potongan.filter((p) => p.startsWith(':')).length; }
  };
}

function jamPalsu(mulai = 1_700_000_000_000) {
  let t = mulai;
  return { now: () => t, maju: (ms) => { t += ms; } };
}

describe('PresenceHub — bergabung dan berpisah', () => {
  const hidup = [];
  afterEach(() => { for (const h of hidup.splice(0)) h.tutup(); });
  const buat = (opsi) => { const h = new PresenceHub(opsi); hidup.push(h); return h; };

  test('pengunjung pertama menerima hello berisi id dan daftar kosong', () => {
    const hub = buat();
    const a = aliranPalsu();
    const id = hub.gabung(a);

    assert.ok(id, 'gabung mengembalikan id');
    assert.deepEqual(a.kejadian.map((k) => k.jenis), ['hello']);
    assert.equal(a.kejadian[0].data.id, id);
    assert.deepEqual(a.kejadian[0].data.tamu, [], 'belum ada orang lain');
    assert.match(a.kejadian[0].data.warna, /^#[0-9a-f]{6}$/i);
  });

  test('pengunjung kedua melihat yang pertama, dan yang pertama diberi tahu', () => {
    const hub = buat();
    const a = aliranPalsu();
    const b = aliranPalsu();
    const idA = hub.gabung(a);
    const idB = hub.gabung(b);

    const helloB = b.kejadian.find((k) => k.jenis === 'hello');
    assert.deepEqual(helloB.data.tamu.map((t) => t.id), [idA]);

    // A menerima 'join' untuk B, tapi tidak untuk dirinya sendiri.
    const joinDiA = a.kejadian.filter((k) => k.jenis === 'join');
    assert.deepEqual(joinDiA.map((k) => k.data.id), [idB]);
    assert.equal(b.kejadian.filter((k) => k.jenis === 'join').length, 0,
      'pengirim tidak boleh menerima siaran join-nya sendiri');
  });

  test('keluar menyiarkan leave ke yang tersisa', () => {
    const hub = buat();
    const a = aliranPalsu();
    const b = aliranPalsu();
    hub.gabung(a);
    const idB = hub.gabung(b);

    hub.keluar(idB);
    assert.deepEqual(
      a.kejadian.filter((k) => k.jenis === 'leave').map((k) => k.data.id),
      [idB]
    );
    assert.equal(hub.jumlah, 1);
  });

  test('keluar dua kali tidak menyiarkan leave dua kali', () => {
    const hub = buat();
    const a = aliranPalsu();
    const b = aliranPalsu();
    hub.gabung(a);
    const idB = hub.gabung(b);

    hub.keluar(idB);
    hub.keluar(idB);
    assert.equal(a.kejadian.filter((k) => k.jenis === 'leave').length, 1);
  });

  test('warna tetap sama selama sesi pengunjung yang sama', () => {
    const hub = buat();
    const a = aliranPalsu();
    const id = hub.gabung(a);
    const warna = a.kejadian[0].data.warna;

    hub.pindah(id, 'karya');
    hub.pindah(id, 'event');
    const warnaSetelahPindah = a.kejadian.filter((k) => k.jenis === 'move').map((k) => k.data.warna);
    assert.deepEqual(warnaSetelahPindah, [warna, warna]);
  });
});

describe('PresenceHub — perpindahan', () => {
  const hidup = [];
  afterEach(() => { for (const h of hidup.splice(0)) h.tutup(); });
  const buat = (opsi) => { const h = new PresenceHub(opsi); hidup.push(h); return h; };

  test('move membawa planet asal, supaya klien bisa menggambar busur', () => {
    const hub = buat();
    const a = aliranPalsu();
    const b = aliranPalsu();
    const idA = hub.gabung(a);
    hub.gabung(b);

    hub.pindah(idA, 'karya');
    hub.pindah(idA, 'insight');

    const gerak = b.kejadian.filter((k) => k.jenis === 'move').map((k) => [k.data.dari, k.data.planet]);
    assert.deepEqual(gerak, [[null, 'karya'], ['karya', 'insight']]);
  });

  test('lapor planet yang sama tidak menyiarkan move — itu cuma denyut', () => {
    const hub = buat();
    const a = aliranPalsu();
    const b = aliranPalsu();
    const idA = hub.gabung(a);
    hub.gabung(b);

    hub.pindah(idA, 'karya');
    hub.pindah(idA, 'karya');
    hub.pindah(idA, 'karya');

    assert.equal(b.kejadian.filter((k) => k.jenis === 'move').length, 1);
  });

  test('id yang tidak dikenal diabaikan, bukan dilempar sebagai galat', () => {
    const hub = buat();
    assert.equal(hub.pindah('tidak-ada', 'karya'), false);
  });

  test('laporan menyegarkan umur, jadi pengunjung aktif tidak ikut tersapu', () => {
    const jam = jamPalsu();
    const hub = buat({ clock: jam });
    const a = aliranPalsu();
    const idA = hub.gabung(a);

    jam.maju(60_000);
    hub.pindah(idA, 'karya');   // masih hidup
    jam.maju(60_000);           // total 120 detik sejak gabung, 60 sejak lapor
    hub.sapu();

    assert.equal(hub.jumlah, 1, 'laporan 60 detik lalu masih di dalam batas 90 detik');
  });
});

describe('PresenceHub — kebersihan', () => {
  const hidup = [];
  afterEach(() => { for (const h of hidup.splice(0)) h.tutup(); });
  const buat = (opsi) => { const h = new PresenceHub(opsi); hidup.push(h); return h; };

  test('pengunjung yang diam lebih dari 90 detik disapu dan diumumkan', () => {
    const jam = jamPalsu();
    const hub = buat({ clock: jam });
    const a = aliranPalsu();
    const b = aliranPalsu();
    hub.gabung(a);
    const idB = hub.gabung(b);

    jam.maju(91_000);
    hub.pindah(idB, 'karya');   // hanya B yang memberi kabar
    jam.maju(60_000);           // A sudah 151 detik diam, B baru 60 detik
    hub.sapu();

    assert.equal(hub.jumlah, 1);
    assert.ok(
      b.kejadian.some((k) => k.jenis === 'leave'),
      'yang tersisa harus tahu bahwa temannya sudah pergi'
    );
  });

  test('koneksi yang mati di tengah jalan dibuang saat ketahuan', () => {
    const hub = buat();
    const a = aliranPalsu();
    // Hidup cukup lama untuk menerima 'hello', lalu mati seperti soket sungguhan
    // yang ditutup sepihak oleh klien.
    let terbuka = true;
    const rapuh = { write() { if (!terbuka) throw new Error('EPIPE'); return true; }, end() {} };
    hub.gabung(a);
    hub.gabung(rapuh);
    assert.equal(hub.jumlah, 2);

    terbuka = false;
    hub.denyut();   // menulis ke semua aliran; yang rapuh melempar
    assert.equal(hub.jumlah, 1, 'koneksi mati dibuang saat ketahuan');
    assert.equal(a.denyut, 1);
  });

  test('aliran yang sudah mati sebelum hello tidak pernah masuk hitungan', () => {
    const hub = buat();
    hub.gabung({ write() { throw new Error('EPIPE'); }, end() {} });
    assert.equal(hub.jumlah, 0,
      'gagal menerima pesan pertama berarti tidak pernah benar-benar terhubung');
  });

  test('tutup menghentikan timer dan menutup semua aliran', () => {
    const hub = new PresenceHub();
    const a = aliranPalsu();
    hub.gabung(a);
    hub.tutup();

    assert.equal(a.selesai, true);
    assert.equal(hub.jumlah, 0);
  });

  test('lebih dari 200 pengunjung ditolak, bukan diterima lalu membebani siaran', () => {
    const hub = buat();
    for (let i = 0; i < 200; i += 1) hub.gabung(aliranPalsu());
    assert.equal(hub.jumlah, 200);
    assert.equal(hub.gabung(aliranPalsu()), null);
    assert.equal(hub.jumlah, 200);
  });
});
