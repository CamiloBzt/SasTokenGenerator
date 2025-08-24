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
    @UploadedFile() template: Express.Multer.File,
    @Body() body: FillExcelTemplateDto,
  ): Promise<any> {
    const rows =
      typeof body.rows === 'string' ? JSON.parse(body.rows) : body.rows;

    // Si el blob ya existe, descargarlo y hacer append en lugar de sobrescribir
    let baseBuffer: Buffer = template.buffer;
    try {
      const existing = await this.privateBlobService.downloadBlob(
        body.containerName,
        body.directory,
        body.blobName,
      );
      baseBuffer = existing.data;
    } catch (error: any) {
      if (
        !(error instanceof BusinessErrorException) ||
        (error.getResponse() as any)?.errorMessage !== ErrorMessages.BLOB_NOT_FOUND
      ) {
        throw error;
      }
      // Si no existe el blob, se continúa usando la plantilla proporcionada
    }

    const filledBuffer = await this.excelTemplateService.fillTemplate(
      baseBuffer,
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
