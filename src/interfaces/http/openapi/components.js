// Skema bersama untuk dokumen OpenAPI.
//
// Ditulis tangan dan bukan dibangkitkan dari zod: dokumen API adalah janji ke
// pemakainya, dan janji itu layak ditulis dengan sengaja — lengkap dengan
// contoh dan penjelasan kenapa sebuah field ada. Yang dibangkitkan otomatis
// selalu benar secara bentuk dan selalu miskin secara penjelasan.
export const components = {
  securitySchemes: {
    cookieAuth: {
      type: 'apiKey',
      in: 'cookie',
      name: 'si_access',
      description:
        'Cookie httpOnly yang dipasang POST /auth/login. Dipakai dashboard. ' +
        'Permintaan yang mengubah data juga wajib membawa header X-CSRF-Token.'
    },
    bearerAuth: {
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description:
        'Alternatif untuk klien non-browser. Ambil accessToken dari respons ' +
        'POST /auth/login lalu kirim sebagai Authorization: Bearer <token>. ' +
        'Jalur ini tidak butuh token CSRF.'
    }
  },
  schemas: {
    Error: {
      type: 'object',
      properties: {
        error: {
          type: 'object',
          properties: {
            code: { type: 'string', example: 'VALIDATION_ERROR' },
            message: { type: 'string', example: 'Data yang dikirim tidak valid.' },
            details: { type: 'object', additionalProperties: { type: 'string' }, nullable: true }
          }
        }
      }
    },
    Planet: {
      type: 'object',
      description: 'Parameter orbit yang langsung dipakai three.js di frontend.',
      properties: {
        id: { type: 'string', example: 'program' },
        label: { type: 'string', example: 'Program' },
        orbit: { type: 'number', example: 11, description: 'Jari-jari orbit dalam satuan scene.' },
        size: { type: 'number', example: 0.7 },
        color: { type: 'integer', example: 11115506, description: 'Warna 0xRRGGBB sebagai integer.' },
        speed: { type: 'number', example: 0.085 },
        phase: { type: 'number', example: 0.4 },
        skin: { type: 'string', example: 'mercury', description: 'Berkas tekstur assets/planets/<skin>.jpg' },
        tilt: { type: 'number', example: 0.03 },
        ring: { type: 'boolean', example: false }
      }
    },
    MenuItem: {
      type: 'object',
      properties: {
        k: { type: 'string', example: 'Bulanan' },
        t: { type: 'string', nullable: true, example: 'XR Meetup' },
        d: { type: 'string', example: 'Demo karya, tanya jawab, coba perangkat bareng.' }
      }
    },
    Panel: {
      type: 'object',
      description: 'Isi panel menu, dipakai panel DOM maupun panel di dalam headset.',
      properties: {
        id: { type: 'string', example: 'program' },
        no: { type: 'string', example: '01' },
        tag: { type: 'string', example: 'Program' },
        accent: { type: 'string', example: '#a99bf2' },
        title: { type: 'string' },
        lead: { type: 'string' },
        bodyHtml: { type: 'string', description: 'HTML bebas yang sudah disanitasi. Boleh kosong.' },
        items: { type: 'array', items: { $ref: '#/components/schemas/MenuItem' } },
        links: {
          type: 'array',
          items: {
            type: 'object',
            properties: { label: { type: 'string' }, url: { type: 'string' } }
          }
        }
      }
    },
    ArticleSummary: {
      type: 'object',
      properties: {
        slug: { type: 'string', example: 'frame-budget-vr' },
        no: { type: 'string', example: '001' },
        cat: { type: 'string', example: 'teknis' },
        title: { type: 'string' },
        lead: { type: 'string' },
        author: { type: 'string' },
        date: { type: 'string', format: 'date', nullable: true },
        read: { type: 'integer', example: 6 },
        fresh: { type: 'boolean', description: 'Dihitung dari tanggal terbit, bukan kolom tersimpan.' },
        source: { type: 'string', enum: ['internal', 'medium'] },
        href: {
          type: 'string',
          description:
            'Ke mana bulan artikel ini membawa pembaca. Untuk `internal` sebuah path ' +
            'di situs ini; untuk `medium` URL lengkap ke Medium.'
        },
        external: { type: 'boolean', description: 'true kalau href keluar dari situs ini.' },
        cover: { type: 'string', nullable: true },
        views: { type: 'integer' }
      }
    },
    ArticleDetail: {
      allOf: [
        { $ref: '#/components/schemas/ArticleSummary' },
        {
          type: 'object',
          properties: {
            bodyHtml: {
              type: 'string',
              description: 'HTML tersanitasi. Selalu string kosong untuk artikel `medium`.'
            },
            sparing: { type: 'array', items: { $ref: '#/components/schemas/Sparing' } }
          }
        }
      ]
    },
    Sparing: {
      type: 'object',
      description: 'Komentar berbentuk satelit yang mengorbit bulan artikel.',
      properties: {
        id: { type: 'string', format: 'uuid' },
        freq: { type: 'string', enum: ['sinyal', 'observasi', 'sonde', 'anomali'] },
        name: { type: 'string' },
        text: { type: 'string' },
        anchor: { type: 'array', items: { type: 'integer' }, minItems: 2, maxItems: 2 },
        boost: { type: 'integer' },
        at: { type: 'string', format: 'date' }
      }
    },
    SkyStar: {
      type: 'object',
      description:
        'Satu bintang di langit komunitas. Koordinatnya memakai sistem yang sama ' +
        'dengan rasi bawaan: right ascension dalam jam (0–24), declination dalam ' +
        'derajat (-90–90). Tidak ada jejak siapa yang menaruhnya di jawaban publik.',
      properties: {
        id: { type: 'string', format: 'uuid' },
        ra: { type: 'number', example: 5.5, minimum: 0, maximum: 23.999 },
        dec: { type: 'number', example: -12.25, minimum: -90, maximum: 90 },
        name: { type: 'string', example: 'Rian' },
        city: { type: 'string', nullable: true, example: 'Bandung' },
        note: { type: 'string', nullable: true, maxLength: 60 },
        at: { type: 'string', format: 'date' }
      }
    },
    PresenceGuest: {
      type: 'object',
      description:
        'Satu pengunjung yang sedang membuka situs. Tidak ada nama, tidak ada ' +
        'avatar — hanya id sesi, warna yang diturunkan dari id itu, dan planet ' +
        'yang sedang ia lihat.',
      properties: {
        id: { type: 'string', example: 'Kf3nQ2xA', description: '8 karakter base64url, hidup selama sesi saja.' },
        planet: { type: 'string', nullable: true, example: 'karya' },
        dari: { type: 'string', nullable: true, description: 'Planet asal, supaya klien bisa menggambar busur perpindahan.' },
        warna: { type: 'string', example: '#5ad1c0' }
      }
    },
    AgendaEvent: {
      type: 'object',
      properties: {
        id: { type: 'string', example: 'meetup-12' },
        kind: { type: 'string', example: 'MEETUP' },
        title: { type: 'string' },
        date: { type: 'string', format: 'date' },
        place: { type: 'string' },
        note: { type: 'string' },
        url: { type: 'string', nullable: true }
      }
    },
    AgendaState: {
      type: 'object',
      description:
        'Keadaan agenda saat ini. Jarak sudut planet Event ke Titik Temu di scene ' +
        'diturunkan dari `progress`, dan hitungan mundurnya dari `days`.',
      properties: {
        next: { $ref: '#/components/schemas/AgendaEvent' },
        prev: { $ref: '#/components/schemas/AgendaEvent' },
        progress: { type: 'number', minimum: 0, maximum: 1 },
        days: { type: 'integer' },
        list: { type: 'array', items: { $ref: '#/components/schemas/AgendaEvent' } }
      }
    },
    Trail: {
      type: 'object',
      properties: {
        ago: { type: 'integer', description: 'Berapa menit lalu.' },
        path: { type: 'array', items: { type: 'string' }, example: ['inti', 'program', 'karya'] }
      }
    },
    Bootstrap: {
      type: 'object',
      description:
        'Seluruh isi situs dalam satu respons. Endpoint ini yang dipanggil frontend ' +
        'saat memuat; sisanya ada untuk pemakaian granular.',
      properties: {
        planets: { type: 'array', items: { $ref: '#/components/schemas/Planet' } },
        nav: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, label: { type: 'string' } } } },
        panels: { type: 'object', additionalProperties: { $ref: '#/components/schemas/Panel' } },
        icons: { type: 'object', additionalProperties: { type: 'object' } },
        categories: { type: 'object', additionalProperties: { type: 'object' } },
        frequencies: { type: 'object', additionalProperties: { type: 'object' } },
        articles: { type: 'array', items: { $ref: '#/components/schemas/ArticleSummary' } },
        sparing: {
          type: 'object',
          description: 'Sparing yang sudah disetujui, dikelompokkan per slug artikel.',
          additionalProperties: { type: 'array', items: { $ref: '#/components/schemas/Sparing' } }
        },
        agenda: { type: 'array', items: { $ref: '#/components/schemas/AgendaEvent' } },
        generatedAt: { type: 'string', format: 'date-time' }
      }
    },
    AdminUser: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        email: { type: 'string', format: 'email' },
        name: { type: 'string' },
        role: { type: 'string', enum: ['owner', 'editor'] },
        is_active: { type: 'boolean' },
        last_login_at: { type: 'string', format: 'date-time', nullable: true }
      }
    },
    AdminArticle: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        slug: { type: 'string' },
        no: { type: 'string' },
        categoryId: { type: 'string' },
        title: { type: 'string' },
        lead: { type: 'string' },
        author: { type: 'string' },
        coverUrl: { type: 'string', nullable: true },
        source: { type: 'string', enum: ['internal', 'medium'] },
        externalUrl: { type: 'string', nullable: true },
        bodyHtml: { type: 'string' },
        readMinutes: { type: 'integer' },
        status: { type: 'string', enum: ['draft', 'published', 'archived'] },
        publishedAt: { type: 'string', format: 'date-time', nullable: true },
        viewCount: { type: 'integer' }
      }
    }
  },
  responses: {
    Validasi: {
      description: 'Data yang dikirim tidak valid.',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } }
    },
    TidakBerhak: {
      description: 'Belum masuk, atau token/CSRF tidak valid.',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } }
    },
    TidakAda: {
      description: 'Data tidak ditemukan.',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } }
    },
    TerlaluSering: {
      description: 'Melewati batas jumlah permintaan.',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } }
    }
  }
};
