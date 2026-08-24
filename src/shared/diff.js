// Perbandingan medan untuk jejak audit.
//
// Yang dicatat bukan seluruh isi baris sebelum dan sesudah, melainkan hanya
// medan yang benar-benar berubah. Alasannya bukan hemat tempat: satu artikel
// berisi belasan kilobita HTML, dan menyimpan dua salinannya di setiap
// penyuntingan membuat tabel audit tumbuh lebih cepat daripada tabel isinya —
// sambil mengubur satu perubahan kecil yang justru dicari orang.
const RAHASIA = new Set(['password', 'passwordHash', 'password_hash', 'refreshToken', 'token']);

// Nilai panjang dipotong. Isi artikel bisa puluhan ribu karakter, dan yang
// berguna di layar audit adalah "berubah, dari kira-kira ini jadi kira-kira
// itu" — bukan naskah lengkapnya.
const MAKS = 160;

function ringkas(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') {
    const bersih = v.replace(/\s+/g, ' ').trim();
    return bersih.length > MAKS ? `${bersih.slice(0, MAKS)}… (${v.length} karakter)` : bersih;
  }
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return `${v.length} butir`;
  if (typeof v === 'object') {
    const s = JSON.stringify(v);
    return s.length > MAKS ? `${s.slice(0, MAKS)}…` : s;
  }
  return String(v);
}

const sama = (a, b) => {
  if (a === b) return true;
  if (a instanceof Date || b instanceof Date) {
    return new Date(a ?? 0).getTime() === new Date(b ?? 0).getTime();
  }
  // Angka dari Postgres kadang kembali sebagai string di kolom numeric yang
  // belum dipetakan; "11" dan 11 bukan perubahan yang layak dicatat.
  if (typeof a === 'number' || typeof b === 'number') {
    const na = Number(a), nb = Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na === nb;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
};

/**
 * Bandingkan keadaan lama dan patch yang dikirim.
 * Hanya kunci yang ada di `patch` yang diperiksa — kunci yang tidak dikirim
 * berarti "jangan disentuh", bukan "dikosongkan".
 */
export function diff(lama = {}, patch = {}, { peta = {} } = {}) {
  const hasil = {};
  for (const [kunci, baru] of Object.entries(patch)) {
    if (baru === undefined) continue;
    if (RAHASIA.has(kunci)) {
      // Perubahan kata sandi tetap tercatat — nilainya tidak pernah.
      hasil[kunci] = { dari: '[disunting]', jadi: '[disunting]' };
      continue;
    }
    const kolom = peta[kunci] ?? kunci;
    const sebelum = lama[kolom] ?? lama[kunci];
    if (sama(sebelum, baru)) continue;
    hasil[kunci] = { dari: ringkas(sebelum), jadi: ringkas(baru) };
  }
  return hasil;
}

export const adaPerubahan = (d) => Object.keys(d).length > 0;
