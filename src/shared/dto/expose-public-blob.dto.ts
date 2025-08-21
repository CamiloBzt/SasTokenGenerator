import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO para exponer un blob privado como público mediante un SAS Token temporal.
 */
export class ExposePublicBlobDto {
  /**
   * Nombre del contenedor donde está almacenado el archivo (en el store privado).
   * @example "contenedor"
   */
  @ApiProperty({
    description: 'Nombre del contenedor en el store privado',
    example: 'contenedor',
  })
  containerName: string;

  /**
   * Nombre del archivo dentro del contenedor.
   * @example "archivo.pdf"
   */
  @ApiProperty({
    description: 'Nombre del archivo',
    example: 'archivo.pdf',
  })
  blobName: string;

  /**
   * Directorio dentro del contenedor donde se encuentra el blob.
   * @example "directorio/2000000000"
   */
  @ApiProperty({
    description: 'Ruta del directorio',
    example: 'directorio/2000000000',
  })
  directory: string;

  /**
   * Tiempo de vida del SAS Token en minutos.
   * - Mínimo: 1 minuto
   * - Máximo: 10080 minutos (7 días)
   * @default 60
   * @example 60
   */
  @ApiProperty({
    description: 'Minutos hasta la expiración del token',
    example: 60,
    default: 60,
    minimum: 1,
    maximum: 10080, // 7 días
  })
  expirationMinutes?: number = 60;

  /**
   * Indica si el contenido debe devolverse como Base64.
   * - `true`: el backend retorna el archivo codificado en Base64.
   * - `false`: el backend retorna la URL temporal con SAS Token.
   * @default false
   * @example true
   */
  @ApiProperty({
    description: 'Si devolver el contenido en Base64',
    example: true,
    default: false,
  })
  base64?: boolean = false;

  /**
   * Estrategia para exponer el archivo:
   * - `true`: usa copia directa (más eficiente y recomendado).
   * - `false`: usa descarga/subida interna (método legacy).
   * @default true
   * @example true
   */
  @ApiProperty({
    description:
      'Si usar copia directa (true, por defecto y más eficiente) o descarga/subida (false, método legacy)',
    example: true,
    default: true,
  })
  useDirectCopy?: boolean = true;
}
