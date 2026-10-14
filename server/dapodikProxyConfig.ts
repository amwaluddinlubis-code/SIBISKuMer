/**
 * Konfigurasi proxy Web Service Dapodik (server.ts).
 *
 * Issue #14 — nama variabel allowlist host:
 *   - Kanonis: `DAPODIK_ALLOW_HOSTS` (dipakai kode sejak S4 + docs operasional).
 *   - Alias lama (deprecated): `DAPODIK_ALLOWED_HOSTS` — hanya pernah muncul di
 *     README lama dan TIDAK PERNAH dibaca aplikasi. Alias tetap didukung agar
 *     deployment lama yang mengikuti README lama tidak tiba-tiba kehilangan
 *     allowlist; bila keduanya diatur dengan nilai berbeda, yang kanonis menang.
 *   - Konfigurasi dibaca SEKALI saat startup (snapshot); perubahan env butuh
 *     restart server.
 *
 * Issue #15 — secret proxy:
 *   - `DAPODIK_PROXY_SECRET` wajib di server; tanpa itu semua request proxy
 *     ditolak 503. Header `x-dapodik-secret` yang tidak cocok ditolak 403.
 *   - Nilai secret TIDAK PERNAH ditulis ke log, respons error, maupun pesan
 *     validasi — pesan hanya menyebut NAMA variabelnya.
 */
import crypto from 'crypto';
import type { RequestHandler } from 'express';

export const DAPODIK_PROXY_SECRET_ENV = 'DAPODIK_PROXY_SECRET';
export const DAPODIK_PROXY_SECRET_HEADER = 'x-dapodik-secret';
/** Nama kanonis variabel allowlist host (dipakai kode + docs operasional). */
export const DAPODIK_ALLOW_HOSTS_ENV = 'DAPODIK_ALLOW_HOSTS';
/** Alias lama dari README lama — deprecated, tetap didukung (lihat #14). */
export const DAPODIK_ALLOWED_HOSTS_ENV = 'DAPODIK_ALLOWED_HOSTS';
export const DAPODIK_DEFAULT_PORT = 5774;

/** Host yang selalu diizinkan — loopback lokal saja. */
export const DAPODIK_LOOPBACK_HOSTS: ReadonlySet<string> = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
]);

export type EnvLike = Record<string, string | undefined>;

/** Normalisasi satu host: trim, lowercase, lepas kurung IPv6, lepas titik akhir. */
export function normalizeHost(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
}

/** Parse daftar host comma-separated menjadi Set yang sudah dinormalisasi. */
export function parseHostList(raw: string | undefined): Set<string> {
  return new Set(
    String(raw || '')
      .split(',')
      .map((h) => normalizeHost(h))
      .filter(Boolean),
  );
}

export interface DapodikAllowHostsResolution {
  /** Host tambahan yang berlaku (selain loopback). */
  hosts: Set<string>;
  /** Variabel kanonis diatur dengan nilai non-kosong. */
  canonicalSet: boolean;
  /** Variabel alias diatur dengan nilai non-kosong. */
  aliasSet: boolean;
  /** Keduanya diatur dengan daftar host yang berbeda — kanonis yang dipakai. */
  conflict: boolean;
}

/**
 * Resolusi allowlist host (#14). Prioritas: kanonis menang; alias hanya
 * dipakai bila kanonis tidak diatur.
 */
export function resolveDapodikAllowHosts(env: EnvLike): DapodikAllowHostsResolution {
  const canonicalRaw = (env[DAPODIK_ALLOW_HOSTS_ENV] || '').trim();
  const aliasRaw = (env[DAPODIK_ALLOWED_HOSTS_ENV] || '').trim();
  const canonicalSet = canonicalRaw.length > 0;
  const aliasSet = aliasRaw.length > 0;
  const canonicalHosts = parseHostList(canonicalRaw);
  const aliasHosts = parseHostList(aliasRaw);
  const conflict =
    canonicalSet &&
    aliasSet &&
    [...canonicalHosts].sort().join(',') !== [...aliasHosts].sort().join(',');
  return {
    hosts: canonicalSet ? canonicalHosts : aliasHosts,
    canonicalSet,
    aliasSet,
    conflict,
  };
}

/** Host hanya boleh loopback atau tercantum di allowlist yang berlaku. */
export function isDapodikHostAllowed(host: unknown, allowHosts: ReadonlySet<string>): boolean {
  const normalized = normalizeHost(host);
  if (!normalized) return false;
  if (DAPODIK_LOOPBACK_HOSTS.has(normalized)) return true;
  return allowHosts.has(normalized);
}

/** Secret dianggap terkonfigurasi bila ada dan bukan hanya whitespace. */
export function isProxySecretConfigured(env: EnvLike): boolean {
  return (env[DAPODIK_PROXY_SECRET_ENV] || '').trim().length > 0;
}

/** Perbandingan secret constant-time (tahan timing attack). */
export function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export type PortNormalization =
  | { ok: true; port: number }
  | { ok: false; error: string };

