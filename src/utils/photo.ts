// Util foto siswa: crop tengah rasio 4:6 + kompres hingga <= 500 KB.
// Disimpan sebagai dataURL JPEG di `Siswa.fotoUrl` (tetap di IndexedDB).

export const PHOTO_ASPECT_W = 4;
export const PHOTO_ASPECT_H = 6;
export const PHOTO_MAX_W = 480;
export const PHOTO_MAX_H = 720;
export const MAX_PHOTO_BYTES = 500 * 1024;
/** Batas file mentah sebelum diproses (agar kanvas tidak jebol memori). */
export const MAX_RAW_PHOTO_BYTES = 8 * 1024 * 1024;
/** Logo kop: sisi terpanjang dibatasi 512px, tanpa crop paksa. */
export const LOGO_MAX_DIM = 512;
export const MAX_LOGO_BYTES = 500 * 1024;
/** Foto mini cloud: sisi terpanjang 240px, target ≤ 60 KB (muat di dokumen Firestore). */
export const MINI_CLOUD_DIM = 240;
export const MAX_MINI_CLOUD_BYTES = 60 * 1024;

export function formatKb(bytes: number): string {
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Validasi awal file; null = lolos. */
export function validatePhotoFile(file: File): string | null {
  if (!file) return 'Tidak ada file yang dipilih.';
  if (!file.type || !file.type.startsWith('image/'))
    return 'File harus berupa gambar (JPG/PNG/WebP).';
  if (file.size > MAX_RAW_PHOTO_BYTES)
    return `Ukuran file ${formatKb(file.size)} melebihi batas ${formatKb(MAX_RAW_PHOTO_BYTES)}. Kecilkan dulu sebelum mengunggah.`;
  return null;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('File gambar tidak dapat dibaca atau rusak.'));
    };
    img.src = url;
  });
}

function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Data foto tidak dapat dibaca.'));
    img.src = dataUrl;
  });
}

/**
 * Kecilkan data-URL foto menjadi mini JPEG (sisi terpanjang 240px,
 * target ≤ 60 KB) untuk sinkron cloud via Firestore — tanpa Storage.
 * Mengembalikan null bila gagal (pemanggil memakai mode tanpa-foto).
 */
