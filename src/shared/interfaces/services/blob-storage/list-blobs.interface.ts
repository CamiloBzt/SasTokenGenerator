/**
 * Información detallada de un blob en el almacenamiento.
 */
export interface BlobInfo {
  /** Nombre único del blob dentro del contenedor */
  name: string;
  /** Nombre del archivo original */
  fileName: string;
  /** Directorio donde se encuentra (opcional) */
  directory?: string;
  /** Extensión del archivo (opcional) */
  fileExtension?: string;
  /** Tamaño en bytes */
  size: number;
  /** Tamaño en formato legible (ej. "2 MB") */
  sizeFormatted: string;
  /** Tipo MIME (opcional) */
  contentType?: string;
  /** Fecha de última modificación */
  lastModified: Date;
  /** Identificador de versión del blob (opcional) */
  etag?: string;
}

/**
 * Respuesta al listar blobs dentro de un contenedor/directorio.
 */
export interface BlobListResponse {
  /** Lista de blobs encontrados */
  blobs: BlobInfo[];
  /** Nombre del contenedor */
  containerName: string;
  /** Directorio de búsqueda (opcional) */
  directory?: string;
  /** Total de blobs encontrados */
  totalBlobs: number;
  /** Tamaño total en bytes */
  totalSize: number;
  /** Tamaño total en formato legible */
  totalSizeFormatted: string;
  /** ID único de la solicitud */
  requestId: string;
}
