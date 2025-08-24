import { Injectable } from '@nestjs/common';
import { Workbook } from 'exceljs';
import { FillExcelTemplateDto } from '@src/shared/dto/fill-excel-template.dto';

/**
 * Servicio para llenar una plantilla de Excel usando cabeceras dinámicas.
 */
@Injectable()
export class ExcelTemplateService {
  /**
   * Llena la plantilla recibida con los datos proporcionados.
   * @param dto Parámetros para el llenado del Excel.
   * @returns Buffer del archivo Excel resultante.
   */
  async fillTemplate(dto: FillExcelTemplateDto): Promise<Buffer> {
    const {
      template,
      data,
      headerRow = 1,
      startRow = headerRow + 1,
    } = dto;

    const workbook = new Workbook();
    await workbook.xlsx.load(template as any);
    const worksheet = workbook.worksheets[0];

    const headersRow = worksheet.getRow(headerRow);
    const lastRowNumber = worksheet.lastRow?.number ?? 0;
    let currentRow = Math.max(startRow, lastRowNumber + 1);

    for (const item of data) {
      const rowValues: any[] = [];

      headersRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const key = String(cell.value);
        rowValues[colNumber] = item[key];
      });

      const newRow = worksheet.insertRow(currentRow, rowValues);

      const templateRow = worksheet.getRow(startRow - 1);
      templateRow.eachCell({ includeEmpty: true }, (cell, col) => {
        newRow.getCell(col).style = { ...cell.style };
      });

      currentRow++;
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
