import { ApiProperty } from '@nestjs/swagger';
import { SasPermission } from '../enums/sas-permission.enum';

export class GenerateSasTokenDto {
  @ApiProperty({
    description: 'Nombre del contenedor',
    example: 'uploads',
  })
  containerName: string;

  @ApiProperty({
    description: 'Nombre del archivo o ruta (opcional)',
    example: 'document.pdf',
    required: false,
  })
  fileName?: string;

  @ApiProperty({
    description: 'Ruta de la carpeta (opcional)',
    example: 'folios',
    required: false,
  })
  folderPath?: string;

  @ApiProperty({
    description: 'Permisos para el SAS token',
    example: [SasPermission.READ, SasPermission.WRITE],
    enum: SasPermission,
    isArray: true,
  })
  permissions: SasPermission[];

  @ApiProperty({
    description: 'Minutos hasta la expiración del token',
    example: 60,
    minimum: 1,
    maximum: 10080, // 7 días
  })
  expirationMinutes: number;

  @ApiProperty({
    description: 'IP del usuario (opcional)',
    example: '127.0.0.1',
    required: false,
  })
  userIp?: string;
}
