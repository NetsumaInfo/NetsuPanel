import JSZip from 'jszip';

export interface ZipEntry {
  path: string;
  bytes: ArrayBuffer;
}

export async function buildZipBlob(entries: ZipEntry[], mime: string): Promise<Blob> {
  const zip = new JSZip();
  entries.forEach((entry) => {
    zip.file(entry.path, new Uint8Array(entry.bytes));
  });

  return zip.generateAsync({
    type: 'blob',
    mimeType: mime,
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}
