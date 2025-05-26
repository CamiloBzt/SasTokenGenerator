import { ApiProperty } from '@nestjs/swagger';

export class UploadBlobBase64Dto {
  @ApiProperty({
    description: 'Nombre del contenedor',
    example: 'uploads',
  })
  containerName: string;

  @ApiProperty({
    description: 'Nombre del archivo',
    example: 'documento.pdf',
  })
  blobName: string;

  @ApiProperty({
    description: 'Ruta del directorio (opcional)',
    example: 'documentos/2024',
    required: false,
  })
  directory?: string;

  @ApiProperty({
    description: 'Archivo codificado en Base64',
    example:
      'JVBERi0xLjQKJdP0zOEKMSAwIG9iago8PAovVHlwZSAvQ2F0YWxvZwovUGFnZXMgMiAwIFIKPj4KZW5kb2JqCg==',
  })
  fileBase64: string;

  @ApiProperty({
    description: 'Tipo MIME del archivo',
    example: 'application/pdf',
  })
  mimeType: string;
}
