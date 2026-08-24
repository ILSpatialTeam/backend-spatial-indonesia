import { createHash } from 'node:crypto';

// Header cache untuk endpoint publik.
//
// Ini bagian performa yang paling sering dilupakan: cache di sisi server
// menghemat kerja database, tapi tetap mengirim seluruh muatan lewat jaringan.
// ETag membuat kunjungan berikutnya berakhir sebagai 304 tanpa badan sama
// sekali — dan bagi pengunjung di sambungan lambat, itu selisih yang jauh lebih
// terasa daripada beberapa milidetik query.
//
// `stale-while-revalidate` dipakai supaya perubahan admin tetap sampai dalam
// hitungan menit tanpa pernah membuat pengunjung menunggu muatan baru.
export const publicCache = (detik = 60) => (_req, res, next) => {
  res.set('Cache-Control', `public, max-age=${detik}, stale-while-revalidate=${detik * 5}`);
  next();
};

export const noStore = (_req, res, next) => {
  // Segala yang berbau sesi tidak boleh nyangkut di cache bersama — termasuk
  // proxy perusahaan yang berdiri di antara pengguna dan kita.
  res.set('Cache-Control', 'no-store, private');
  next();
};

// ETag yang dihitung dari isi respons, dipasang lewat res.sendCached().
export function etagJson(_req, res, next) {
  res.sendCached = (payload) => {
    const badan = JSON.stringify(payload);
    const etag = `W/"${createHash('sha1').update(badan).digest('base64url')}"`;
    res.set('ETag', etag);
    if (res.req.get('if-none-match') === etag) return res.status(304).end();
    return res.type('application/json').send(badan);
  };
  next();
}
