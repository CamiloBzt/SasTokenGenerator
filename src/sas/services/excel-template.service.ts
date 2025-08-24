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
    headerRow = 1,
    startRow?: number,
  ): Promise<Buffer> {
    const workbook = new Workbook();
    await workbook.xlsx.load(templateBuffer as any);

    const worksheet = sheetName
      ? workbook.getWorksheet(sheetName) || workbook.worksheets[0]
      : workbook.worksheets[0];

    const header = worksheet.getRow(headerRow);

    let insertPosition = startRow;
    if (!insertPosition) {
      const lastRowNumber = worksheet.lastRow?.number || headerRow;
      insertPosition = lastRowNumber + 1;
    }

    rows.forEach((rowData) => {
      const rowValues: any[] = [];
      header.eachCell({ includeEmpty: true }, (cell, col) => {
        const key = (cell.value ?? '').toString();
        rowValues[col] = rowData[key];
      });

      const row = worksheet.insertRow(insertPosition!, rowValues);
      const templateRow = worksheet.getRow(insertPosition! - 1);
      templateRow.eachCell({ includeEmpty: true }, (cell, col) => {
        row.getCell(col).style = { ...cell.style };
      });
      insertPosition! += 1;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
