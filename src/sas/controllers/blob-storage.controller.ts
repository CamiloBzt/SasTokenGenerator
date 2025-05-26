import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UploadedFile,
  UseInterceptors
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiTags
} from '@nestjs/swagger';
import { DeleteBlobDto } from '@src/shared/dto/delete-blob.dto';
import { DownloadBlobDto } from '@src/shared/dto/download-blob.dto';
import { ListBlobsInDirectoryDto } from '@src/shared/dto/list-blobs-directory.dto';
import { ListBlobsDto } from '@src/shared/dto/list-blobs.dto';
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

  @Post('download')
  @ApiOperation({
    summary: 'Download a blob',
    description:
      'Download a file from Azure Blob Storage from a specific directory',
  })
  @ApiBody({
    description: 'Download blob data',
    type: DownloadBlobDto,
    examples: {
      withDirectory: {
        summary: 'Download with directory',
        value: {
          containerName: 'uploads',
          blobName: 'archivo.pdf',
          directory: 'documentos/2024',
        },
      },
      withoutDirectory: {
        summary: 'Download without directory',
        value: {
          containerName: 'uploads',
          blobName: 'archivo.pdf',
        },
      },
    },
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
  @HttpCode(HttpStatus.OK)
  async downloadBlobPost(
    @Body() downloadBlobDto: DownloadBlobDto,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.blobStorageService.downloadBlob(
      downloadBlobDto.containerName,
      downloadBlobDto.directory,
      downloadBlobDto.blobName,
    );

    res.setHeader('Content-Type', result.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.blobName}"`,
    );
    res.setHeader('Content-Length', result.data.length);

    res.send(result.data);
  }

  @Post('delete')
  @ApiOperation({
    summary: 'Delete a blob',
    description:
      'Delete a file from Azure Blob Storage from a specific directory',
  })
  @ApiBody({
    description: 'Delete blob data',
    type: DeleteBlobDto,
    examples: {
      withDirectory: {
        summary: 'Delete with directory',
        value: {
          containerName: 'uploads',
          blobName: 'archivo.pdf',
          directory: 'documentos/2024',
        },
      },
      withoutDirectory: {
        summary: 'Delete without directory',
        value: {
          containerName: 'uploads',
          blobName: 'archivo.pdf',
        },
      },
    },
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
  async deleteBlobPost(@Body() deleteBlobDto: DeleteBlobDto): Promise<{
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
      deleteBlobDto.containerName,
      deleteBlobDto.directory,
      deleteBlobDto.blobName,
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

  @Post('list')
  @ApiOperation({
    summary: 'List blobs',
    description: 'List all blobs in a container',
  })
  @ApiBody({
    description: 'List blobs data',
    type: ListBlobsDto,
    examples: {
      example: {
        summary: 'List all blobs in container',
        value: {
          containerName: 'uploads',
        },
      },
    },
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
  @HttpCode(HttpStatus.OK)
  async listBlobsPost(@Body() listBlobsDto: ListBlobsDto): Promise<{
    status: { statusCode: number; statusDescription: string };
    data: {
      blobs: string[];
      containerName: string;
      requestId: string;
    };
  }> {
    const result = await this.blobStorageService.listBlobs(
      listBlobsDto.containerName,
    );

    return {
      status: {
        statusCode: HttpStatus.OK,
        statusDescription: 'Operación completada con éxito.',
      },
      data: result,
    };
  }

  @Post('list/directory')
  @ApiOperation({
    summary: 'List blobs in directory',
    description: 'List all blobs in a specific directory within a container',
  })
  @ApiBody({
    description: 'List blobs in directory data',
    type: ListBlobsInDirectoryDto,
    examples: {
      example: {
        summary: 'List blobs in specific directory',
        value: {
          containerName: 'uploads',
          directory: 'documentos/2024',
        },
      },
    },
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
  @HttpCode(HttpStatus.OK)
  async listBlobsInDirectoryPost(
    @Body() listBlobsInDirectoryDto: ListBlobsInDirectoryDto,
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
      listBlobsInDirectoryDto.containerName,
      listBlobsInDirectoryDto.directory,
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
