import { ApiProperty } from '@nestjs/swagger';

export class ExposePublicBlobDto {
  @ApiProperty({
    description: 'Nombre del contenedor en el store privado',
    example: 'contenedor',
  })
  containerName: string;

  @ApiProperty({
    description: 'Nombre del archivo',
    example: 'archivo.pdf',
  })
  blobName: string;

  @ApiProperty({
    description: 'Ruta del directorio',
    example: 'directorio/2000000000',
  })
  directory: string;

  @ApiProperty({
    description: 'Minutos hasta la expiración del token',
    example: 60,
    default: 60,
    minimum: 1,
    maximum: 10080, // 7 días
  })
  expirationMinutes?: number = 60;

  @ApiProperty({
    description: 'Si devolver el contenido en Base64',
    example: true,
    default: false,
  })
  base64?: boolean = false;

  @ApiProperty({
    description:
      'Si usar copia directa (true, por defecto y más eficiente) o descarga/subida (false, método legacy)',
    example: true,
    default: true,
  })
  useDirectCopy?: boolean = true;
}
