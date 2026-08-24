// Gerbang tunggal untuk HTML yang datang dari editor WYSIWYG.
//
// Aturan yang tidak boleh dilanggar: **tidak ada HTML dari admin yang masuk
// database sebelum lewat sini.** Sanitasi saat simpan, bukan saat tampil —
// kalau disanitasi saat tampil, satu jalur render yang lupa memanggilnya sudah
// cukup jadi lubang XSS. Menyimpan yang sudah bersih berarti kesalahan itu
// tidak mungkin terjadi.
//
// Akun admin memang tepercaya, tapi "tepercaya" bukan jaminan: akunnya bisa
// dibajak, dan artikel ditampilkan di halaman yang sama dengan panel admin.
import sanitizeHtml from 'sanitize-html';

// Sengaja sempit dan cocok dengan yang bisa dirender pembaca artikel di
// frontend. Menambah tag di sini berarti memastikan reader-nya sanggup.
const ARTICLE_POLICY = {
  allowedTags: [
    'p', 'br', 'hr',
    'h2', 'h3', 'h4',
    'strong', 'em', 'u', 's', 'sup', 'sub',
    'ul', 'ol', 'li',
    'blockquote', 'pre', 'code',
    'a', 'img', 'figure', 'figcaption',
    'table', 'thead', 'tbody', 'tr', 'th', 'td'
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
    '*': ['class']
  },
  // `javascript:` dan `data:` ditutup di sini. `data:` khususnya penting —
  // `data:text/html` di dalam href adalah XSS yang sering lolos allowlist tag.
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesAppliedToAttributes: ['href', 'src'],
  allowProtocolRelative: false,
  // Kelas dibatasi supaya markup artikel tidak bisa meniru atau menimpa
  // komponen HUD yang hidup di halaman yang sama.
  allowedClasses: { '*': ['ins-lead', 'ins-note', 'ins-quote', 'ins-fig'] },
  transformTags: {
    // Setiap tautan keluar dapat rel yang benar. `noopener` menutup akses
    // `window.opener` dari halaman tujuan; tanpa itu tab tujuan bisa mengubah
    // alamat tab kita (tabnabbing).
    a: (tagName, attribs) => ({
      tagName: 'a',
      attribs: { ...attribs, target: '_blank', rel: 'noopener noreferrer nofollow' }
    }),
    img: (tagName, attribs) => ({ tagName: 'img', attribs: { ...attribs, loading: 'lazy' } })
  },
  nonTextTags: ['style', 'script', 'textarea', 'option', 'noscript'],
  disallowedTagsMode: 'discard'
};

export const sanitizeArticleHtml = (dirty) => sanitizeHtml(String(dirty ?? ''), ARTICLE_POLICY);

// Entitas HTML dikembalikan jadi karakter biasa.
//
// sanitize-html membuang tag *dan* meng-escape karakter khusus, jadi
// "Program & kegiatan" keluar sebagai "Program &amp; kegiatan". Untuk isi
// artikel itu benar — hasilnya memang HTML. Untuk judul dan lead itu salah:
// frontend memasangnya lewat `textContent`, dan yang terbaca pengunjung jadi
// "Program &amp; kegiatan" apa adanya.
//
// Sudah kejadian saat menyunting menu Program lewat dashboard, jadi
// pengembaliannya dilakukan di sini — satu tempat, bukan di setiap pembaca.
const ENTITAS = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
  '&apos;': "'", '&#39;': "'", '&nbsp;': ' '
};

const bukaEntitas = (teks) =>
  teks
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39);/g, (m) => ENTITAS[m] ?? m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));

// Untuk `lead`, judul, dan teks pendek lain: tidak ada tag sama sekali, dan
// tidak ada entitas yang tersisa.
//
// Aman karena hasilnya memang bukan HTML dan tidak pernah dirender sebagai
// HTML — tagnya sudah dibuang lebih dulu, jadi membuka entitas tidak bisa
// memunculkan kembali `<script>` yang tadi dihapus.
export const stripTags = (dirty) =>
  bukaEntitas(sanitizeHtml(String(dirty ?? ''), { allowedTags: [], allowedAttributes: {} })).trim();

export const htmlToText = (html) =>
  stripTags(String(html ?? '').replace(/<\/(p|h[2-4]|li|blockquote|tr)>/gi, ' '))
    .replace(/\s+/g, ' ')
    .trim();

// 200 kata per menit — angka yang lazim dipakai dan cukup jujur untuk artikel
// teknis berbahasa Indonesia. Minimal 1 supaya tidak pernah tampil "0 menit".
export function readingMinutes(html) {
  const kata = htmlToText(html).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(kata / 200));
}

export function excerpt(html, max = 180) {
  const teks = htmlToText(html);
  if (teks.length <= max) return teks;
  return `${teks.slice(0, max).replace(/\s+\S*$/, '')}…`;
}
