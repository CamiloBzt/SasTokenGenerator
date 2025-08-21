import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO para mover un blob dentro de un contenedor en Azure Blob Storage.
 */
export class MoveBlobDto {
  /**
   * Nombre del contenedor en Azure Blob Storage.
   *
   * Ejemplo: "uploads"
   */
  @ApiProperty({
    description: 'Nombre del contenedor',
    example: 'uploads',
  })
  containerName: string;

  /**
   * Ruta completa del archivo origen dentro del contenedor.
   * ➡️ Debe incluir directorios y el nombre del archivo.
   * ➡️ El archivo debe existir previamente.
   *
   * Ejemplo: "temporal/documento.pdf"
   */
  @ApiProperty({
    description: 'Ruta completa del archivo origen (incluyendo directorios)',
    example: 'temporal/documento.pdf',
  })
  sourceBlobPath: string;

  /**
   * Ruta completa del archivo destino dentro del contenedor.
   * ➡️ Puede usarse para mover el archivo a otra carpeta o renombrarlo.
   * ➡️ Si el directorio destino no existe, se creará implícitamente.
   *
   * Ejemplo: "documentos/2024/documento-final.pdf"
   */
  @ApiProperty({
    description: 'Ruta completa del archivo destino (incluyendo directorios)',
    example: 'documentos/2024/documento-final.pdf',
  })
  destinationBlobPath: string;
}
