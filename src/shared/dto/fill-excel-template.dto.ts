import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO para llenar plantillas de Excel con datos dinámicos.
 */
export class FillExcelTemplateDto {
  /**
   * Buffer del archivo de plantilla en formato Excel (.xlsx).
   */
  @ApiProperty({ description: 'Plantilla Excel en formato buffer' })
  template: Buffer;

  /**
   * Datos a insertar en la plantilla. Las claves deben coincidir con los encabezados.
   */
  @ApiProperty({
    description: 'Datos a insertar en la plantilla',
    type: 'object',
    isArray: true,
  })
  data: Record<string, any>[];

  /**
   * Fila donde se encuentran los encabezados que definen las claves.
   * \@default 1
   */
  @ApiProperty({
    description: 'Fila donde se ubican los encabezados',
    required: false,
    type: Number,
  })
  headerRow?: number;

  /**
   * Fila inicial donde deben insertarse los datos.
   * \@default headerRow + 1
   */
  @ApiProperty({
    description: 'Fila inicial para insertar datos',
    required: false,
    type: Number,
  })
  startRow?: number;
}
