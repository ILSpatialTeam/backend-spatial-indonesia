import { MenuRepository } from '../../domain/repositories/contract.js';
import { toMenu } from '../../domain/entities/menu.js';
import { NotFoundError } from '../../shared/errors.js';

// Menu, butir panelnya, dan tautannya diambil sekaligus lewat agregasi JSON.
//
// Cara naifnya adalah satu query untuk menus lalu satu query per menu untuk
// butirnya — tujuh menu jadi lima belas perjalanan ke database untuk satu
// halaman yang isinya tidak berubah seharian. Agregasi di bawah membuatnya
// satu, dan urutan butir dijaga di dalam agregatnya (ORDER BY di dalam
// jsonb_agg), bukan diserahkan ke kebetulan.
const PILIH = `
  SELECT m.*,
         COALESCE(i.items, '[]'::jsonb) AS items,
         COALESCE(l.links, '[]'::jsonb) AS links
  FROM menus m
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object('k', mi.k, 't', mi.t, 'd', mi.d, 'position', mi.position)
                     ORDER BY mi.position) AS items
    FROM menu_items mi WHERE mi.menu_id = m.id
  ) i ON true
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object('label', ml.label, 'url', ml.url, 'position', ml.position)
                     ORDER BY ml.position) AS links
    FROM menu_links ml WHERE ml.menu_id = m.id
  ) l ON true
`;

const bentuk = (row) => toMenu(row, { items: row.items, links: row.links });

export class PgMenuRepository extends MenuRepository {
  constructor(db) {
    super();
    this.db = db;
  }

  async listAll() {
    const { rows } = await this.db.query(`${PILIH} ORDER BY m.position`);
    return rows.map(bentuk);
  }

  async listActive() {
    const { rows } = await this.db.query(`${PILIH} WHERE m.is_active ORDER BY m.position`);
    return rows.map(bentuk);
  }

  async findById(id) {
    const { rows } = await this.db.query(`${PILIH} WHERE m.id = $1`, [id]);
    return rows[0] ? bentuk(rows[0]) : null;
  }

  async create(data) {
    const { rows } = await this.db.query(
      `INSERT INTO menus (id, kind, position, is_active, label, no, tag, accent, title, lead, body_html,
                          orbit, size, color, speed, phase, tilt, skin, has_ring,
                          icon_file, icon_from, icon_to)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
       RETURNING *`,
      [
        data.id, data.kind, data.position, data.isActive ?? true, data.label, data.no, data.tag,
        data.accent, data.title, data.lead, data.bodyHtml ?? '',
        data.orbit ?? null, data.size ?? null, data.color ?? null, data.speed ?? null,
        data.phase ?? null, data.tilt ?? null, data.skin ?? null, data.hasRing ?? false,
        data.icon.file, data.icon.from, data.icon.to
      ]
    );
    return toMenu(rows[0]);
  }

  // Patch parsial: hanya kolom yang benar-benar dikirim yang ikut di-SET.
  // COALESCE tidak dipakai di sini karena akan membuat "kosongkan skin" mustahil
  // dinyatakan — NULL yang disengaja tidak boleh tertukar dengan "tidak diubah".
  async update(id, patch) {
    const peta = {
      kind: 'kind', position: 'position', isActive: 'is_active', label: 'label', no: 'no',
      tag: 'tag', accent: 'accent', title: 'title', lead: 'lead', bodyHtml: 'body_html',
      orbit: 'orbit', size: 'size', color: 'color', speed: 'speed', phase: 'phase',
      tilt: 'tilt', skin: 'skin', hasRing: 'has_ring'
    };
    const set = [];
    const nilai = [];
    for (const [kunci, kolom] of Object.entries(peta)) {
      if (patch[kunci] !== undefined) {
        nilai.push(patch[kunci]);
        set.push(`${kolom} = $${nilai.length}`);
      }
    }
    if (patch.icon) {
      for (const [k, kolom] of [['file', 'icon_file'], ['from', 'icon_from'], ['to', 'icon_to']]) {
        if (patch.icon[k] !== undefined) {
          nilai.push(patch.icon[k]);
          set.push(`${kolom} = $${nilai.length}`);
        }
      }
    }
    if (!set.length) return this.findById(id);
    nilai.push(id);
    const { rows } = await this.db.query(
      `UPDATE menus SET ${set.join(', ')} WHERE id = $${nilai.length} RETURNING id`,
      nilai
    );
    if (!rows[0]) throw new NotFoundError('Menu');
    return this.findById(id);
  }

  async remove(id) {
    const { rowCount } = await this.db.query('DELETE FROM menus WHERE id = $1', [id]);
    if (!rowCount) throw new NotFoundError('Menu');
  }

  // Ganti seluruh isi, bukan sunting per butir. Dashboard mengirim daftar utuh
  // hasil seret-lepas, dan "hapus yang tidak ada di daftar" jauh lebih mudah
  // dibuat benar daripada diff per baris di sisi klien.
  async replaceItems(menuId, items) {
    await this.db.query('DELETE FROM menu_items WHERE menu_id = $1', [menuId]);
    if (!items.length) return;
    const nilai = [];
    const bagian = items.map((it, i) => {
      nilai.push(menuId, i, it.k ?? '', it.t ?? null, it.d ?? '');
      const o = i * 5;
      return `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5})`;
    });
    await this.db.query(
      `INSERT INTO menu_items (menu_id, position, k, t, d) VALUES ${bagian.join(', ')}`,
      nilai
    );
  }

  async replaceLinks(menuId, links) {
    await this.db.query('DELETE FROM menu_links WHERE menu_id = $1', [menuId]);
    if (!links.length) return;
    const nilai = [];
    const bagian = links.map((l, i) => {
      nilai.push(menuId, i, l.label, l.url);
      const o = i * 4;
      return `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4})`;
    });
    await this.db.query(
      `INSERT INTO menu_links (menu_id, position, label, url) VALUES ${bagian.join(', ')}`,
      nilai
    );
  }

  // Posisi punya indeks unik, jadi menukar dua menu lewat UPDATE satu per satu
  // akan menabrak batasan di tengah jalan. Digeser dulu ke ruang negatif —
  // trik lama, tapi satu-satunya yang tidak menuntut DEFERRABLE.
  async reorder(urutan) {
    await this.db.query(
      'UPDATE menus SET position = -1 - position WHERE id = ANY($1::text[])',
      [urutan]
    );
    const kasus = urutan.map((_, i) => `WHEN $${i + 2} THEN ${i}`).join(' ');
    await this.db.query(
      `UPDATE menus SET position = CASE id ${kasus} END
       WHERE id = ANY($1::text[])`,
      [urutan, ...urutan]
    );
  }
}
