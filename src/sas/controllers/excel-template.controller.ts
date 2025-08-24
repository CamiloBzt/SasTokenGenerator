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
import { BusinessErrorException } from '@src/shared/exceptions/business-error.exception';
import { ErrorMessages } from '@src/shared/enums/error-messages.enum';

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
    @UploadedFile() template: Express.Multer.File | undefined,
    @Body() body: FillExcelTemplateDto,
  ): Promise<any> {
    const rows =
      typeof body.rows === 'string' ? JSON.parse(body.rows) : body.rows;

    const headerRow = body.headerRow ? Number(body.headerRow) : undefined;
    const startRow = body.startRow ? Number(body.startRow) : undefined;

    let baseBuffer: Buffer;
    try {
      const existing = await this.privateBlobService.downloadBlob(
        body.containerName,
        body.directory,
        body.blobName,
      );
      baseBuffer = existing.data;
    } catch (error: any) {
      if (
        error instanceof BusinessErrorException &&
        error.message === ErrorMessages.BLOB_NOT_FOUND
      ) {
        if (!template?.buffer) {
          throw error;
        }
        baseBuffer = template.buffer;
      } else {
        throw error;
      }
    }

    const filledBuffer = await this.excelTemplateService.fillTemplate(
      baseBuffer,
      rows || [],
      body.sheetName,
      headerRow,
      startRow,
    );

    const uploadFile: Express.Multer.File = {
      buffer: filledBuffer,
      mimetype:
        template?.mimetype ||
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
