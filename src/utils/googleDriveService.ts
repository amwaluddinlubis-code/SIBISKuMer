// Google Drive v3 REST API Helper for Backup & Restore

export interface DriveBackupFile {
  id: string;
  name: string;
  createdTime: string;
  modifiedTime: string;
  size?: string;
  description?: string;
}

const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';

/**
 * List backup files created by this app in Google Drive
 */
export async function listDriveBackups(accessToken: string): Promise<DriveBackupFile[]> {
  const query = encodeURIComponent("name contains 'Backup_BukuInduk' and trashed = false");
  const url = `${DRIVE_FILES_URL}?q=${query}&fields=files(id,name,createdTime,modifiedTime,size,description)&orderBy=createdTime desc`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gagal mengambil daftar cadangan dari Google Drive (${response.status}): ${errText}`);
  }

  const data = await response.json();
  return data.files || [];
}

/**
 * Upload a JSON database backup file to Google Drive using multipart upload
 */
export async function uploadBackupToDrive(
  accessToken: string,
  fileName: string,
  jsonData: string,
  description?: string
): Promise<DriveBackupFile> {
  const metadata = {
    name: fileName,
    mimeType: 'application/json',
    description: description || 'Cadangan Database Buku Induk Siswa Kurikulum Merdeka'
  };

  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    jsonData +
    closeDelimiter;

  const response = await fetch(DRIVE_UPLOAD_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`
    },
    body: multipartRequestBody
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gagal mengunggah cadangan ke Google Drive (${response.status}): ${errText}`);
  }

  return await response.json();
}

/**
 * Download a backup file content from Google Drive by file ID
 */
export async function downloadBackupFromDrive(accessToken: string, fileId: string): Promise<string> {
  const url = `${DRIVE_FILES_URL}/${fileId}?alt=media`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gagal mengunduh file cadangan dari Google Drive (${response.status}): ${errText}`);
  }

  return await response.text();
}

/**
 * Delete a backup file in Google Drive
 */
export async function deleteBackupFromDrive(accessToken: string, fileId: string): Promise<boolean> {
  const url = `${DRIVE_FILES_URL}/${fileId}`;

  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gagal menghapus file dari Google Drive (${response.status}): ${errText}`);
  }

  return true;
}
