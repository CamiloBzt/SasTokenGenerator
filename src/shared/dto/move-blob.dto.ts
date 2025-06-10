import { ApiProperty } from '@nestjs/swagger';

export class MoveBlobDto {
  @ApiProperty({
    description: 'Nombre del contenedor',
    example: 'uploads',
  })
  containerName: string;

  @ApiProperty({
    description: 'Ruta completa del archivo origen (incluyendo directorios)',
    example: 'temporal/documento.pdf',
  })
  sourceBlobPath: string;

  @ApiProperty({
    description: 'Ruta completa del archivo destino (incluyendo directorios)',
    example: 'documentos/2024/documento-final.pdf',
  })
  destinationBlobPath: string;
}
