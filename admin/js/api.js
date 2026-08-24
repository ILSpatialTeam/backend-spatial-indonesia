// Klien API dashboard.
//
// Tiga hal yang ditangani di sini supaya tidak berulang di setiap tampilan:
//
//   1. Token CSRF dibaca dari cookie dan dipasang otomatis pada setiap
//      permintaan yang mengubah data. Kalau diserahkan ke pemanggil, cepat atau
//      lambat ada satu tombol yang lupa dan gagal dengan pesan membingungkan.
//   2. Access token berumur 15 menit. Saat kedaluwarsa, permintaan diulang
//      sekali setelah refresh — tanpa itu, dashboard akan melempar orang ke
//      halaman login tiap seperempat jam di tengah menulis artikel.
//   3. Galat dari server diubah jadi Error ber-`details`, jadi form bisa
//      menyorot field yang salah alih-alih menampilkan satu pesan umum.
import { t } from './i18n.js';

const BASE = '/api/v1';

const bacaCookie = (nama) =>
  document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${nama}=`))
    ?.slice(nama.length + 1) ?? '';

export class ApiError extends Error {
  constructor(status, payload) {
    super(payload?.error?.message || `Permintaan gagal (${status}).`);
    this.status = status;
    this.code = payload?.error?.code ?? 'UNKNOWN';
    this.details = payload?.error?.details ?? null;
  }
}

let sedangRefresh = null;

async function kirim(metode, jalur, { body, formData, ulangi = true } = {}) {
  const opsi = {
    method: metode,
    // Cookie sesi wajib ikut; tanpa ini dashboard tidak pernah dianggap masuk.
    credentials: 'same-origin',
    headers: {}
  };

  if (metode !== 'GET' && metode !== 'HEAD') {
    opsi.headers['X-CSRF-Token'] = bacaCookie('si_csrf');
  }
  if (formData) {
    // Content-Type sengaja tidak disetel: browser harus mengisinya sendiri
    // lengkap dengan boundary multipart.
    opsi.body = formData;
  } else if (body !== undefined) {
    opsi.headers['Content-Type'] = 'application/json';
    opsi.body = JSON.stringify(body);
  }

  const res = await fetch(BASE + jalur, opsi);

  if (res.status === 401 && ulangi && !jalur.startsWith('/auth/')) {
    // Beberapa permintaan bisa kedaluwarsa berbarengan. Satu refresh dipakai
    // bersama, bukan satu refresh per permintaan — kalau tidak, rotasi token
    // saling mencabut dan semuanya gagal.
    sedangRefresh ??= kirim('POST', '/auth/refresh', { ulangi: false }).finally(() => {
      sedangRefresh = null;
    });
    try {
      await sedangRefresh;
      return kirim(metode, jalur, { body, formData, ulangi: false });
    } catch {
      window.dispatchEvent(new CustomEvent('sesi-habis'));
      throw new ApiError(401, { error: { message: t('login.sesiHabis') } });
    }
  }

  if (res.status === 204) return null;

  const teks = await res.text();
  const data = teks ? JSON.parse(teks) : null;
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

const qs = (params) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined && v !== null && v !== '') p.set(k, v);
  }
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const api = {
  get: (jalur, params) => kirim('GET', jalur + qs(params)),
  post: (jalur, body) => kirim('POST', jalur, { body }),
  put: (jalur, body) => kirim('PUT', jalur, { body }),
  patch: (jalur, body) => kirim('PATCH', jalur, { body }),
  del: (jalur) => kirim('DELETE', jalur),
  upload: (jalur, formData) => kirim('POST', jalur, { formData }),

  login: (email, password) => kirim('POST', '/auth/login', { body: { email, password }, ulangi: false }),
  logout: () => kirim('POST', '/auth/logout', { ulangi: false }),
  me: () => kirim('GET', '/auth/me', { ulangi: false })
};
