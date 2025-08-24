import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO para aplicar datos sobre una plantilla de Excel y subir el resultado.
 */
export class FillExcelTemplateDto {
  @ApiProperty({
    description: 'Nombre del contenedor destino',
    example: 'reports',
  })
  containerName: string;

  @ApiProperty({
    description: 'Nombre del blob resultante (incluye extensión)',
    example: 'informe.xlsx',
  })
  blobName: string;

  @ApiProperty({
    description: 'Directorio opcional dentro del contenedor',
    required: false,
    example: '2024/enero',
  })
  directory?: string;

  @ApiProperty({
    description: 'Nombre de la hoja donde se insertarán los datos',
    required: false,
    example: 'Hoja1',
  })
  sheetName?: string;

  @ApiProperty({
    description:
      'Fila inicial donde se agregarán datos si la plantilla está vacía',
    required: false,
    example: 2,
  })
  startRow?: number;

  @ApiProperty({
    description:
      'Columna inicial donde se agregarán datos si la plantilla está vacía',
    required: false,
    example: 2,
  })
  startColumn?: number;

  @ApiProperty({
    description: 'Filas a insertar en la plantilla',
    type: [Object],
    example: [{ nombre: 'Juan', edad: 30 }],
  })
  rows: Record<string, any>[];
}
