/**
 * Tes regresi konfigurasi proxy Dapodik — Issue #14 (nama variabel allowlist)
 * dan #15 (secret proxy). Dijalankan dengan `npm test` (tsx + node:test).
 * TIDAK memakai secret sungguhan — semua nilai secret di sini adalah fiktif
 * dan hanya hidup di dalam proses tes.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DAPODIK_ALLOWED_HOSTS_ENV,
  DAPODIK_ALLOW_HOSTS_ENV,
  DAPODIK_PROXY_SECRET_ENV,
  createDapodikProxyGuard,
  isDapodikHostAllowed,
  isProxySecretConfigured,
  normalizeDapodikPort,
  normalizeHost,
  parseHostList,
  resolveDapodikAllowHosts,
  secretsMatch,
  validateDapodikProxyConfig,
} from '../server/dapodikProxyConfig';

const TEST_SECRET = 'tes-secret-fiktif-untuk-unit-test';

function envWithSecret(extra: Record<string, string> = {}) {
  return { [DAPODIK_PROXY_SECRET_ENV]: TEST_SECRET, ...extra };
}

/** Mock minimal req/res/next untuk memanggil middleware tanpa Express. */
function mockReqRes(opts: { body?: Record<string, unknown>; secret?: string }) {
  const req: any = {
    body: { ...(opts.body || {}) },
    get: (name: string) =>
      name.toLowerCase() === 'x-dapodik-secret' ? (opts.secret ?? undefined) : undefined,
  };
  const res: any = {
    statusCode: 0,
    payload: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.payload = payload;
      return this;
    },
  };
  let nextCalled = false;
  const next = () => {
    nextCalled = true;
  };
  return { req, res, next, wasNext: () => nextCalled };
}

describe('normalisasi host', () => {
  test('trim, lowercase, lepas kurung IPv6 dan titik akhir', () => {
    assert.equal(normalizeHost('  LOCALHOST. '), 'localhost');
    assert.equal(normalizeHost('[::1]'), '::1');
    assert.equal(normalizeHost('192.168.1.10.'), '192.168.1.10');
    assert.equal(normalizeHost(123), '');
  });

  test('parseHostList memecah koma dan membuang entri kosong', () => {
    assert.deepEqual(
      [...parseHostList(' 192.168.1.10, ,LOCALHOST,192.168.1.10 ')].sort(),
      ['192.168.1.10', 'localhost'],
    );
    assert.equal(parseHostList('').size, 0);
    assert.equal(parseHostList(undefined).size, 0);
  });
});

describe('#14: resolusi allowlist host', () => {
  test('variabel kanonis dipakai bila diatur', () => {
    const r = resolveDapodikAllowHosts({ [DAPODIK_ALLOW_HOSTS_ENV]: '192.168.1.10' });
    assert.equal(r.canonicalSet, true);
    assert.equal(r.aliasSet, false);
    assert.equal(r.conflict, false);
    assert.ok(r.hosts.has('192.168.1.10'));
  });

  test('variabel alias lama dipakai bila kanonis tidak diatur', () => {
    const r = resolveDapodikAllowHosts({ [DAPODIK_ALLOWED_HOSTS_ENV]: '192.168.1.20' });
    assert.equal(r.canonicalSet, false);
    assert.equal(r.aliasSet, true);
    assert.ok(r.hosts.has('192.168.1.20'));
  });

  test('kanonis menang bila keduanya diatur dengan nilai berbeda', () => {
    const r = resolveDapodikAllowHosts({
      [DAPODIK_ALLOW_HOSTS_ENV]: '192.168.1.10',
      [DAPODIK_ALLOWED_HOSTS_ENV]: '192.168.1.20',
    });
    assert.equal(r.conflict, true);
    assert.ok(r.hosts.has('192.168.1.10'));
    assert.ok(!r.hosts.has('192.168.1.20'));
  });

  test('keduanya diatur dengan nilai sama bukan konflik', () => {
    const r = resolveDapodikAllowHosts({
      [DAPODIK_ALLOW_HOSTS_ENV]: '192.168.1.10',
      [DAPODIK_ALLOWED_HOSTS_ENV]: '192.168.1.10',
    });
    assert.equal(r.conflict, false);
    assert.ok(r.hosts.has('192.168.1.10'));
  });

  test('nilai kosong/whitespace dianggap tidak diatur', () => {
    const r = resolveDapodikAllowHosts({
      [DAPODIK_ALLOW_HOSTS_ENV]: '   ',
      [DAPODIK_ALLOWED_HOSTS_ENV]: '',
    });
    assert.equal(r.canonicalSet, false);
    assert.equal(r.aliasSet, false);
    assert.equal(r.hosts.size, 0);
  });
});

