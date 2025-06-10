import { ApiProperty } from '@nestjs/swagger';

export class CopyBlobDto {
  @ApiProperty({
    description: 'Nombre del contenedor',
    example: 'uploads',
  })
  containerName: string;

  @ApiProperty({
    description: 'Ruta completa del archivo origen (incluyendo directorios)',
    example: 'documentos/2024/documento-original.pdf',
  })
  sourceBlobPath: string;

  @ApiProperty({
    description: 'Ruta completa del archivo destino (incluyendo directorios)',
    example: 'backup/documentos/documento-copia.pdf',
  })
  destinationBlobPath: string;
}
