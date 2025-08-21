/**
 * Configuración del almacenamiento público.
 * Define las credenciales y el contenedor usado para exponer archivos.
 */
export interface PublicStoreConfig {
  /** Connection string del storage público */
  publicConnectionString: string;
  /** Nombre del contenedor público */
  publicContainerName: string;
  /** Nombre de la cuenta asociada al storage */
  publicAccountName: string;
}

/**
 * Parámetros para exponer un blob privado como público mediante SAS.
 */
export interface ExposePublicBlobParams {
  /** Contenedor privado de origen */
  privateContainerName: string;
  /** Directorio donde se encuentra el archivo */
  directory: string;
  /** Nombre del archivo */
  blobName: string;
  /** Minutos de validez del SAS generado */
  expirationMinutes: number;
  /** Si true, incluye el archivo en Base64 en la respuesta */
  includeBase64: boolean;
}

/**
 * Resultado al exponer un blob públicamente con SAS.
 */
export interface ExposePublicBlobResult {
  /** Token SAS generado */
  sasToken: string;
  /** URL de acceso público con SAS */
  sasUrl: string;
  /** Permisos asociados al SAS */
  permissions: string;
  /** Fecha y hora de expiración */
  expiresOn: Date;
  /** Archivo en Base64 (opcional) */
  fileBase64?: string;
  /** Tipo de contenido del archivo */
  contentType: string;
  /** Contenedor donde está el archivo */
  containerName: string;
  /** Nombre del archivo */
  blobName: string;
  /** Ruta completa dentro del contenedor */
  fullPath: string;
  /** Tamaño en bytes */
  size: number;
  /** ID único de la solicitud */
  requestId: string;
}

/**
 * Información básica del contenido de un blob.
 */
export interface BlobContentInfo {
  /** Tipo de contenido (MIME) */
  contentType: string;
  /** Tamaño en bytes */
  size: number;
  /** Datos binarios opcionales */
  data?: Buffer;
}
