import { ApiProperty } from '@nestjs/swagger';

export class ListBlobsDto {
  @ApiProperty({
    description: 'Nombre del contenedor',
    example: 'uploads',
  })
  containerName: string;
  @ApiProperty({
    description:
      'Directory path (optional). If provided, only blobs within this directory will be listed.',
    example: 'documentos/2024',
    required: false,
  })
  directory: string;
}
