import { ApiProperty } from '@nestjs/swagger';

export class UploadBlobDto {
  @ApiProperty({
    description: 'Nombre del contenedor',
    example: 'uploads',
    required: true,
  })
  containerName: string;

  @ApiProperty({
    description: 'Ruta del directorio (opcional)',
    example: 'documentos/2024',
    required: false,
  })
  directory?: string;

  @ApiProperty({
    description: 'Nombre del blob',
    example: 'archivo.pdf',
    required: true,
  })
  blobName: string;

  @ApiProperty({
    description: 'Archivo a cargar',
    type: 'string',
    format: 'binary',
  })
  file: any;
}
