// ---------------- Ekspor Excel (.xlsx) via SheetJS ----------------
// SheetJS dimuat DINAMIS (import()) agar ±800KB-nya menjadi chunk terpisah
// yang hanya diunduh saat tombol Excel diklik — bundel utama tidak membengkak.

export interface LembarExcel {
  /** Nama sheet (maks 31 karakter, tanpa [ ] : * ? / \). */
  nama: string;
  /** Baris per baris (baris pertama = header). */
  baris: (string | number)[][];
  /** Lebar kolom (karakter). Bila kosong dihitung otomatis. */
  lebar?: number[];
}

export type SelExcel = string | number;

function sanitasiNamaSheet(nama: string): string {
  const bersih = (nama || 'Sheet1').replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31);
  return bersih || 'Sheet1';
}

function hitungLebar(baris: SelExcel[][]): number[] {
  const nKol = Math.max(0, ...baris.map((r) => r.length));
  const lebar: number[] = [];
  for (let c = 0; c < nKol; c++) {
    let maks = 10;
    for (const r of baris) {
      const v = r[c];
      const len = String(v ?? '').length;
      if (len > maks) maks = len;
    }
    lebar.push(Math.min(48, maks + 2));
  }
  return lebar;
}

/** Bangun workbook (murni, dapat diuji di Node). */
export async function buatWorkbook(lembar: LembarExcel[]): Promise<{ XLSX: typeof import('xlsx'); wb: import('xlsx').WorkBook }> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const pakai: string[] = [];
  for (const l of lembar) {
    let nama = sanitasiNamaSheet(l.nama);
    let i = 2;
    while (pakai.includes(nama)) nama = sanitasiNamaSheet(`${l.nama} ${i++}`);
    pakai.push(nama);
    const ws = XLSX.utils.aoa_to_sheet(l.baris as unknown[][]);
    ws['!cols'] = (l.lebar || hitungLebar(l.baris)).map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, nama);
  }
  return { XLSX, wb };
}

/** Unduh 1+ sheet sebagai file .xlsx. */
export async function unduhExcel(namaFile: string, lembar: LembarExcel[]): Promise<void> {
  if (!lembar || lembar.length === 0) throw new Error('Tidak ada data untuk diekspor.');
  const { XLSX, wb } = await buatWorkbook(lembar);
  const akhir = namaFile.endsWith('.xlsx') ? namaFile : `${namaFile}.xlsx`;
  XLSX.writeFile(wb, akhir);
}
