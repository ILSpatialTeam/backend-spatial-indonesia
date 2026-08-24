// Cache di memori proses, dengan pembatalan berdasarkan tag.
//
// Kenapa perlu: satu-satunya endpoint yang benar-benar panas adalah /bootstrap,
// dan isinya berubah beberapa kali sehari saat admin menyunting. Membangunnya
// ulang dari lima query untuk setiap pengunjung adalah pekerjaan yang sama
// persis dilakukan berulang tanpa alasan.
//
// Kenapa bukan Redis: ini satu proses dengan data yang muat di memori dan boleh
// hilang kapan saja. Menambah satu layanan lagi untuk dijaga demi cache
// sebesar ini adalah ongkos operasional yang tidak dibayar kembali. Kalau nanti
// backend-nya dijalankan lebih dari satu instans, kelas ini yang diganti — dan
// pemanggilnya tidak perlu berubah karena antarmukanya cuma get/set/invalidate.
export class MemoryCache {
  constructor({ ttlMs = 60_000, max = 200 } = {}) {
    this.ttlMs = ttlMs;
    this.max = max;
    this.store = new Map();
  }

  get(key) {
    const isi = this.store.get(key);
    if (!isi) return undefined;
    if (isi.kadaluarsa < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    // Disentuh ulang supaya urutan Map mencerminkan pemakaian terakhir; itu
    // yang membuat pembuangan di bawah membuang yang paling lama menganggur.
    this.store.delete(key);
    this.store.set(key, isi);
    return isi.value;
  }

  set(key, value, { ttlMs = this.ttlMs, tags = [] } = {}) {
    if (this.store.size >= this.max) {
      const tertua = this.store.keys().next().value;
      if (tertua !== undefined) this.store.delete(tertua);
    }
    this.store.set(key, { value, tags, kadaluarsa: Date.now() + ttlMs });
    return value;
  }

  // Ambil-atau-hitung. Satu-satunya bentuk yang dipakai service, supaya tidak
  // ada tempat yang lupa menyimpan hasilnya kembali.
  async wrap(key, { tags = [], ttlMs = this.ttlMs } = {}, hitung) {
    const ada = this.get(key);
    if (ada !== undefined) return ada;
    const nilai = await hitung();
    return this.set(key, nilai, { ttlMs, tags });
  }

  // Dipanggil setelah setiap tulisan admin. Tag, bukan kunci, karena satu
  // perubahan artikel membatalkan beberapa entri sekaligus (daftar, bootstrap,
  // artikel itu sendiri) dan menyebut semuanya satu per satu pasti ada yang
  // terlewat.
  invalidate(...tags) {
    if (!tags.length) return this.clear();
    let n = 0;
    for (const [key, isi] of this.store) {
      if (isi.tags.some((t) => tags.includes(t))) {
        this.store.delete(key);
        n += 1;
      }
    }
    return n;
  }

  clear() {
    const n = this.store.size;
    this.store.clear();
    return n;
  }

  get size() {
    return this.store.size;
  }
}

// Tag yang dipakai di seluruh aplikasi. Dikumpulkan di sini supaya salah ketik
// jadi galat impor, bukan cache yang diam-diam tidak pernah dibatalkan.
export const TAG = Object.freeze({
  menu: 'menu',
  article: 'article',
  sparing: 'sparing',
  agenda: 'agenda',
  presence: 'presence',
  taxonomy: 'taxonomy',
  settings: 'settings',
  sky: 'sky'
});
