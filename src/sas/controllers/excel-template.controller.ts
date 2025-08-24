import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { FillExcelTemplateDto } from '@src/shared/dto/fill-excel-template.dto';
import { ExcelTemplateService } from '../services/excel-template.service';
import { PrivateBlobService } from '../services/blob-storage/private-blob.service';

/**
 * Controlador para aplicar datos sobre una plantilla de Excel
 * y subir el resultado al almacenamiento privado.
 */
@ApiTags('Excel Templates')
@Controller('template')
export class ExcelTemplateController {
  constructor(
    private readonly excelTemplateService: ExcelTemplateService,
    private readonly privateBlobService: PrivateBlobService,
  ) {}

  @Post('excel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Aplica datos a una plantilla de Excel y sube el resultado al contenedor privado',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Plantilla y datos a insertar',
    type: FillExcelTemplateDto,
  })
  @UseInterceptors(FileInterceptor('template'))
  async fillAndUpload(
    @UploadedFile() template: Express.Multer.File,
    @Body() body: FillExcelTemplateDto,
  ): Promise<any> {
    const rows =
      typeof body.rows === 'string' ? JSON.parse(body.rows) : body.rows;

    const filledBuffer = await this.excelTemplateService.fillTemplate(
      template.buffer,
      rows || [],
      body.sheetName,
    );

    const uploadFile: Express.Multer.File = {
      buffer: filledBuffer,
      mimetype:
        template.mimetype ||
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    } as Express.Multer.File;

    const uploadResult = await this.privateBlobService.uploadBlob(
      body.containerName,
      body.directory,
      body.blobName,
      uploadFile,
    );

    return {
      message: 'Template filled and uploaded',
      ...uploadResult,
    };
  }
}
