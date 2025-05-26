import { ApiProperty } from '@nestjs/swagger';

export class ListBlobsDto {
  @ApiProperty({
    description: 'Nombre del contenedor',
    example: 'uploads',
  })
  containerName: string;
}
