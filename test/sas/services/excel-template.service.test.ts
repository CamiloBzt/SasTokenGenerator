import { Test, TestingModule } from '@nestjs/testing';
import { Workbook } from 'exceljs';
import { ExcelTemplateService } from '../../../src/sas/services/excel-template.service';
import { FillExcelTemplateDto } from '../../../src/shared/dto/fill-excel-template.dto';

describe('ExcelTemplateService', () => {
  let service: ExcelTemplateService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ExcelTemplateService],
    }).compile();

    service = module.get<ExcelTemplateService>(ExcelTemplateService);
  });

  it('should map columns using headers and preserve styles with multiple header rows', async () => {
    const workbook = new Workbook();
    const worksheet = workbook.addWorksheet('Template');

    worksheet.addRow(['Reporte de prueba']);
    worksheet.addRow(['Grupo A', 'Grupo A', 'Grupo B']);
    worksheet.addRow(['Name', 'Age', 'City']);
    worksheet.addRow([]);

    const styleRow = worksheet.getRow(4);
    styleRow.getCell(1).style = { font: { bold: true, color: { argb: 'FFFF0000' } } };
    styleRow.getCell(2).style = { numFmt: '#,##0' };
    styleRow.getCell(3).style = { alignment: { horizontal: 'center' } };

    const templateBuffer = await workbook.xlsx.writeBuffer();

    const dto: FillExcelTemplateDto = {
      template: Buffer.from(templateBuffer),
      data: [
        { Name: 'Alice', Age: 30, City: 'Paris' },
        { Name: 'Bob', Age: 40, City: 'London' },
      ],
      headerRow: 3,
      startRow: 5,
    };

    const resultBuffer = await service.fillTemplate(dto);
    const resultWorkbook = new Workbook();
    await resultWorkbook.xlsx.load(resultBuffer as any);
    const ws = resultWorkbook.worksheets[0];

    const firstRow = ws.getRow(5);
    expect(firstRow.getCell(1).value).toBe('Alice');
    expect(firstRow.getCell(2).value).toBe(30);
    expect(firstRow.getCell(3).value).toBe('Paris');
    expect(firstRow.getCell(1).style.font?.bold).toBe(true);
    expect(firstRow.getCell(1).style.font?.color?.argb).toBe('FFFF0000');
    expect(firstRow.getCell(2).style.numFmt).toBe('#,##0');
    expect(firstRow.getCell(3).style.alignment?.horizontal).toBe('center');

    const secondRow = ws.getRow(6);
    expect(secondRow.getCell(1).value).toBe('Bob');
    expect(secondRow.getCell(2).value).toBe(40);
    expect(secondRow.getCell(3).value).toBe('London');
    expect(secondRow.getCell(1).style.font?.bold).toBe(true);
    expect(secondRow.getCell(2).style.numFmt).toBe('#,##0');
    expect(secondRow.getCell(3).style.alignment?.horizontal).toBe('center');
  });

  it('should append data when template already contains rows', async () => {
    const workbook = new Workbook();
    const worksheet = workbook.addWorksheet('Template');

    worksheet.addRow(['Reporte de prueba']);
    worksheet.addRow(['Grupo A', 'Grupo A', 'Grupo B']);
    worksheet.addRow(['Name', 'Age', 'City']);
    worksheet.addRow([]);

    const styleRow = worksheet.getRow(4);
    styleRow.getCell(1).style = { font: { bold: true } };
    styleRow.getCell(2).style = { numFmt: '#,##0' };
    styleRow.getCell(3).style = { alignment: { horizontal: 'center' } };

    const templateBuffer = await workbook.xlsx.writeBuffer();

    const firstResult = await service.fillTemplate({
      template: Buffer.from(templateBuffer),
      data: [
        { Name: 'Alice', Age: 30, City: 'Paris' },
        { Name: 'Bob', Age: 40, City: 'London' },
      ],
      headerRow: 3,
      startRow: 5,
    });

    const secondResult = await service.fillTemplate({
      template: Buffer.from(firstResult),
      data: [
        { Name: 'Carol', Age: 25, City: 'Rome' },
        { Name: 'Dave', Age: 35, City: 'Madrid' },
      ],
      headerRow: 3,
      startRow: 5,
    });

    const resultWorkbook = new Workbook();
    await resultWorkbook.xlsx.load(secondResult as any);
    const ws = resultWorkbook.worksheets[0];

    const thirdRow = ws.getRow(5);
    expect(thirdRow.getCell(1).value).toBe('Alice');
    const fourthRow = ws.getRow(6);
    expect(fourthRow.getCell(1).value).toBe('Bob');
    const fifthRow = ws.getRow(7);
    expect(fifthRow.getCell(1).value).toBe('Carol');
    expect(fifthRow.getCell(1).style.font?.bold).toBe(true);
    const sixthRow = ws.getRow(8);
    expect(sixthRow.getCell(1).value).toBe('Dave');
    expect(sixthRow.getCell(3).value).toBe('Madrid');
    expect(sixthRow.getCell(2).style.numFmt).toBe('#,##0');
    expect(sixthRow.getCell(3).style.alignment?.horizontal).toBe('center');
  });
});
