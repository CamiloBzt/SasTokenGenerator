import { ApiProperty } from '@nestjs/swagger';

export class DownloadBlobBase64Dto {
  @ApiProperty({
    description: 'Nombre del contenedor',
    example: 'uploads',
  })
  containerName: string;

  @ApiProperty({
    description: 'Nombre del archivo a descargar',
    example: 'archivo.pdf',
  })
  blobName: string;

  @ApiProperty({
    description: 'Ruta del directorio (opcional)',
    example: 'documentos/2024',
    required: false,
  })
  directory?: string;
}
