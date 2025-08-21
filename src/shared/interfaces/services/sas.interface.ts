import { SasPermission } from '@src/shared/enums/sas-permission.enum';

/**
 * Parámetros para generar un SAS token.
 */
export interface SasGenerationParams {
  /** Nombre del contenedor */
  containerName: string;
  /** Nombre del archivo/blob (opcional) */
  fileName?: string;
  /** Permisos a otorgar en el SAS (opcional) */
  permissions?: SasPermission[];
  /** Minutos hasta la expiración (opcional) */
  expirationMinutes?: number;
  /** IP del usuario que usará el SAS (opcional) */
  userIp?: string;
}

/**
 * Resultado de la generación de un SAS token.
 */
export interface SasGenerationResult {
  /** Token SAS generado */
  sasToken: string;
  /** URL completa con el SAS */
  sasUrl: string;
  /** Permisos otorgados en formato string */
  permissions: string;
  /** Fecha y hora de expiración */
  expiresOn: Date;
  /** Contenedor asociado */
  containerName: string;
  /** Nombre del blob (si aplica) */
  blobName?: string;
  /** ID único de la solicitud */
  requestId: string;
}
