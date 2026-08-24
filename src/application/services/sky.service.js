import { stripTags } from '../../shared/html.js';
import { ValidationError } from '../../shared/errors.js';
import { TAG } from '../../infrastructure/cache/memory-cache.js';

// Langit komunitas: satu bintang per pengunjung.
//
// Yang membuat fitur ini bertahan lama bukan teknologinya, tapi pembatasannya.
// Satu bintang per orang, nama depan saja, catatan maksimal 60 karakter. Kalau
// dibiarkan bebas, dalam sebulan langitnya jadi papan iklan — dan tidak ada
// cara memutar balik tanpa menghapus bintang orang yang tidak salah apa-apa.
const MAKS_CATATAN = 60;

export class SkyService {
  constructor({ sky, settings, audit, cache }) {
    this.sky = sky;
    this.settings = settings;
    this.audit = audit;
    this.cache = cache;
  }

  async _moderasi() {
    const nilai = await this.cache.wrap('setting:sky_moderation', { tags: [TAG.settings] }, () =>
      this.settings.get('sky.moderation')
    );
    // Bawaannya langsung tampil. Bintang yang baru ditaruh lalu tidak muncul
    // sampai admin membukanya adalah pengalaman yang mengecewakan untuk hal
    // sekecil ini — dan permukaan penyalahgunaannya memang sangat sempit.
    return nilai === true;
  }

  // Daftar bintang untuk situs. Di-cache: isinya jarang berubah dan diminta
  // setiap kali ada orang menyalakan mode rasi bintang.
  async daftar() {
    return this.cache.wrap('sky:stars', { tags: [TAG.sky], ttlMs: 120_000 }, async () => {
      const rows = await this.sky.listApproved();
      return rows.map((r) => ({
        id: r.id,
        ra: Number(r.ra),
        dec: Number(r.dec),
        name: r.name,
        city: r.city || null,
        note: r.note || null,
        at: new Date(r.created_at).toISOString().slice(0, 10)
      }));
    });
  }

  // Bintang milik pengunjung ini, kalau ada. Dipakai frontend untuk memutuskan
  // menampilkan tombol "taruh bintang" atau menyorot bintang yang sudah ada.
  async milikku(ipHash) {
    const r = await this.sky.findByIpHash(ipHash);
    if (!r) return null;
    return { id: r.id, ra: Number(r.ra), dec: Number(r.dec), name: r.name, status: r.status };
  }

  async taruh({ ra, dec, name, city, note, ipHash }) {
    const nama = stripTags(name);
    const kota = stripTags(city ?? '');
    const catatan = stripTags(note ?? '').slice(0, MAKS_CATATAN);

    // Divalidasi ulang setelah stripTags — masukan yang seluruhnya tag akan
    // lolos pemeriksaan panjang di tepi lalu jadi string kosong di sini.
    // Pola yang sama dengan sparing; lihat T-2 di SECURITY.md.
    if (nama.length < 2) {
      throw new ValidationError({ name: 'Nama tidak boleh kosong setelah tag HTML dibuang.' });
    }

    const status = (await this._moderasi()) ? 'pending' : 'approved';
    const row = await this.sky.create({ ra, dec, name: nama, city: kota, note: catatan, status, ipHash });

    this.cache.invalidate(TAG.sky);
    return {
      bintang: {
        id: row.id, ra: Number(row.ra), dec: Number(row.dec),
        name: row.name, city: row.city || null, note: row.note || null,
        at: new Date(row.created_at).toISOString().slice(0, 10)
      },
      moderated: status === 'pending'
    };
  }

  // ── admin ─────────────────────────────────────────────────────────────────
  async daftarAdmin(opsi) {
    const { rows, total } = await this.sky.listAll(opsi);
    return {
      items: rows.map((r) => ({
        id: r.id, ra: Number(r.ra), dec: Number(r.dec),
        name: r.name, city: r.city, note: r.note,
        status: r.status, createdAt: r.created_at
      })),
      total
    };
  }

  async moderasi(id, status, actor) {
    const row = await this.sky.setStatus(id, status);
    this.cache.invalidate(TAG.sky);
    await this.audit.record({
      actorId: actor?.id, actorEmail: actor?.email, action: `sky_${status}`,
      entity: 'sky_star', entityId: id, meta: { name: row.name }
    });
    return row;
  }

  async hapus(id, actor) {
    await this.sky.remove(id);
    this.cache.invalidate(TAG.sky);
    await this.audit.record({
      actorId: actor?.id, actorEmail: actor?.email, action: 'delete',
      entity: 'sky_star', entityId: id
    });
  }
}