describe('isDapodikHostAllowed', () => {
  test('loopback selalu diizinkan walau allowlist kosong', () => {
    const empty = new Set<string>();
    for (const host of ['localhost', '127.0.0.1', '::1', '[::1]', 'LOCALHOST.', ' localhost ']) {
      assert.equal(isDapodikHostAllowed(host, empty), true, host);
    }
  });

  test('host allowlist diizinkan, host lain ditolak, input bukan string ditolak', () => {
    const allow = new Set(['192.168.1.10']);
    assert.equal(isDapodikHostAllowed('192.168.1.10', allow), true);
    assert.equal(isDapodikHostAllowed('192.168.1.11', allow), false);
    assert.equal(isDapodikHostAllowed('evil.example.com', allow), false);
    assert.equal(isDapodikHostAllowed('', allow), false);
    assert.equal(isDapodikHostAllowed(undefined, allow), false);
    assert.equal(isDapodikHostAllowed(123, allow), false);
  });
});

describe('secretsMatch', () => {
  test('sama persis benar, beda/selisih panjang salah', () => {
    assert.equal(secretsMatch('abc', 'abc'), true);
    assert.equal(secretsMatch('abc', 'abd'), false);
    assert.equal(secretsMatch('abc', 'abcd'), false);
  });
});

describe('isProxySecretConfigured', () => {
  test('kosong dan whitespace dianggap belum terkonfigurasi', () => {
    assert.equal(isProxySecretConfigured({}), false);
    assert.equal(isProxySecretConfigured({ [DAPODIK_PROXY_SECRET_ENV]: '' }), false);
    assert.equal(isProxySecretConfigured({ [DAPODIK_PROXY_SECRET_ENV]: '   ' }), false);
    assert.equal(
      isProxySecretConfigured({ [DAPODIK_PROXY_SECRET_ENV]: TEST_SECRET }),
      true,
    );
  });
});

describe('normalizeDapodikPort', () => {
  test('kosong memakai default 5774; string angka dan number diterima', () => {
    assert.deepEqual(normalizeDapodikPort(undefined), { ok: true, port: 5774 });
    assert.deepEqual(normalizeDapodikPort(null), { ok: true, port: 5774 });
    assert.deepEqual(normalizeDapodikPort(''), { ok: true, port: 5774 });
    assert.deepEqual(normalizeDapodikPort('8080'), { ok: true, port: 8080 });
    assert.deepEqual(normalizeDapodikPort(8080), { ok: true, port: 8080 });
    assert.deepEqual(normalizeDapodikPort('  5774  '), { ok: true, port: 5774 });
  });

  test('port di luar 1-65535 atau bukan angka ditolak', () => {
    for (const bad of ['0', '65536', '-1', 'abc', '80.5', '12a', 0, 65536, 1.5]) {
      const r = normalizeDapodikPort(bad);
      assert.equal(r.ok, false, String(bad));
    }
  });
});

describe('validateDapodikProxyConfig (#14 + #15)', () => {
  test('secret belum diatur memberi peringatan tanpa nilai secret', () => {
    const warnings = validateDapodikProxyConfig({});
    assert.ok(warnings.some((w) => w.includes(DAPODIK_PROXY_SECRET_ENV)));
    assert.ok(!warnings.join('\n').includes(TEST_SECRET));
  });

  test('alias saja memberi peringatan deprecated yang menyebut keduanya', () => {
    const warnings = validateDapodikProxyConfig(
      envWithSecret({ [DAPODIK_ALLOWED_HOSTS_ENV]: '192.168.1.20' }),
    );
    assert.ok(
      warnings.some(
        (w) => w.includes(DAPODIK_ALLOWED_HOSTS_ENV) && w.includes(DAPODIK_ALLOW_HOSTS_ENV),
      ),
    );
  });

  test('konflik memberi peringatan bahwa kanonis yang dipakai', () => {
    const warnings = validateDapodikProxyConfig(
      envWithSecret({
        [DAPODIK_ALLOW_HOSTS_ENV]: '192.168.1.10',
        [DAPODIK_ALLOWED_HOSTS_ENV]: '192.168.1.20',
      }),
    );
    assert.ok(warnings.some((w) => w.includes(DAPODIK_ALLOW_HOSTS_ENV)));
    assert.ok(!warnings.join('\n').includes('192.168.1.10'));
    assert.ok(!warnings.join('\n').includes('192.168.1.20'));
  });

  test('konfigurasi kanonis + secret lengkap tidak memberi peringatan', () => {
    const warnings = validateDapodikProxyConfig(
      envWithSecret({ [DAPODIK_ALLOW_HOSTS_ENV]: '192.168.1.10' }),
    );
    assert.deepEqual(warnings, []);
  });

  test('kanonis diatur tanpa host valid memberi peringatan', () => {
    const warnings = validateDapodikProxyConfig(
      envWithSecret({ [DAPODIK_ALLOW_HOSTS_ENV]: ' , , ' }),
    );
    assert.ok(warnings.some((w) => w.includes(DAPODIK_ALLOW_HOSTS_ENV)));
  });

  test('tidak ada peringatan yang memuat nilai secret', () => {
    const warnings = validateDapodikProxyConfig(
      envWithSecret({ [DAPODIK_ALLOWED_HOSTS_ENV]: '192.168.1.20' }),
    );
    assert.ok(!warnings.join('\n').includes(TEST_SECRET));
  });
});

