// Menu: satu entri tata surya. `inti` matahari, enam sisanya planet.
//
// Frontend butuh dua bentuk dari baris yang sama — parameter orbit untuk
// three.js, dan isi panel untuk DOM. Keduanya diturunkan di sini supaya
// service maupun controller tidak ada yang menyusun bentuk itu sendiri-sendiri
// lalu pelan-pelan berbeda.
export const isPlanet = (menu) => menu.kind === 'planet';

export function toMenu(row, { items = [], links = [] } = {}) {
  return {
    id: row.id,
    kind: row.kind,
    position: row.position,
    isActive: row.is_active,
    label: row.label,
    no: row.no,
    tag: row.tag,
    accent: row.accent,
    title: row.title,
    lead: row.lead,
    bodyHtml: row.body_html ?? '',
    orbit: row.orbit,
    size: row.size,
    color: row.color,
    speed: row.speed,
    phase: row.phase,
    tilt: row.tilt,
    skin: row.skin,
    hasRing: row.has_ring,
    icon: { file: row.icon_file, from: row.icon_from, to: row.icon_to },
    items,
    links,
    updatedAt: row.updated_at
  };
}

// Bentuk yang dikonsumsi src/data/planets.js di frontend. Nama fieldnya sengaja
// dipertahankan persis seperti sebelumnya (orbit, size, color, speed, phase,
// skin, tilt, ring) — sisi 3D tidak perlu diubah sama sekali gara-gara data
// pindah ke database.
export const toPlanetShape = (menu) => ({
  id: menu.id,
  label: menu.label,
  orbit: menu.orbit,
  size: menu.size,
  color: menu.color,
  speed: menu.speed,
  phase: menu.phase,
  skin: menu.skin,
  tilt: menu.tilt,
  ...(menu.hasRing ? { ring: true } : {})
});

// Bentuk panel: dipakai panel DOM di layar biasa maupun panel di dalam headset.
export const toPanelShape = (menu) => ({
  id: menu.id,
  no: menu.no,
  tag: menu.tag,
  accent: menu.accent,
  title: menu.title,
  lead: menu.lead,
  bodyHtml: menu.bodyHtml,
  items: menu.items.map((it) => ({ k: it.k, t: it.t ?? undefined, d: it.d })),
  links: menu.links.map((l) => ({ label: l.label, url: l.url }))
});
