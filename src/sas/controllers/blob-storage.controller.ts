import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UploadBlobDto } from '@src/shared/dto/upload-blob-dto';
import { Response } from 'express';
import { BlobStorageService } from '../services/blob-storage.service';

@ApiTags('Blob Storage')
@Controller('blob')
export class BlobStorageController {
  constructor(private readonly blobStorageService: BlobStorageService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary: 'Upload a blob',
    description: 'Upload a file to Azure Blob Storage in a specific directory',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Blob upload data',
    type: UploadBlobDto,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Blob uploaded successfully',
    schema: {
      example: {
        status: {
          statusCode: 200,
          statusDescription: 'Operación completada con éxito.',
        },
        data: {
          blobUrl:
            'https://account.blob.core.windows.net/container/directory/file.pdf',
          containerName: 'uploads',
          blobName: 'file.pdf',
          fullPath: 'directory/file.pdf',
          requestId: '123e4567-e89b-12d3-a456-426614174000',
        },
      },
    },
  })
  @HttpCode(HttpStatus.OK)
  async uploadBlob(
    @UploadedFile() file: Express.Multer.File,
    @Body() uploadBlobDto: UploadBlobDto,
  ): Promise<{
    status: { statusCode: number; statusDescription: string };
    data: {
      blobUrl: string;
      containerName: string;
      blobName: string;
      fullPath: string;
      requestId: string;
    };
  }> {
    const result = await this.blobStorageService.uploadBlob(
      uploadBlobDto.containerName,
      uploadBlobDto.directory,
      uploadBlobDto.blobName,
      file,
    );

    return {
      status: {
        statusCode: HttpStatus.OK,
        statusDescription: 'Operación completada con éxito.',
      },
      data: result,
    };
  }

  @Get('download/:containerName/:blobName')
  @ApiOperation({
    summary: 'Download a blob',
    description:
      'Download a file from Azure Blob Storage from a specific directory',
  })
  @ApiParam({
    name: 'containerName',
    description: 'Nombre del contenedor',
    example: 'uploads',
  })
  @ApiParam({
    name: 'blobName',
    description: 'Nombre del archivo a descargar',
    example: 'archivo.pdf',
  })
  @ApiQuery({
    name: 'directory',
    description: 'Ruta del directorio (opcional)',
    required: false,
    example: 'documentos/2024',
  })
  @ApiProduces('application/octet-stream')
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Blob downloaded successfully',
    content: {
      'application/octet-stream': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  async downloadBlob(
    @Param('containerName') containerName: string,
    @Param('blobName') blobName: string,
    @Query('directory') directory: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.blobStorageService.downloadBlob(
      containerName,
      directory,
      blobName,
    );

    res.setHeader('Content-Type', result.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.blobName}"`,
    );
    res.setHeader('Content-Length', result.data.length);

    res.send(result.data);
  }

  @Delete(':containerName/:blobName')
  @ApiOperation({
    summary: 'Delete a blob',
    description:
      'Delete a file from Azure Blob Storage from a specific directory',
  })
  @ApiParam({
    name: 'containerName',
    description: 'Nombre del contenedor',
    example: 'uploads',
  })
  @ApiParam({
    name: 'blobName',
    description: 'Nombre del archivo a eliminar',
    example: 'archivo.pdf',
  })
  @ApiQuery({
    name: 'directory',
    description: 'Ruta del directorio (opcional)',
    required: false,
    example: 'documentos/2024',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Blob deleted successfully',
    schema: {
      example: {
        status: {
          statusCode: 200,
          statusDescription: 'Operación completada con éxito.',
        },
        data: {
          message: 'Blob deleted successfully',
          containerName: 'uploads',
          blobName: 'file.pdf',
          fullPath: 'directory/file.pdf',
          requestId: '123e4567-e89b-12d3-a456-426614174000',
        },
      },
    },
  })
  @HttpCode(HttpStatus.OK)
  async deleteBlob(
    @Param('containerName') containerName: string,
    @Param('blobName') blobName: string,
    @Query('directory') directory?: string,
  ): Promise<{
    status: { statusCode: number; statusDescription: string };
    data: {
      message: string;
      containerName: string;
      blobName: string;
      fullPath: string;
      requestId: string;
    };
  }> {
    const result = await this.blobStorageService.deleteBlob(
      containerName,
      directory,
      blobName,
    );

    return {
      status: {
        statusCode: HttpStatus.OK,
        statusDescription: 'Operación completada con éxito.',
      },
      data: {
        message: 'Blob deleted successfully',
        ...result,
      },
    };
  }

  @Get('list/:containerName')
  @ApiOperation({
    summary: 'List blobs',
    description: 'List all blobs in a container',
  })
  @ApiParam({
    name: 'containerName',
    description: 'Nombre del contenedor',
    example: 'uploads',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Blobs listed successfully',
    schema: {
      example: {
        status: {
          statusCode: 200,
          statusDescription: 'Operación completada con éxito.',
        },
        data: {
          blobs: ['documento1.pdf', 'imagen.jpg', 'folder/archivo.xlsx'],
          containerName: 'uploads',
          requestId: '123e4567-e89b-12d3-a456-426614174000',
        },
      },
    },
  })
  async listBlobs(@Param('containerName') containerName: string): Promise<{
    status: { statusCode: number; statusDescription: string };
    data: {
      blobs: string[];
      containerName: string;
      requestId: string;
    };
  }> {
    const result = await this.blobStorageService.listBlobs(containerName);

    return {
      status: {
        statusCode: HttpStatus.OK,
        statusDescription: 'Operación completada con éxito.',
      },
      data: result,
    };
  }

  @Get('list/:containerName/directory')
  @ApiOperation({
    summary: 'List blobs in directory',
    description: 'List all blobs in a specific directory within a container',
  })
  @ApiParam({
    name: 'containerName',
    description: 'Nombre del contenedor',
    example: 'uploads',
  })
  @ApiQuery({
    name: 'directory',
    description: 'Ruta del directorio',
    required: true,
    example: 'documentos/2024',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Blobs listed successfully',
    schema: {
      example: {
        status: {
          statusCode: 200,
          statusDescription: 'Operación completada con éxito.',
        },
        data: {
          blobs: [
            'documentos/2024/factura1.pdf',
            'documentos/2024/reporte.xlsx',
          ],
          containerName: 'uploads',
          directory: 'documentos/2024',
          requestId: '123e4567-e89b-12d3-a456-426614174000',
        },
      },
    },
  })
  async listBlobsInDirectory(
    @Param('containerName') containerName: string,
    @Query('directory') directory: string,
  ): Promise<{
    status: { statusCode: number; statusDescription: string };
    data: {
      blobs: string[];
      containerName: string;
      directory?: string;
      requestId: string;
    };
  }> {
    const result = await this.blobStorageService.listBlobsInDirectory(
      containerName,
      directory,
    );

    return {
      status: {
        statusCode: HttpStatus.OK,
        statusDescription: 'Operación completada con éxito.',
      },
      data: result,
    };
  }
}
