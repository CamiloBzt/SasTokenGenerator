import { ApiProperty } from '@nestjs/swagger';

export class ListBlobsInDirectoryDto {
  @ApiProperty({
    description: 'Nombre del contenedor',
    example: 'uploads',
  })
  containerName: string;

  @ApiProperty({
    description: 'Ruta del directorio',
    example: 'documentos/2024',
  })
  directory: string;
}