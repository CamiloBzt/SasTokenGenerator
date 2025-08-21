import { ApiProperty } from '@nestjs/swagger';
import { SasPermission } from '../enums/sas-permission.enum';

/**
 * DTO para la generación de un SAS Token en Azure Blob Storage.
 */
export class GenerateSasTokenDto {
  /**
   * Nombre del contenedor de Azure Blob Storage.
   * @example "uploads"
   */
  @ApiProperty({
    description: 'Nombre del contenedor',
    example: 'uploads',
  })
  containerName: string;

  /**
   * Nombre del archivo o ruta específica sobre la que se generará el SAS.
   * - Opcional: si se omite, el token puede aplicarse a todo el contenedor.
   * @example "document.pdf"
   */
  @ApiProperty({
    description: 'Nombre del archivo o ruta (opcional)',
    example: 'document.pdf',
    required: false,
  })
  fileName?: string;

  /**
   * Carpeta dentro del contenedor donde se aplicará el SAS.
   * - Opcional: útil cuando se desea restringir a un directorio específico.
   * @example "folios"
   */
  @ApiProperty({
    description: 'Ruta de la carpeta (opcional)',
    example: 'folios',
    required: false,
  })
  folderPath?: string;

  /**
   * Lista de permisos asignados al token.
   * Valores disponibles: `READ`, `WRITE`, `DELETE`, `LIST`, etc.
   * (según tu enum `SasPermission`)
   * @example [SasPermission.READ, SasPermission.WRITE]
   */
  @ApiProperty({
    description: 'Permisos para el SAS token',
    example: [SasPermission.READ, SasPermission.WRITE],
    enum: SasPermission,
    isArray: true,
  })
  permissions: SasPermission[];

  /**
   * Tiempo de vida del token en minutos.
   * - Mínimo: 1 minuto
   * - Máximo: 10080 minutos (7 días)
   * @example 60
   */
  @ApiProperty({
    description: 'Minutos hasta la expiración del token',
    example: 60,
    minimum: 1,
    maximum: 10080, // 7 días
  })
  expirationMinutes: number;

  /**
   * Dirección IP del usuario a quien se restringe el acceso.
   * - Opcional: si se define, solo esa IP podrá usar el SAS Token.
   * @example "127.0.0.1"
   */
  @ApiProperty({
    description: 'IP del usuario (opcional)',
    example: '127.0.0.1',
    required: false,
  })
  userIp?: string;
}
