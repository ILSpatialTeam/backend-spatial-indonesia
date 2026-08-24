// Express 4 tidak menangkap promise yang ditolak dari handler async: galatnya
// jadi unhandled rejection dan permintaannya menggantung sampai timeout.
// Pembungkus ini yang membuat `throw` di dalam service sampai ke middleware
// galat, dan itulah sebabnya tidak ada satu pun try/catch di controller.
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
