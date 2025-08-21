import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO para listar blobs (archivos) dentro de un contenedor de Azure Blob Storage.
 */
export class ListBlobsDto {
  /**
   * Nombre del contenedor en Azure Blob Storage.
   * @example "uploads"
   */
  @ApiProperty({
    description: 'Nombre del contenedor',
    example: 'uploads',
  })
  containerName: string;

  /**
   * Ruta del directorio dentro del contenedor (opcional).
   * - Si se omite, se listarán todos los blobs del contenedor.
   * - Si se especifica, solo se listarán los archivos dentro de esa ruta.
   * @example "documentos/2024"
   */
  @ApiProperty({
    description:
      'Ruta del directorio (opcional). Si se proporciona, solo se listarán los blobs dentro de ese directorio.',
    example: 'documentos/2024',
    required: false,
  })
  directory?: string;
}