/** Validasi port: kosong = default 5774; selain itu harus integer 1-65535. */
export function normalizeDapodikPort(rawPort: unknown): PortNormalization {
  const candidate =
    rawPort === undefined || rawPort === null || rawPort === '' ? DAPODIK_DEFAULT_PORT : rawPort;
  const portNum =
    typeof candidate === 'number'
      ? candidate
      : /^\d+$/.test(String(candidate).trim())
        ? Number(String(candidate).trim())
        : NaN;
  if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
    return {
      ok: false,
      error: `Port Dapodik tidak valid ("${String(rawPort ?? '').slice(0, 40)}"): harus bilangan bulat 1-65535.`,
    };
  }
  return { ok: true, port: portNum };
}

/**
 * Validasi konfigurasi proxy saat startup (#14 + #15). Mengembalikan daftar
 * peringatan operator. TIDAK PERNAH menyertakan nilai secret atau daftar
 * host apa pun yang sensitif — hanya nama variabel dan statusnya.
 */
export function validateDapodikProxyConfig(env: EnvLike): string[] {
  const warnings: string[] = [];
  if (!isProxySecretConfigured(env)) {
    warnings.push(
      `Proxy Dapodik dinonaktifkan: ${DAPODIK_PROXY_SECRET_ENV} belum diatur. ` +
        'Atur variabel tersebut ke nilai acak yang kuat, lalu restart server.',
    );
  }
  const resolution = resolveDapodikAllowHosts(env);
  if (resolution.conflict) {
    warnings.push(
      `${DAPODIK_ALLOW_HOSTS_ENV} dan ${DAPODIK_ALLOWED_HOSTS_ENV} keduanya diatur dengan nilai berbeda; ` +
        `yang dipakai adalah ${DAPODIK_ALLOW_HOSTS_ENV}. Samakan atau hapus variabel alias.`,
    );
  } else if (resolution.aliasSet && !resolution.canonicalSet) {
    warnings.push(
      `${DAPODIK_ALLOWED_HOSTS_ENV} sudah tidak dipakai (deprecated); pindahkan nilainya ke ` +
        `${DAPODIK_ALLOW_HOSTS_ENV}. Alias lama masih dibaca untuk kompatibilitas, tetapi dapat dihapus pada rilis mendatang.`,
    );
  }
  if (resolution.canonicalSet && resolution.hosts.size === 0) {
    warnings.push(
      `${DAPODIK_ALLOW_HOSTS_ENV} diatur tetapi tidak berisi host yang valid; hanya loopback yang diizinkan.`,
    );
  }
  return warnings;
}

/**
 * Middleware pengaman untuk semua endpoint proxy Dapodik (#15).
 * Urutan: (1) secret wajib terkonfigurasi — 503 bila belum; (2) header secret
 * cocok — 403 bila tidak ada/tidak cocok; (3) port valid — 400 bila tidak;
 * (4) host diizinkan — 403 bila tidak. Nilai secret tidak pernah ditulis
 * ke respons, log, maupun pesan error.
 */
export function createDapodikProxyGuard(env: EnvLike): RequestHandler {
  const proxySecret = env[DAPODIK_PROXY_SECRET_ENV] || '';
  const secretConfigured = isProxySecretConfigured(env);
  const allowHosts = resolveDapodikAllowHosts(env).hosts;

  return (req, res, next) => {
    if (!secretConfigured) {
      return res.status(503).json({
        success: false,
        message:
          `Proxy Dapodik dinonaktifkan: admin server belum mengatur variabel lingkungan ${DAPODIK_PROXY_SECRET_ENV}. ` +
          `Atur ${DAPODIK_PROXY_SECRET_ENV} ke nilai acak yang kuat, lalu restart server.`,
      });
    }
    const provided = String(req.get(DAPODIK_PROXY_SECRET_HEADER) || '');
    if (!provided || !secretsMatch(provided, proxySecret)) {
      return res.status(403).json({
        success: false,
        message: `Akses proxy Dapodik ditolak: header ${DAPODIK_PROXY_SECRET_HEADER} tidak ada atau tidak cocok.`,
      });
    }

    const portResult = normalizeDapodikPort(req.body?.port);
    if (portResult.ok === false) {
      return res.status(400).json({ success: false, message: portResult.error });
    }

    const rawHost =
      req.body?.host === undefined || req.body?.host === null || req.body?.host === ''
        ? 'localhost'
        : req.body.host;
    if (!isDapodikHostAllowed(rawHost, allowHosts)) {
      return res.status(403).json({
        success: false,
        message:
          `Host Dapodik "${String(rawHost).slice(0, 80)}" tidak diizinkan. ` +
          `Proxy hanya boleh menjangkau localhost/127.0.0.1/::1 atau host yang tercantum di env ${DAPODIK_ALLOW_HOSTS_ENV}.`,
      });
    }

    // Teruskan nilai yang sudah divalidasi ke handler agar URL dibangun dari input aman.
    req.body.host = typeof rawHost === 'string' ? rawHost.trim() : rawHost;
    req.body.port = portResult.port;
    return next();
  };
}
