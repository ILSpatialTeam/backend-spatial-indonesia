import { env } from '../../../config/env.js';
import { hashIp } from '../../../infrastructure/security/hashing.js';
import { COOKIE_ACCESS, COOKIE_REFRESH, COOKIE_CSRF } from '../middleware/auth.js';
import { issueCsrfCookie } from '../middleware/csrf.js';

// Pengaturan cookie sesi, dikumpulkan supaya set dan clear tidak pernah beda.
// Cookie yang dipasang dengan `path` atau `domain` berbeda dari saat dihapus
// akan tetap tinggal di browser — bug logout klasik yang sulit dilihat.
const dasar = () => ({
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  // Strict, bukan Lax: dashboard tidak pernah dicapai lewat tautan dari situs
  // lain, jadi tidak ada yang dikorbankan dengan memilih yang paling ketat.
  sameSite: 'strict',
  ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {})
});

const pasangSesi = (res, sesi) => {
  res.cookie(COOKIE_ACCESS, sesi.accessToken, {
    ...dasar(),
    path: '/',
    maxAge: 20 * 60 * 1000
  });
  res.cookie(COOKIE_REFRESH, sesi.refreshToken, {
    ...dasar(),
    // Refresh token hanya pernah dikirim ke endpoint yang membutuhkannya.
    // Kalau path-nya '/', ia ikut di setiap permintaan gambar dan API tanpa
    // alasan — memperbanyak kesempatannya bocor tanpa menambah kegunaan.
    path: '/api/v1/auth',
    expires: new Date(sesi.refreshExpiresAt)
  });
  return issueCsrfCookie(res, { secure: env.COOKIE_SECURE, domain: env.COOKIE_DOMAIN });
};

const hapusSesi = (res) => {
  res.clearCookie(COOKIE_ACCESS, { ...dasar(), path: '/' });
  res.clearCookie(COOKIE_REFRESH, { ...dasar(), path: '/api/v1/auth' });
  res.clearCookie(COOKIE_CSRF, { ...dasar(), httpOnly: false, path: '/' });
};

export function makeAuthController({ auth }) {
  return {
    async login(req, res) {
      const sesi = await auth.login({
        email: req.body.email,
        password: req.body.password,
        userAgent: req.get('user-agent'),
        ip: req.ip,
        ipHash: hashIp(req.ip, env.ipHashSalt),
        requestId: req.id
      });
      const csrf = pasangSesi(res, sesi);
      // Access token ikut di badan respons supaya klien non-browser (Swagger,
      // skrip) bisa memakainya sebagai Bearer. Refresh token tidak — ia hanya
      // hidup di cookie httpOnly.
      res.json({ user: sesi.user, accessToken: sesi.accessToken, csrfToken: csrf });
    },

    async refresh(req, res) {
      const sesi = await auth.refresh({
        refreshToken: req.cookies?.[COOKIE_REFRESH],
        userAgent: req.get('user-agent'),
        ip: req.ip,
        ipHash: hashIp(req.ip, env.ipHashSalt),
        requestId: req.id
      });
      const csrf = pasangSesi(res, sesi);
      res.json({ user: sesi.user, accessToken: sesi.accessToken, csrfToken: csrf });
    },

    async logout(req, res) {
      await auth.logout({
        refreshToken: req.cookies?.[COOKIE_REFRESH],
        actor: req.actor,
        ip: req.ip
      });
      hapusSesi(res);
      res.json({ ok: true });
    },

    async me(req, res) {
      res.json(await auth.me(req.actor.id));
    },

    async changePassword(req, res) {
      await auth.changePassword({
        userId: req.actor.id,
        currentPassword: req.body.currentPassword,
        newPassword: req.body.newPassword
      });
      // Semua sesi dicabut, termasuk yang sedang dipakai — jadi cookienya ikut
      // dibersihkan dan dashboard akan meminta login ulang.
      hapusSesi(res);
      res.json({ ok: true, message: 'Kata sandi diganti. Masuk lagi dengan yang baru.' });
    }
  };
}
