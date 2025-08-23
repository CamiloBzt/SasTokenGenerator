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
  ): Promise<Buffer> {
    const workbook = new Workbook();
    await workbook.xlsx.load(templateBuffer as any);

    const worksheet = sheetName
      ? workbook.getWorksheet(sheetName) || workbook.worksheets[0]
      : workbook.worksheets[0];

    const lastRowNumber = worksheet.lastRow?.number ?? 0;
    const templateRow = worksheet.getRow(lastRowNumber);

    rows.forEach((rowData) => {
      const row = worksheet.addRow(Object.values(rowData));
      templateRow.eachCell({ includeEmpty: true }, (cell, col) => {
        row.getCell(col).style = { ...cell.style };
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
