// Sanitasi HTML — gerbang XSS.
//
// Berkas tes ini yang paling penting di seluruh suite. Kalau `sanitizeArticleHtml`
// suatu hari melonggar, tidak ada lapisan lain yang menangkapnya: HTML disimpan
// sudah bersih, jadi apa pun yang lolos di sini akan dirender apa adanya di
// situs publik.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeArticleHtml, stripTags, readingMinutes, excerpt, htmlToText
} from '../../src/shared/html.js';

describe('sanitizeArticleHtml', () => {
  // Setiap baris di sini adalah vektor XSS yang nyata, bukan variasi sintaks.
  const vektor = [
    ['tag skrip', '<p>a</p><script>alert(1)</script>', /<script/i],
    ['atribut kejadian', '<img src="x" onerror="alert(1)">', /onerror/i],
    ['href javascript:', '<a href="javascript:alert(1)">k</a>', /javascript:/i],
    ['href data:text/html', '<a href="data:text/html,<script>alert(1)</script>">k</a>', /data:/i],
    ['iframe', '<iframe src="https://jahat.example"></iframe>', /<iframe/i],
    ['object', '<object data="x.swf"></object>', /<object/i],
    ['tag svg + onload', '<svg onload="alert(1)"></svg>', /onload/i],
    ['form', '<form action="https://jahat.example"><input name="p"></form>', /<form/i],
    ['style dengan expression', '<div style="background:url(javascript:alert(1))">x</div>', /javascript:/i],
    ['meta refresh', '<meta http-equiv="refresh" content="0;url=https://jahat.example">', /<meta/i],
    ['base', '<base href="https://jahat.example/">', /<base/i],
    ['skrip bersarang', '<p><scr<script>ipt>alert(1)</script></p>', /<script/i]
  ];

  for (const [nama, masuk, terlarang] of vektor) {
    test(`membuang ${nama}`, () => {
      const keluar = sanitizeArticleHtml(masuk);
      assert.doesNotMatch(keluar, terlarang, `masih ada pola terlarang di: ${keluar}`);
    });
  }

  test('mempertahankan markup artikel yang sah', () => {
    const masuk = '<h2>Judul</h2><p>Teks <strong>tebal</strong> dan <em>miring</em>.</p>'
      + '<ul><li>satu</li></ul><blockquote><p>kutipan</p></blockquote><pre><code>kode()</code></pre>';
    const keluar = sanitizeArticleHtml(masuk);
    for (const tag of ['h2', 'strong', 'em', 'ul', 'li', 'blockquote', 'pre', 'code']) {
      assert.match(keluar, new RegExp(`<${tag}[ >]`), `tag <${tag}> hilang`);
    }
  });

  test('tautan keluar selalu dapat rel yang aman', () => {
    const keluar = sanitizeArticleHtml('<a href="https://medium.com/x">m</a>');
    assert.match(keluar, /rel="noopener noreferrer nofollow"/);
    assert.match(keluar, /target="_blank"/);
  });

  test('entitas dipertahankan di isi artikel', () => {
    // Kebalikan dari stripTags: hasilnya memang HTML, jadi & harus tetap
    // ter-escape supaya tidak mengubah arti markupnya.
    assert.match(sanitizeArticleHtml('<p>A &amp; B</p>'), /&amp;/);
  });

  test('masukan kosong dan nullish tidak melempar', () => {
    for (const v of [null, undefined, '', 0, false]) {
      assert.doesNotThrow(() => sanitizeArticleHtml(v));
    }
  });
});

describe('stripTags', () => {
  test('membuang seluruh tag', () => {
    assert.equal(stripTags('<b>Halo</b> <i>dunia</i>'), 'Halo dunia');
  });

  test('mengembalikan entitas jadi karakter biasa', () => {
    // Nilai ini dirender lewat textContent di frontend. Kalau entitasnya tidak
    // dibuka, pengunjung membaca "Program &amp; kegiatan" apa adanya.
    assert.equal(stripTags('Program &amp; kegiatan'), 'Program & kegiatan');
    assert.equal(stripTags('5 &gt; 3 &amp;&amp; 2 &lt; 4'), '5 > 3 && 2 < 4');
  });

  test('isi skrip ikut terbuang, bukan cuma tagnya', () => {
    assert.equal(stripTags('<script>alert(1)</script>Halo'), 'Halo');
  });

  test('masukan yang hanya berisi tag jadi string kosong', () => {
    // Justru kasus inilah yang dulu lolos validasi Zod lalu ditolak CHECK
    // constraint dengan pesan yang tidak berguna. Lihat T-2 di SECURITY.md.
    assert.equal(stripTags('<img src=x onerror=alert(1)>'), '');
    assert.equal(stripTags('<b></b>'), '');
  });
});

describe('readingMinutes & excerpt', () => {
  test('minimal satu menit', () => {
    assert.equal(readingMinutes('<p>tiga kata saja</p>'), 1);
  });

  test('sekitar 200 kata per menit', () => {
    assert.equal(readingMinutes(`<p>${'kata '.repeat(400)}</p>`), 2);
    assert.equal(readingMinutes(`<p>${'kata '.repeat(1000)}</p>`), 5);
  });

  test('ringkasan dipotong di batas kata', () => {
    const r = excerpt('<p>Satu dua tiga empat lima enam tujuh delapan sembilan</p>', 20);
    assert.ok(r.length <= 21, `terlalu panjang: ${r}`);
    assert.match(r, /…$/);
    assert.doesNotMatch(r, /\s…$/, 'tidak boleh ada spasi sebelum elipsis');
  });

  test('htmlToText memberi jarak antar blok', () => {
    // Tanpa ini "SatuDua" akan terhitung satu kata.
    assert.match(htmlToText('<p>Satu</p><p>Dua</p>'), /Satu Dua/);
  });
});
