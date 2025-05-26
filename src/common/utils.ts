import { ErrorMessages } from '@src/shared/enums/error-messages.enum';
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
