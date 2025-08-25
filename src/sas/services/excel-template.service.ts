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

    // Asegurar que los parámetros numéricos no sean cadenas
    const numericStartRow = startRow != null ? Number(startRow) : undefined;
    const numericStartColumn =
      startColumn != null ? Number(startColumn) : undefined;

    // Determinar la última fila con datos reales (ignora filas vacías con estilo)
    let lastDataRow = 0;
    worksheet.eachRow({ includeEmpty: false }, (_, rowNumber) => {
      if (rowNumber > lastDataRow) {
        lastDataRow = rowNumber;
      }
    });

    // Fila donde se comenzará a insertar
    let insertionRow = numericStartRow ?? lastDataRow + 1;
    if (numericStartRow != null && lastDataRow >= numericStartRow) {
      insertionRow = lastDataRow + 1;
    }

    // Fila usada como referencia para copiar estilos
    // Si se especifica un startRow y la plantilla no tiene datos
    // por debajo de esa fila, se toman los estilos de la fila de inicio
    // para evitar heredar estilos de filas anteriores (p. ej. encabezados).
    const templateRow =
      numericStartRow != null && lastDataRow < numericStartRow
        ? worksheet.getRow(numericStartRow)
        : worksheet.getRow(insertionRow - 1);

    // Determinar la primera columna con datos en la fila plantilla
    let effectiveStartColumn = numericStartColumn ?? Number.MAX_SAFE_INTEGER;
    if (numericStartColumn == null) {
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
      const row = worksheet.getRow(insertionRow++);

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
