import { Injectable } from '@nestjs/common';
import { Workbook } from 'exceljs';

/**
 * Servicio para aplicar datos sobre una plantilla de Excel.
 *
 * Permite recibir un archivo Excel existente (con estilos, colores, etc.)
 * y agregar filas de datos respetando la estructura original.
 */
@Injectable()
export class ExcelTemplateService {
  /**
   * Agrega las filas proporcionadas al final de la hoja indicada de la plantilla.
   *
   * @param templateBuffer Buffer del archivo de plantilla.
   * @param rows           Arreglo de objetos a insertar como filas.
   * @param sheetName      Nombre de la hoja destino. Si no se proporciona, se usa la primera.
   * @returns Buffer del archivo Excel resultante.
   */
  async fillTemplate(
    templateBuffer: Buffer,
    rows: Record<string, any>[],
    sheetName?: string,
    startRow?: number,
    startColumn?: number,
  ): Promise<Buffer> {
    const workbook = new Workbook();
    await workbook.xlsx.load(templateBuffer as any);

    const worksheet = sheetName
      ? workbook.getWorksheet(sheetName) || workbook.worksheets[0]
      : workbook.worksheets[0];

    let lastRowNumber = worksheet.lastRow?.number ?? 0;

    // Si se especifica una fila inicial y la hoja está vacía o tiene menos filas,
    // agregar filas vacías hasta alcanzar dicha fila - 1.
    if (startRow && lastRowNumber < startRow - 1) {
      while (lastRowNumber < startRow - 1) {
        worksheet.addRow([]);
        lastRowNumber++;
      }
    }

    const templateRow = worksheet.getRow(lastRowNumber);

    // Determinar la primera columna con datos en la fila plantilla
    let effectiveStartColumn = startColumn ?? Number.MAX_SAFE_INTEGER;
    if (startColumn == null) {
      templateRow.eachCell({ includeEmpty: false }, (_, col) => {
        if (col < effectiveStartColumn!) {
          effectiveStartColumn = col;
        }
      });
      if (effectiveStartColumn === Number.MAX_SAFE_INTEGER) {
        effectiveStartColumn = 1;
      }
    }

    rows.forEach((rowData) => {
      // Crear una fila vacía para poder alinear las columnas correctamente
      const row = worksheet.addRow([]);

      // Copiar estilos de la fila de plantilla, incluso celdas vacías
      templateRow.eachCell({ includeEmpty: true }, (cell, col) => {
        row.getCell(col).style = { ...cell.style };
      });

      // Asignar valores a partir de la columna de inicio detectada
      Object.values(rowData).forEach((value, index) => {
        row.getCell(effectiveStartColumn + index).value = value;
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
