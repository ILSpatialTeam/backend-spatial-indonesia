import { ValidationError } from '../../../shared/errors.js';

// Validasi di tepi. Yang lolos ke controller sudah pasti berbentuk benar, jadi
// service tidak perlu memeriksa ulang bentuk — ia hanya memeriksa aturan
// bisnis. Pembagian itu yang menjaga service tetap ringkas.
//
// Hasil parse menggantikan nilai aslinya (req.body = hasil), jadi field yang
// tidak dikenali ikut terbuang. Itu disengaja: tanpa itu, kiriman berisi
// `{"role":"owner"}` ke endpoint profil bisa lolos ke lapisan berikutnya dan
// bergantung pada disiplin service untuk tidak dipakai.
const jalankan = (schema, nilai, sumber) => {
  const hasil = schema.safeParse(nilai);
  if (!hasil.success) {
    throw new ValidationError(
      Object.fromEntries(hasil.error.issues.map((i) => [[sumber, ...i.path].join('.'), i.message]))
    );
  }
  return hasil.data;
};

export const validate = ({ body, query, params }) => (req, _res, next) => {
  try {
    if (params) req.params = jalankan(params, req.params, 'params');
    if (query) req.validatedQuery = jalankan(query, req.query, 'query');
    if (body) req.body = jalankan(body, req.body, 'body');
    next();
  } catch (err) {
    next(err);
  }
};
