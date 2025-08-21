import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO para listar blobs en el **almacenamiento público**.
 */
export class ListPublicBlobsDto {
  /**
   * Ruta del directorio dentro del almacenamiento público.
   * - Si se omite, se listarán todos los blobs en la raíz pública.
   * - Si se especifica, solo se listarán los archivos dentro de esa ruta.
   *
   * @example "afiliaciones/2000000005"
   */
  @ApiProperty({
    description: 'Ruta del directorio en el store público (opcional)',
    example: 'afiliaciones/2000000005',
    required: false,
  })
  directory?: string;
}
