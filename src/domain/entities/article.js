// Artikel Insight.
//
// Aturan yang paling penting di berkas ini: sebuah artikel punya dua cara
// dibaca. `internal` dibaca di situs ini lewat reader 3D; `medium` hanya
// melempar ke tautan luar. Keduanya tetap muncul sebagai bulan yang mengorbit
// planet Insight — pembaca baru tahu bedanya saat mengklik.
//
// Karena itu daftar artikel selalu membawa `source` dan `href`: frontend
// memutuskan membuka reader atau membuka tab baru tanpa perlu memuat isinya
// dulu, dan tanpa perlu tahu aturan ini.
export const SOURCES = Object.freeze(['internal', 'medium']);
export const STATUSES = Object.freeze(['draft', 'published', 'archived']);

export const isReadableHere = (article) => article.source === 'internal';

// "Baru" bukan kolom, melainkan fungsi dari tanggal terbit. Disimpan sebagai
// kolom, ia akan basi diam-diam: artikel bulan lalu tetap menyala "baru" sampai
// ada yang ingat mematikannya.
export const isFresh = (publishedAt, freshDays = 30) => {
  if (!publishedAt) return false;
  const umurHari = (Date.now() - new Date(publishedAt).getTime()) / 86_400_000;
  return umurHari >= 0 && umurHari <= freshDays;
};

export function toArticle(row, { freshDays = 30, withBody = false } = {}) {
  const dasar = {
    slug: row.slug,
    no: row.no,
    cat: row.category_id,
    title: row.title,
    lead: row.lead,
    author: row.author,
    date: row.published_at ? new Date(row.published_at).toISOString().slice(0, 10) : null,
    read: row.read_minutes,
    fresh: isFresh(row.published_at, freshDays),
    source: row.source,
    // Satu field yang menjawab "apa yang terjadi kalau bulan ini diklik".
    href: row.source === 'medium' ? row.external_url : `/insight/${row.slug}`,
    external: row.source === 'medium',
    cover: row.cover_url ?? null,
    views: row.view_count ?? 0
  };
  // Isi artikel hanya ikut kalau memang diminta. Daftar artikel dipanggil di
  // setiap kunjungan; ikut membawa enam badan artikel ke dalamnya berarti
  // mengirim puluhan kilobita yang belum tentu dibaca.
  return withBody ? { ...dasar, bodyHtml: row.source === 'internal' ? row.body_html : '' } : dasar;
}

// Bentuk untuk dashboard: apa adanya, termasuk draft dan metadata redaksi.
export const toAdminArticle = (row) => ({
  id: row.id,
  slug: row.slug,
  no: row.no,
  categoryId: row.category_id,
  title: row.title,
  lead: row.lead,
  author: row.author,
  coverUrl: row.cover_url,
  source: row.source,
  externalUrl: row.external_url,
  bodyHtml: row.body_html,
  readMinutes: row.read_minutes,
  status: row.status,
  publishedAt: row.published_at,
  viewCount: row.view_count,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});
