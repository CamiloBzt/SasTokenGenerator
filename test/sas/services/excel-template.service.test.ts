import { Workbook } from 'exceljs';
import { ExcelTemplateService } from '../../../src/sas/services/excel-template.service';

describe('ExcelTemplateService', () => {
  const service = new ExcelTemplateService();

  it('should append rows preserving styles', async () => {
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet('Sheet1');
    sheet.addRow(['name', 'age']);
    const styledRow = sheet.addRow(['Bob', 25]);
    styledRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFF0000' },
      };
    });
    const templateBuffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const resultBuffer = await service.fillTemplate(templateBuffer, [
      { name: 'Alice', age: 30 },
    ]);

    const resultWb = new Workbook();
    await resultWb.xlsx.load(resultBuffer as any);
    const resultSheet = resultWb.getWorksheet('Sheet1');
    const newRow = resultSheet.getRow(3);

    expect(newRow.getCell(1).value).toBe('Alice');
    expect(newRow.getCell(2).value).toBe(30);
    expect(newRow.getCell(1).font?.bold).toBe(true);
    expect((newRow.getCell(1).fill as any)?.fgColor?.argb).toBe('FFFF0000');
  });

  it('should respect templates starting at non-first column and append data', async () => {
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet('Sheet1');
    // Cabeceras comenzando en la columna B
    sheet.getCell('B1').value = 'TIPO_TRANSACCION';
    sheet.getCell('C1').value = 'SUBTIPO_TRANSACCION';
    sheet.getCell('D1').value = 'FECHA MOVIMIENTO';
    sheet.getCell('E1').value = 'VALOR REAL';
    sheet.getCell('F1').value = 'VALOR CALCULO RENTABILIDAD';

    const templateBuffer = Buffer.from(await workbook.xlsx.writeBuffer());

    // Primera inserción
    const firstBuffer = await service.fillTemplate(templateBuffer, [
      {
        TIPO_TRANSACCION: 'VENTA',
        SUBTIPO_TRANSACCION: 'ONLINE',
        'FECHA MOVIMIENTO': '2024-01-01',
        'VALOR REAL': 100,
        'VALOR CALCULO RENTABILIDAD': 50,
      },
    ]);

    // Segunda inserción (append)
    const secondBuffer = await service.fillTemplate(firstBuffer, [
      {
        TIPO_TRANSACCION: 'COMPRA',
        SUBTIPO_TRANSACCION: 'TIENDA',
        'FECHA MOVIMIENTO': '2024-01-02',
        'VALOR REAL': 200,
        'VALOR CALCULO RENTABILIDAD': 80,
      },
    ]);

    const resultWb = new Workbook();
    await resultWb.xlsx.load(secondBuffer as any);
    const resultSheet = resultWb.getWorksheet('Sheet1');

    // Fila 2 (primera inserción)
    const row2 = resultSheet.getRow(2);
    expect(row2.getCell(1).value).toBeNull();
    expect(row2.getCell(2).value).toBe('VENTA');
    expect(row2.getCell(6).value).toBe(50);

    // Fila 3 (segunda inserción)
    const row3 = resultSheet.getRow(3);
    expect(row3.getCell(1).value).toBeNull();
    expect(row3.getCell(2).value).toBe('COMPRA');
    expect(row3.getCell(6).value).toBe(80);
  });

  it('should allow specifying start row and column on empty sheet', async () => {
    const workbook = new Workbook();
    workbook.addWorksheet('Sheet1');
    const templateBuffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const resultBuffer = await service.fillTemplate(
      templateBuffer,
      [{ col1: 'A', col2: 'B' }],
      'Sheet1',
      3,
      2,
    );

    const resultWb = new Workbook();
    await resultWb.xlsx.load(resultBuffer as any);
    const sheet = resultWb.getWorksheet('Sheet1');
    const row3 = sheet.getRow(3);

    expect(row3.getCell(2).value).toBe('A');
    expect(row3.getCell(3).value).toBe('B');
  });

  it('should honour provided startRow on templates with trailing empty rows', async () => {
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet('Sheet1');
    // Datos hasta la fila 8
    sheet.getCell('A8').value = 'header';
    // Aumentar artificialmente el rowCount dejando filas vacías hasta la 19
    sheet.getRow(19);
    const templateBuffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const firstBuffer = await service.fillTemplate(
      templateBuffer,
      [{ col1: 'A', col2: 'B' }],
      'Sheet1',
      9,
      2,
    );

    const secondBuffer = await service.fillTemplate(
      firstBuffer,
      [{ col1: 'C', col2: 'D' }],
      'Sheet1',
      9,
      2,
    );

    const resultWb = new Workbook();
    await resultWb.xlsx.load(secondBuffer as any);
    const sheetResult = resultWb.getWorksheet('Sheet1');

    const row9 = sheetResult.getRow(9);
    expect(row9.getCell(2).value).toBe('A');
    expect(row9.getCell(3).value).toBe('B');

    const row10 = sheetResult.getRow(10);
    expect(row10.getCell(2).value).toBe('C');
    expect(row10.getCell(3).value).toBe('D');
  });

  it('should use styles of the insertion row when no data exists below startRow', async () => {
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet('Sheet1');

    // Encabezado en la fila 9 con estilo verde
    const headerRow = sheet.getRow(9);
    headerRow.getCell(2).value = 'HEADER';
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF00FF00' },
      };
    });

    // Fila plantilla (fila 10) con estilo amarillo
    const templateRow = sheet.getRow(10);
    const templateCell = templateRow.getCell(2);
    templateCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFFF00' },
    };

    const templateBuffer = Buffer.from(await workbook.xlsx.writeBuffer());

    // Primera inserción en una hoja sin datos previos
    const firstBuffer = await service.fillTemplate(
      templateBuffer,
      [{ col1: 'A' }],
      'Sheet1',
      10,
      2,
    );

    // Segunda inserción (append)
    const secondBuffer = await service.fillTemplate(
      firstBuffer,
      [{ col1: 'B' }],
      'Sheet1',
      10,
      2,
    );

    const resultWb = new Workbook();
    await resultWb.xlsx.load(secondBuffer as any);
    const resultSheet = resultWb.getWorksheet('Sheet1');

    const row10 = resultSheet.getRow(10);
    expect(row10.getCell(2).value).toBe('A');
    expect((row10.getCell(2).fill as any)?.fgColor?.argb).toBe('FFFFFF00');

    const row11 = resultSheet.getRow(11);
    expect(row11.getCell(2).value).toBe('B');
    expect((row11.getCell(2).fill as any)?.fgColor?.argb).toBe('FFFFFF00');
  });

  it('should coerce string startRow and startColumn values', async () => {
    const workbook = new Workbook();
    workbook.addWorksheet('Sheet1');
    const templateBuffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const resultBuffer = await service.fillTemplate(
      templateBuffer,
      [{ col1: 'A', col2: 'B' }],
      'Sheet1',
      '3' as any,
      '2' as any,
    );

    const resultWb = new Workbook();
    await resultWb.xlsx.load(resultBuffer as any);
    const sheet = resultWb.getWorksheet('Sheet1');
    const row3 = sheet.getRow(3);

    expect(row3.getCell(2).value).toBe('A');
    expect(row3.getCell(3).value).toBe('B');
  });
});
