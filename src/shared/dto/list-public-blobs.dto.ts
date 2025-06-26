import { ApiProperty } from '@nestjs/swagger';

export class ListPublicBlobsDto {
  @ApiProperty({
    description: 'Ruta del directorio en el store público (opcional)',
    example: 'afiliaciones/2000000005',
    required: false,
  })
  directory?: string;
}
