import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO para la operación de eliminación de blobs.
 */
export class DeleteBlobDto {
  /**
   * Nombre del contenedor donde se encuentra el archivo a eliminar.
   *
   * Ejemplo: `"uploads"`
   */
  @ApiProperty({
    description: 'Nombre del contenedor',
    example: 'uploads',
  })
  containerName: string;

  /**
   * Nombre del archivo a eliminar (sin incluir la ruta del directorio).
   *
   * Ejemplo: `"archivo.pdf"`
   */
  @ApiProperty({
    description: 'Nombre del archivo a eliminar',
    example: 'archivo.pdf',
  })
  blobName: string;

  /**
   * Ruta opcional del directorio donde se encuentra el archivo.
   *
   * Si no se especifica, se asume la raíz del contenedor.
   * Ejemplo: `"documentos/2024"`
   */
  @ApiProperty({
    description: 'Ruta del directorio (opcional)',
    example: 'documentos/2024',
    required: false,
  })
  directory?: string;
}
