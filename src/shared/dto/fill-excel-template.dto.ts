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
    description: 'Número de la fila que contiene los encabezados (1-indexado)',
    required: false,
    example: 8,
  })
  headerRow?: number;

  @ApiProperty({
    description:
      'Fila inicial para insertar datos (1-indexado). Si se omite, se usa la última fila disponible',
    required: false,
    example: 9,
  })
  startRow?: number;

  @ApiProperty({
    description: 'Filas a insertar en la plantilla',
    type: [Object],
    example: [{ nombre: 'Juan', edad: 30 }],
  })
  rows: Record<string, any>[];
}
