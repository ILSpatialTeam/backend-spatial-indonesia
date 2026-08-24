// Slug artikel jadi bagian dari URL publik dan dipakai frontend sebagai kunci
// bulan yang mengorbit planet Insight — jadi bentuknya harus stabil dan aman.
export function slugify(input, { max = 80 } = {}) {
  return String(input)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
}

// Dipakai saat admin menyimpan artikel baru dengan judul yang slug-nya sudah
// terpakai: `judul`, `judul-2`, `judul-3`, ...
export function uniqueSlug(base, taken) {
  const root = slugify(base) || 'artikel';
  if (!taken.has(root)) return root;
  let n = 2;
  while (taken.has(`${root}-${n}`)) n += 1;
  return `${root}-${n}`;
}