describe('createDapodikProxyGuard (#15)', () => {
  test('secret belum terkonfigurasi -> 503, tanpa membocorkan apa pun', () => {
    const guard = createDapodikProxyGuard({});
    const { req, res, next, wasNext } = mockReqRes({ secret: 'apa-pun' });
    guard(req, res, next);
    assert.equal(res.statusCode, 503);
    assert.equal(res.payload.success, false);
    assert.equal(wasNext(), false);
  });

  test('header secret tidak ada -> 403', () => {
    const guard = createDapodikProxyGuard(envWithSecret());
    const { req, res, next, wasNext } = mockReqRes({});
    guard(req, res, next);
    assert.equal(res.statusCode, 403);
    assert.equal(wasNext(), false);
  });

  test('secret salah -> 403', () => {
    const guard = createDapodikProxyGuard(envWithSecret());
    const { req, res, next, wasNext } = mockReqRes({ secret: 'salah' });
    guard(req, res, next);
    assert.equal(res.statusCode, 403);
    assert.equal(wasNext(), false);
  });

  test('secret benar + host default -> next(), host dinormalisasi localhost, port default 5774', () => {
    const guard = createDapodikProxyGuard(envWithSecret());
    const { req, res, next, wasNext } = mockReqRes({ secret: TEST_SECRET });
    guard(req, res, next);
    assert.equal(wasNext(), true);
    assert.equal(req.body.host, 'localhost');
    assert.equal(req.body.port, 5774);
  });

  test('secret benar + host tidak diizinkan -> 403', () => {
    const guard = createDapodikProxyGuard(envWithSecret());
    const { req, res, next, wasNext } = mockReqRes({
      secret: TEST_SECRET,
      body: { host: '169.254.169.254' },
    });
    guard(req, res, next);
    assert.equal(res.statusCode, 403);
    assert.equal(wasNext(), false);
  });

  test('secret benar + host dari variabel kanonis -> next()', () => {
    const guard = createDapodikProxyGuard(
      envWithSecret({ [DAPODIK_ALLOW_HOSTS_ENV]: '192.168.1.10' }),
    );
    const { req, res, next, wasNext } = mockReqRes({
      secret: TEST_SECRET,
      body: { host: '192.168.1.10' },
    });
    guard(req, res, next);
    assert.equal(wasNext(), true);
  });

  test('secret benar + host dari variabel alias lama -> next() (kompatibilitas)', () => {
    const guard = createDapodikProxyGuard(
      envWithSecret({ [DAPODIK_ALLOWED_HOSTS_ENV]: '192.168.1.20' }),
    );
    const { req, res, next, wasNext } = mockReqRes({
      secret: TEST_SECRET,
      body: { host: '192.168.1.20' },
    });
    guard(req, res, next);
    assert.equal(wasNext(), true);
  });

  test('kanonis menang atas alias di guard: host alias ditolak bila kanonis diatur', () => {
    const guard = createDapodikProxyGuard(
      envWithSecret({
        [DAPODIK_ALLOW_HOSTS_ENV]: '192.168.1.10',
        [DAPODIK_ALLOWED_HOSTS_ENV]: '192.168.1.20',
      }),
    );
    const denied = mockReqRes({
      secret: TEST_SECRET,
      body: { host: '192.168.1.20' },
    });
    guard(denied.req, denied.res, denied.next);
    assert.equal(denied.res.statusCode, 403);
    assert.equal(denied.wasNext(), false);
  });

  test('port tidak valid -> 400; port string angka dinormalisasi ke number', () => {
    const guard = createDapodikProxyGuard(envWithSecret());
    const bad = mockReqRes({ secret: TEST_SECRET, body: { port: '99999' } });
    guard(bad.req, bad.res, bad.next);
    assert.equal(bad.res.statusCode, 400);
    assert.equal(bad.wasNext(), false);

    const ok = mockReqRes({ secret: TEST_SECRET, body: { port: '8080' } });
    guard(ok.req, ok.res, ok.next);
    assert.equal(ok.wasNext(), true);
    assert.equal(ok.req.body.port, 8080);
  });

  test('respons error tidak pernah memuat nilai secret', () => {
    const guard = createDapodikProxyGuard(envWithSecret());
    const cases = [
      mockReqRes({}),
      mockReqRes({ secret: 'salah' }),
      mockReqRes({ secret: TEST_SECRET, body: { host: '10.0.0.1' } }),
      mockReqRes({ secret: TEST_SECRET, body: { port: 'x' } }),
    ];
    for (const c of cases) {
      guard(c.req, c.res, c.next);
      assert.ok(!JSON.stringify(c.res.payload).includes(TEST_SECRET));
    }
  });

  test('konfigurasi di-snapshot saat guard dibuat; perubahan env sesudahnya butuh restart', () => {
    const env: Record<string, string | undefined> = { ...envWithSecret() };
    const guard = createDapodikProxyGuard(env);
    env[DAPODIK_PROXY_SECRET_ENV] = 'secret-baru-setelah-startup';
    const { req, res, next, wasNext } = mockReqRes({ secret: TEST_SECRET });
    guard(req, res, next);
    assert.equal(wasNext(), true);
  });
});
