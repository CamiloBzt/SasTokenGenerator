import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO para la operación de copiado de blobs.
 */
export class CopyBlobDto {
  /**
   * Nombre del contenedor en el que se encuentran los blobs.
   *
   * Ejemplo: `"uploads"`
   */
  @ApiProperty({
    description: 'Nombre del contenedor',
    example: 'uploads',
  })
  containerName: string;

  /**
   * Ruta completa (con directorios) del blob origen.
   *
   * Incluye subdirectorios si aplica.
   * Ejemplo: `"documentos/2024/documento-original.pdf"`
   */
  @ApiProperty({
    description: 'Ruta completa del archivo origen (incluyendo directorios)',
    example: 'documentos/2024/documento-original.pdf',
  })
  sourceBlobPath: string;

  /**
   * Ruta completa (con directorios) del blob destino.
   *
   * Puede estar en la misma carpeta, en otra dentro del mismo contenedor,
   * o incluso en otro contenedor (si se indica en el servicio).
   *
   * Ejemplo: `"backup/documentos/documento-copia.pdf"`
   */
  @ApiProperty({
    description: 'Ruta completa del archivo destino (incluyendo directorios)',
    example: 'backup/documentos/documento-copia.pdf',
  })
  destinationBlobPath: string;
}
