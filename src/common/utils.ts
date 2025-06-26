import { ErrorMessages } from '@src/shared/enums/error-messages.enum';
import { BlobInfo } from '@src/shared/interfaces/services/blob-storage/list-blobs.interface';
import { Request } from 'express';

/**
 * Extrae el nombre del contenedor y del blob a partir de la URL.
 */
export function getBlobInfoFromUrl(blobUrl: string): {
  containerName: string;
  blobName: string;
} {
  try {
    const url = new URL(blobUrl);
    const [, containerName, ...blobParts] = url.pathname.split('/');
    const blobName = blobParts.join('/');
    if (!containerName || !blobName) {
      throw new Error('CONTAINER_OR_BLOB_MISSING');
    }
    return { containerName, blobName };
  } catch (error) {
    console.error('Error parsing blob URL:', error);
    throw new Error(ErrorMessages.URL_INVALID);
  }
}

/**
 * Extrae la dirección IP del cliente de la solicitud.
 */
export function extractClientIp(req: Request): string | undefined {
  const forwarded = req.headers['x-forwarded-for'];
  const rawIp =
    typeof forwarded === 'string'
      ? forwarded.split(',')[0].trim()
      : req.socket.remoteAddress;
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$|^::1$|^\[?([a-fA-F0-9:]+)\]?$/;
  return rawIp && ipRegex.test(rawIp) ? rawIp : undefined;
}

/**
 * Valida si la IP es válida (IPv4 o IPv6).
 */
export function isValidIp(ip: string): boolean {
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$|^::1$|^\[?([a-fA-F0-9:]+)\]?$/; // IPv4 o IPv6
  return ipRegex.test(ip);
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function enrichBlob<T extends BlobInfo>(blob): { enriched: T; size: number } {
  // Extraer información del path
  const pathParts = blob.name.split('/');
  const fileName = pathParts[pathParts.length - 1];
  const blobDirectory =
    pathParts.length > 1 ? pathParts.slice(0, -1).join('/') : undefined;
  const fileExtension = fileName.includes('.')
    ? fileName.substring(fileName.lastIndexOf('.'))
    : undefined;

  // Formatear tamaño
  const size = blob.properties?.contentLength ?? 0;
  const sizeFormatted = formatFileSize(size);

  // Construir objeto base
  const baseBlob: BlobInfo = {
    name: blob.name,
    fileName,
    directory: blobDirectory,
    fileExtension,
    size,
    sizeFormatted,
    contentType: blob.properties?.contentType,
    lastModified: blob.properties?.lastModified ?? new Date(),
    etag: blob.properties?.etag,
  };

  return { enriched: baseBlob as T, size };
}

export function processEnrichedBlobs<T extends BlobInfo>(
  blobItems,
): {
  enrichedBlobs: T[];
  totalSize: number;
} {
  const enrichedBlobs: T[] = [];
  let totalSize = 0;

  for (const blob of blobItems) {
    const { enriched, size } = enrichBlob<T>(blob);
    enrichedBlobs.push(enriched);
    totalSize += size;
  }

  return { enrichedBlobs, totalSize };
}
