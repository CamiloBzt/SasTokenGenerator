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
});
