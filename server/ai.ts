// ---------------- PROXY PROVIDER AI EKSTERNAL (Issue #13) ----------------
// Kunci API HANYA dibaca dari environment proses server — tidak pernah dari
// body request, database, bundle klien, atau log. Variabel yang dipakai:
//   SIBISKUMER_AI_PROVIDER  — nama provider, kosong = eksternal nonaktif.
//   SIBISKUMER_AI_URL       — endpoint chat-completions (kompatibel OpenAI).
//   SIBISKUMER_AI_API_KEY   — kunci rahasia (jangan commit ke repo!).
//   SIBISKUMER_AI_MODEL     — opsional.
//   SIBISKUMER_AI_TIMEOUT_MS — default 30000.
// Env dibaca SAAT PANGGIL (bukan saat import) agar dapat diuji dan diubah
// tanpa restart modul. Fungsi ini TIDAK PERNAH mencatat prompt/keluaran.
export type KegagalanProvider =
  | 'tidak-dikonfigurasi'
  | 'timeout'
  | 'kuota'
  | 'tidak-tersedia'
  | 'keluaran-tidak-valid';

export interface KonfigurasiAi {
  provider: string;
  url: string;
  model: string;
  timeoutMs: number;
  adaKunci: boolean;
}

export function bacaKonfigurasiAi(): KonfigurasiAi {
  const timeout = Number(process.env.SIBISKUMER_AI_TIMEOUT_MS || 30000);
  return {
    provider: (process.env.SIBISKUMER_AI_PROVIDER || '').trim(),
    url: (process.env.SIBISKUMER_AI_URL || '').trim(),
    model: (process.env.SIBISKUMER_AI_MODEL || '').trim(),
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 30000,
    adaKunci: !!(process.env.SIBISKUMER_AI_API_KEY || '').trim(),
  };
}

const SISTEM_PROMPT =
  'Anda membantu administrasi sekolah. Jangan mengarang data, nomor surat, ' +
  'peraturan, atau fakta siswa. Jangan menyebut identitas siapa pun. ' +
  'Jawab ringkas dalam Bahasa Indonesia.';

/** Panggil provider eksternal. Gagal apa pun → objek gagal (pemanggil memakai fallback lokal). */
export async function polesDenganProvider(
  prompt: string
): Promise<{ teks: string } | { gagal: KegagalanProvider; pesan: string }> {
  const cfg = bacaKonfigurasiAi();
  if (!cfg.provider || !cfg.url || !cfg.adaKunci) {
    return { gagal: 'tidak-dikonfigurasi', pesan: 'Provider eksternal belum dikonfigurasi di server.' };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
  try {
    const res = await fetch(cfg.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.SIBISKUMER_AI_API_KEY}`,
      },
      body: JSON.stringify({
        model: cfg.model || undefined,
        messages: [
          { role: 'system', content: SISTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
      }),
      signal: ctrl.signal,
    });
    if (res.status === 429) {
      return { gagal: 'kuota', pesan: 'Kuota provider habis / dibatasi (HTTP 429).' };
    }
    if (!res.ok) {
      return { gagal: 'tidak-tersedia', pesan: `Provider menjawab HTTP ${res.status}.` };
    }
    const data: any = await res.json().catch(() => null);
    const teks = data?.choices?.[0]?.message?.content ?? data?.text ?? null;
    if (typeof teks !== 'string' || teks.trim().length === 0 || teks.length > 8000) {
      return { gagal: 'keluaran-tidak-valid', pesan: 'Keluaran provider kosong atau tidak valid.' };
    }
    return { teks: teks.trim() };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return { gagal: 'timeout', pesan: `Provider timeout (${cfg.timeoutMs} ms).` };
    }
    return { gagal: 'tidak-tersedia', pesan: 'Provider tidak dapat dihubungi.' };
  } finally {
    clearTimeout(timer);
  }
}
