import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO para la descarga de un blob en formato binario.
 */
export class DownloadBlobDto {
  /**
   * Nombre del contenedor que almacena el blob.
   * @example "uploads"
   */
  @ApiProperty({
    description: 'Nombre del contenedor',
    example: 'uploads',
  })
  containerName: string;

  /**
   * Nombre del archivo que se desea descargar.
   * @example "archivo.pdf"
   */
  @ApiProperty({
    description: 'Nombre del archivo a descargar',
    example: 'archivo.pdf',
  })
  blobName: string;

  /**
   * Ruta opcional del directorio dentro del contenedor donde se encuentra el blob.
   * Si no se especifica, se buscará en la raíz del contenedor.
   * @example "documentos/2024"
   */
  @ApiProperty({
    description: 'Ruta del directorio (opcional)',
    example: 'documentos/2024',
    required: false,
  })
  directory?: string;
}
