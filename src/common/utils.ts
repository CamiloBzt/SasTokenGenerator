import { ErrorMessages } from '@src/shared/enums/error-messages.enum';
import { BlobInfo } from '@src/shared/interfaces/services/blob-storage/list-blobs.interface';
import { Request } from 'express';

/**
 * @fileoverview
 * Utilidades para trabajar con Azure Blob Storage y peticiones HTTP en un
 * proyecto NestJS. Incluye:
 * - Parseo de URLs de blobs.
 * - Extracción y validación de IPs de cliente.
 * - Formateo de tamaños de archivo.
 * - Enriquecimiento de ítems de blob con metadatos calculados.
 *
 * Las funciones están tipadas para integrarse con `BlobInfo` y con la
 * forma común que expone el SDK de Azure al listar blobs (propiedad `name`
 * y un objeto `properties` con metadatos).
 *
 * @module common/utils.ts
 */

/**
 * Extrae el nombre del contenedor y del blob a partir de la URL de un blob.
 *
 * @param {string} blobUrl - URL completa del blob (p. ej. `https://<account>.blob.core.windows.net/<container>/<path/to/blob.ext>`).
 * @returns {{ containerName: string, blobName: string }} Objeto con el nombre del contenedor y la ruta/nombre del blob.
 * @throws {Error} Lanza `Error(ErrorMessages.URL_INVALID)` si la URL no es válida o no se puede parsear.
 * @throws {Error} Lanza `Error('CONTAINER_OR_BLOB_MISSING')` si la URL no contiene contenedor y/o blob.
 *
 * @example
 * getBlobInfoFromUrl('https://acc.blob.core.windows.net/docs/reports/2025/summary.pdf')
 * // => { containerName: 'docs', blobName: 'reports/2025/summary.pdf' }
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
 * Obtiene la IP del cliente a partir de la solicitud HTTP.
 *
 * Prioriza el encabezado `x-forwarded-for` (útil detrás de proxies/balancers)
 * y como respaldo usa `req.socket.remoteAddress`. Valida IPv4 e IPv6 (incluye `::1`).
 *
 * @param {Request} req - La solicitud Express.
 * @returns {string|undefined} La IP validada (IPv4/IPv6) o `undefined` si no se pudo validar.
 *
 * @example
 * const ip = extractClientIp(req);
 * if (!ip) logger.warn('No se pudo inferir IP del cliente');
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
 * Verifica si una dirección IP es válida (IPv4 o IPv6).
 *
 * @param {string} ip - Dirección IP a validar.
 * @returns {boolean} `true` si la IP cumple con el patrón IPv4/IPv6; `false` en caso contrario.
 *
 * @example
 * isValidIp('192.168.0.1') // true
 * isValidIp('::1')         // true
 * isValidIp('999.0.0.1')   // false
 */
export function isValidIp(ip: string): boolean {
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$|^::1$|^\[?([a-fA-F0-9:]+)\]?$/; // IPv4 o IPv6
  return ipRegex.test(ip);
}

/**
 * Convierte un tamaño en bytes a una cadena legible (B, KB, MB, GB, TB) con 2 decimales.
 *
 * @param {number} bytes - Tamaño en bytes.
 * @returns {string} Tamaño formateado (p. ej. `1.23 MB`).
 *
 * @example
 * formatFileSize(0)          // '0 B'
 * formatFileSize(1536)       // '1.5 KB'
 * formatFileSize(1048576)    // '1 MB'
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Enriquecimiento interno de un ítem de blob con metadatos derivados.
 *
 * - Separa `fileName`, `directory` y `fileExtension` a partir de `blob.name`.
 * - Calcula `sizeFormatted`.
 * - Preserva metadatos estándar de Azure (`contentType`, `lastModified`, `etag`).
 *
 * **Nota:** Esta función asume una forma mínima de `blob` compatible con el SDK de Azure
 * al listar blobs (`name` y `properties`).
 *
 * @template T
 * @param {Object} blob - Ítem de blob de Azure o forma equivalente.
 * @param {string} blob.name - Nombre completo del blob (incluye ruta).
 * @param {Object} [blob.properties] - Metadatos del blob.
 * @param {number} [blob.properties.contentLength] - Tamaño del blob en bytes.
 * @param {string} [blob.properties.contentType] - Tipo MIME.
 * @param {Date}   [blob.properties.lastModified] - Fecha de última modificación.
 * @param {string} [blob.properties.etag] - ETag del blob.
 * @returns {{ enriched: T, size: number }} Objeto con el blob enriquecido (compatible con `BlobInfo`) y el tamaño en bytes.
 *
 * @example
 * const { enriched, size } = enrichBlob({ name: 'dir/file.txt', properties: { contentLength: 123 }});
 * // enriched.sizeFormatted === '123 B'
 * // enriched.fileExtension === '.txt'
 * // enriched.directory === 'dir'
 * @internal
 */
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

/**
 * Procesa un arreglo de blobs y produce una lista de blobs enriquecidos más el tamaño total.
 *
 * Utiliza {@link enrichBlob} para derivar:
 * - `fileName`, `directory`, `fileExtension`
 * - `size`, `sizeFormatted`
 * - Metadatos: `contentType`, `lastModified`, `etag`
 *
 * @template T
 * @param {Array<Object>} blobItems - Ítems de blob devueltos por Azure (o forma equivalente).
 * @returns {{ enrichedBlobs: T[], totalSize: number }}
 * - `enrichedBlobs`: Lista de blobs con forma `BlobInfo`.
 * - `totalSize`: Suma de `contentLength` (en bytes) de todos los blobs.
 *
 * @example
 * const { enrichedBlobs, totalSize } = processEnrichedBlobs(listResponse.segment.blobItems);
 * console.log(`Total: ${formatFileSize(totalSize)}`);
 */
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