export async function buatFotoMiniCloud(dataUrl: string): Promise<{ dataUrl: string; bytes: number } | null> {
  try {
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return null;
    const img = await loadImageFromDataUrl(dataUrl);
    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;
    if (!srcW || !srcH) return null;
    const scale = Math.min(1, MINI_CLOUD_DIM / Math.max(srcW, srcH));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(2, Math.round(srcW * scale));
    canvas.height = Math.max(2, Math.round(srcH * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    let quality = 0.7;
    let blob = await canvasToBlob(canvas, quality);
    while (blob && blob.size > MAX_MINI_CLOUD_BYTES && quality > 0.42) {
      quality = Math.max(0.4, quality - 0.1);
      blob = await canvasToBlob(canvas, quality);
    }
    if (!blob || blob.size > MAX_MINI_CLOUD_BYTES) return null;
    return { dataUrl: await blobToDataUrl(blob), bytes: blob.size };
  } catch {
    return null;
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Gagal membaca hasil kompresi foto.'));
    r.readAsDataURL(blob);
  });
}

/**
 * Crop tengah ke rasio 4:6, skala ke maksimal 480x720, lalu kompres JPEG
 * bertahap hingga ukuran <= 500 KB. Melempar Error bila gagal.
 */
export async function processStudentPhoto(file: File): Promise<{ dataUrl: string; bytes: number }> {
  const early = validatePhotoFile(file);
  if (early) throw new Error(early);

  const img = await loadImage(file);
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  if (!srcW || !srcH) throw new Error('Dimensi gambar tidak terbaca.');

  // Kotak crop tengah berasio 4:6 seluas mungkin dari sumber.
  const targetRatio = PHOTO_ASPECT_W / PHOTO_ASPECT_H;
  let cropW = srcW;
  let cropH = Math.round(cropW / targetRatio);
  if (cropH > srcH) {
    cropH = srcH;
    cropW = Math.round(cropH * targetRatio);
  }
  const cropX = Math.round((srcW - cropW) / 2);
  const cropY = Math.round((srcH - cropH) / 2);

  // Skala ke batas maksimum (tidak pernah diperbesar).
  const scale = Math.min(1, PHOTO_MAX_W / cropW, PHOTO_MAX_H / cropH);
  const outW = Math.max(2, Math.round(cropW * scale));
  const outH = Math.max(2, Math.round(cropH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Browser tidak mendukung pengolahan gambar (canvas).');
  // Latar putih agar JPEG tidak berlatar hitam untuk PNG transparan.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, outW, outH);
  ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, outW, outH);

  // Turunkan kualitas hingga <= 500 KB.
  let quality = 0.92;
  let blob = await canvasToBlob(canvas, quality);
  while (blob && blob.size > MAX_PHOTO_BYTES && quality > 0.42) {
    quality = Math.max(0.4, quality - 0.12);
    blob = await canvasToBlob(canvas, quality);
  }
  if (!blob) throw new Error('Gagal mengompresi foto.');
  if (blob.size > MAX_PHOTO_BYTES)
    throw new Error(
      `Hasil kompresi masih ${formatKb(blob.size)} (> 500 KB). Gunakan foto yang lebih sederhana.`
    );

  const dataUrl = await blobToDataUrl(blob);
  return { dataUrl, bytes: blob.size };
}

/**
 * Proses logo kop (JPG/PNG/WebP): skala proporsional (sisi terpanjang 512px,
 * tidak di-crop). Transparansi dipertahankan (PNG) selama muat ≤ 500 KB —
 * bila tidak muat, diekspor JPEG dengan matte putih sehingga tampak
 * menyatu/transparan di atas kertas putih (JPEG tidak mengenal alpha;
 * tanpa matte, area transparan akan menjadi HITAM).
 */
export async function processLogoImage(file: File): Promise<{ dataUrl: string; bytes: number }> {
  if (!file) throw new Error('Tidak ada file yang dipilih.');
  if (!file.type || !file.type.startsWith('image/'))
    throw new Error('File harus berupa gambar (JPG/PNG/WebP).');
  if (file.size > MAX_RAW_PHOTO_BYTES)
    throw new Error(`Ukuran file ${formatKb(file.size)} melebihi batas ${formatKb(MAX_RAW_PHOTO_BYTES)}.`);

  const img = await loadImage(file);
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  if (!srcW || !srcH) throw new Error('Dimensi gambar tidak terbaca.');

  const drawScaled = (maxDim: number): HTMLCanvasElement => {
    const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(2, Math.round(srcW * scale));
    canvas.height = Math.max(2, Math.round(srcH * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Browser tidak mendukung pengolahan gambar (canvas).');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  };
  const pngBlob = (canvas: HTMLCanvasElement): Promise<Blob | null> =>
    new Promise((res) => canvas.toBlob((b) => res(b), 'image/png'));

  // 1. File asli kecil: teruskan apa adanya (transparansi 100% utuh).
  if (file.size <= MAX_LOGO_BYTES && (file.type === 'image/png' || file.type === 'image/webp')) {
    const direct = await blobToDataUrl(file);
    return { dataUrl: direct, bytes: file.size };
  }

  // 2. PNG hasil skala (transparan) — coba 512 lalu susutkan hingga muat.
  for (const dim of [LOGO_MAX_DIM, 384, 256]) {
    const canvas = drawScaled(dim);
    const blob = await pngBlob(canvas);
    if (blob && blob.size <= MAX_LOGO_BYTES) {
      return { dataUrl: await blobToDataUrl(blob), bytes: blob.size };
    }
  }

  // 3. Terakhir: JPEG + matte putih (area transparan jadi putih, bukan hitam).
  const base = drawScaled(LOGO_MAX_DIM);
  const matte = document.createElement('canvas');
  matte.width = base.width;
  matte.height = base.height;
  const mctx = matte.getContext('2d');
  if (!mctx) throw new Error('Browser tidak mendukung pengolahan gambar (canvas).');
  mctx.fillStyle = '#ffffff';
  mctx.fillRect(0, 0, matte.width, matte.height);
  mctx.drawImage(base, 0, 0);

  let quality = 0.92;
  let blob = await canvasToBlob(matte, quality);
  while (blob && blob.size > MAX_LOGO_BYTES && quality > 0.42) {
    quality = Math.max(0.4, quality - 0.12);
    blob = await canvasToBlob(matte, quality);
  }
  if (!blob) throw new Error('Gagal mengompresi logo.');
  if (blob.size > MAX_LOGO_BYTES)
    throw new Error(`Hasil kompresi masih ${formatKb(blob.size)} (> 500 KB).`);
  return { dataUrl: await blobToDataUrl(blob), bytes: blob.size };
}
