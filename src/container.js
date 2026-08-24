// Composition root: satu-satunya tempat yang tahu implementasi konkret mana
// yang dipasang ke port mana.
//
// Setiap kelas lain di aplikasi ini menerima ketergantungannya lewat
// konstruktor dan tidak pernah membuatnya sendiri. Yang didapat dari disiplin
// itu bukan kemurnian teori: mengganti Postgres dengan repositori palsu untuk
// pengujian cukup mengubah berkas ini, dan pertanyaan "siapa yang memakai apa"
// punya satu jawaban di satu layar.
import { fileURLToPath } from 'node:url';

import { env } from './config/env.js';
import { db } from './infrastructure/db/pool.js';
import { MemoryCache } from './infrastructure/cache/memory-cache.js';

import { PgMenuRepository } from './infrastructure/repositories/menu.pg.js';
import { PgArticleRepository } from './infrastructure/repositories/article.pg.js';
import { PgTaxonomyRepository } from './infrastructure/repositories/taxonomy.pg.js';
import { PgSparingRepository } from './infrastructure/repositories/sparing.pg.js';
import { PgAgendaRepository } from './infrastructure/repositories/agenda.pg.js';
import { PgPresenceRepository } from './infrastructure/repositories/presence.pg.js';
import { PgSubmissionRepository } from './infrastructure/repositories/submission.pg.js';
import {
  PgAdminUserRepository, PgSessionRepository, PgAuditRepository
} from './infrastructure/repositories/admin.pg.js';
import { PgSettingsRepository, PgMediaRepository } from './infrastructure/repositories/misc.pg.js';
import { PgSkyRepository } from './infrastructure/repositories/sky.pg.js';
import {
  PgSecurityEventRepository, PgHealthRepository
} from './infrastructure/repositories/observability.pg.js';

import { BcryptPasswordHasher } from './infrastructure/security/hashing.js';
import { JwtTokenService } from './infrastructure/security/tokens.js';

import { ContentService } from './application/services/content.service.js';
import { ParticipationService } from './application/services/participation.service.js';
import { AuthService } from './application/services/auth.service.js';
import { ArticleAdminService } from './application/services/article-admin.service.js';
import { MenuAdminService } from './application/services/menu-admin.service.js';
import { CurationService } from './application/services/curation.service.js';
import { UserAdminService } from './application/services/user-admin.service.js';
import { MediaService } from './application/services/media.service.js';
import { MonitoringService } from './application/services/monitoring.service.js';
import { PresenceHub } from './application/services/presence-hub.service.js';
import { SkyService } from './application/services/sky.service.js';

export const UPLOAD_DIR = fileURLToPath(new URL('../uploads/', import.meta.url));

export function buildContainer({ database = db } = {}) {
  const cache = new MemoryCache({ ttlMs: 60_000, max: 200 });

  const repos = {
    menus: new PgMenuRepository(database),
    articles: new PgArticleRepository(database),
    taxonomy: new PgTaxonomyRepository(database),
    sparings: new PgSparingRepository(database),
    agenda: new PgAgendaRepository(database),
    presence: new PgPresenceRepository(database),
    submissions: new PgSubmissionRepository(database),
    users: new PgAdminUserRepository(database),
    sessions: new PgSessionRepository(database),
    audit: new PgAuditRepository(database),
    settings: new PgSettingsRepository(database),
    media: new PgMediaRepository(database),
    security: new PgSecurityEventRepository(database),
    health: new PgHealthRepository(database),
    sky: new PgSkyRepository(database)
  };

  const hasher = new BcryptPasswordHasher();
  const tokens = new JwtTokenService({
    accessSecret: env.JWT_ACCESS_SECRET,
    refreshSecret: env.JWT_REFRESH_SECRET,
    accessTtl: env.ACCESS_TOKEN_TTL
  });

  // Monitoring dibuat lebih dulu karena service lain menerimanya: pencatatan
  // kejadian keamanan harus terjadi di tempat kejadiannya (auth tahu login
  // gagal, middleware tahu CSRF ditolak), bukan disimpulkan belakangan dari log.
  const monitoring = new MonitoringService({ ...repos, cache });
  // Hub presence hidup selama proses berjalan dan menyimpan keadaannya di
  // memori — bukan repository, jadi ia dibuat di sini seperti cache.
  const presenceHub = new PresenceHub();

  const services = {
    monitoring,
    presenceHub,
    content: new ContentService({ ...repos, cache }),
    participation: new ParticipationService({ ...repos, cache }),
    auth: new AuthService({ ...repos, hasher, tokens, monitor: monitoring, refreshTtlDays: env.REFRESH_TOKEN_TTL_DAYS }),
    articleAdmin: new ArticleAdminService({ ...repos, cache }),
    menuAdmin: new MenuAdminService({ ...repos, cache }),
    curation: new CurationService({ ...repos, cache }),
    userAdmin: new UserAdminService({ ...repos, hasher }),
    media: new MediaService({ ...repos, uploadDir: UPLOAD_DIR, publicUrl: env.PUBLIC_URL }),
    sky: new SkyService({ ...repos, cache })
  };

  return { cache, repos, hasher, tokens, services, presenceHub, uploadDir: UPLOAD_DIR };
}
