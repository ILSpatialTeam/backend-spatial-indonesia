import { UnauthorizedError, ForbiddenError } from '../../../shared/errors.js';

export const COOKIE_ACCESS = 'si_access';
export const COOKIE_REFRESH = 'si_refresh';
export const COOKIE_CSRF = 'si_csrf';

// Access token dibaca dari cookie, dengan header Authorization sebagai
// cadangan.
//
// Cookie untuk dashboard (tidak bisa dibaca JavaScript, jadi selamat dari XSS);
// header Bearer untuk pemakaian dari skrip dan dokumentasi Swagger, yang tidak
// punya browser untuk menyimpan cookie. Keduanya melewati verifikasi yang sama.
const ambilToken = (req) => {
  const dariCookie = req.cookies?.[COOKIE_ACCESS];
  if (dariCookie) return dariCookie;
  const header = req.get('authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
};

export const makeRequireAuth = (tokens) => (req, _res, next) => {
  try {
    const token = ambilToken(req);
    if (!token) throw new UnauthorizedError('Belum masuk.');
    const isi = tokens.verifyAccess(token);
    req.actor = { id: isi.sub, email: isi.email, role: isi.role, sessionId: isi.sid };
    next();
  } catch (err) {
    next(err);
  }
};

// Peran diperiksa terpisah dari autentikasi supaya rute bisa memilih: sebagian
// besar cukup "sudah masuk", pengelolaan akun butuh "owner".
export const requireRole = (...peran) => (req, _res, next) => {
  if (!req.actor) return next(new UnauthorizedError('Belum masuk.'));
  if (!peran.includes(req.actor.role)) {
    return next(new ForbiddenError(`Butuh peran: ${peran.join(' atau ')}.`));
  }
  next();
};
