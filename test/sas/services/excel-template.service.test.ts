import { Workbook } from 'exceljs';
import { ExcelTemplateService } from '../../../src/sas/services/excel-template.service';

describe('ExcelTemplateService', () => {
  const service = new ExcelTemplateService();

  it('should map rows by headers and clone column styles', async () => {
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet('Sheet1');
    sheet.addRow(['name', 'age']);
    const styleRow = sheet.addRow(['', '']);
    styleRow.getCell(1).font = { bold: true };
    styleRow.getCell(2).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFFF00' },
    };
    const templateBuffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const resultBuffer = await service.fillTemplate(
      templateBuffer,
      [{ age: 30, name: 'Alice' }],
      'Sheet1',
      1,
      3,
    );

    const resultWb = new Workbook();
    await resultWb.xlsx.load(resultBuffer as any);
    const resultSheet = resultWb.getWorksheet('Sheet1');
    const newRow = resultSheet.getRow(3);

    expect(newRow.getCell(1).value).toBe('Alice');
    expect(newRow.getCell(2).value).toBe(30);
    expect(newRow.getCell(1).font?.bold).toBe(true);
    expect((newRow.getCell(2).fill as any)?.fgColor?.argb).toBe('FFFFFF00');
  });

  it('should append rows when startRow is not provided', async () => {
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet('Sheet1');
    sheet.addRow(['name', 'age']);
    const styleRow = sheet.addRow(['', '']);
    styleRow.getCell(1).font = { bold: true };
    const templateBuffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const firstBuffer = await service.fillTemplate(
      templateBuffer,
      [{ name: 'Bob', age: 25 }],
      'Sheet1',
      1,
      3,
    );

    const secondBuffer = await service.fillTemplate(
      firstBuffer,
      [{ name: 'Carol', age: 28 }],
      'Sheet1',
      1,
    );

    const resultWb = new Workbook();
    await resultWb.xlsx.load(secondBuffer as any);
    const resultSheet = resultWb.getWorksheet('Sheet1');

    expect(resultSheet.getRow(3).getCell(1).value).toBe('Bob');
    expect(resultSheet.getRow(4).getCell(1).value).toBe('Carol');
    expect(resultSheet.getRow(4).getCell(1).font?.bold).toBe(true);
  });
});
