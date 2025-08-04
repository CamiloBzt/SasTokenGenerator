import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  ApiCopyBlobOperation,
  ApiDownloadOperation,
  ApiExposePublicBlobOperation,
  ApiListPublicBlobsOperation,
  ApiMoveBlobOperation,
  ApiSuccessResponse,
  ApiUploadOperation,
} from '@src/shared/decorators/swagger-responses.decorator';
import { CopyBlobDto } from '@src/shared/dto/copy-blob.dto';
import { DeleteBlobDto } from '@src/shared/dto/delete-blob.dto';
import { DownloadBlobBase64Dto } from '@src/shared/dto/download-blob-base64.dto';
import { DownloadBlobDto } from '@src/shared/dto/download-blob.dto';
import { ExposePublicBlobDto } from '@src/shared/dto/expose-public-blob.dto';
import { ListBlobsDto } from '@src/shared/dto/list-blobs.dto';
import { ListPublicBlobsDto } from '@src/shared/dto/list-public-blobs.dto';
import { MoveBlobDto } from '@src/shared/dto/move-blob.dto';
import { UploadBlobBase64Dto } from '@src/shared/dto/upload-blob-base64.dto';
import { UploadBlobDto } from '@src/shared/dto/upload-blob-dto';
import { ErrorMessages } from '@src/shared/enums/error-messages.enum';
import { BadRequestException } from '@src/shared/exceptions/bad-request.exception';
import { BlobListResponse } from '@src/shared/interfaces/services/blob-storage/list-blobs.interface';
import { Response } from 'express';
import { BlobStorageService } from '../services/blob-storage/blob-storage.service';
import { FileValidationService } from '../services/file-validation.service';

@ApiTags('Blob Storage')
@Controller('blob')
export class BlobStorageController {
  // Configuración de límites de archivo
  private readonly MAX_FILE_SIZE_MB = 6; // 6MB límite
  private readonly MAX_FILE_SIZE_BYTES = this.MAX_FILE_SIZE_MB * 1024 * 1024;

  constructor(
    private readonly blobStorageService: BlobStorageService,
    private readonly fileValidationService: FileValidationService,
  ) {}

  /**
   * Valida el tamaño del archivo multipart
   */
  private validateMultipartFileSize(file: Express.Multer.File): void {
    if (!file || !file.buffer) {
      throw new BadRequestException(ErrorMessages.FILE_MISSING);
    }

    if (file.buffer.length > this.MAX_FILE_SIZE_BYTES) {
      const fileSizeMB = (file.buffer.length / 1024 / 1024).toFixed(2);
      throw new BadRequestException(
        `${ErrorMessages.FILE_TOO_LARGE} Tamaño actual: ${fileSizeMB}MB. Máximo permitido: ${this.MAX_FILE_SIZE_MB}MB`,
      );
    }
  }

  /**
   * Valida el tamaño del archivo Base64
   */
  private validateBase64FileSize(fileBase64: string): number {
    if (!fileBase64 || fileBase64.trim() === '') {
      throw new BadRequestException(ErrorMessages.FILE_BASE64_MISSING);
    }

    // Calcular el tamaño real del archivo desde Base64
    const fileSizeBytes = Math.ceil((fileBase64.length * 3) / 4);
    if (fileSizeBytes > this.MAX_FILE_SIZE_BYTES) {
      const fileSizeMB = (fileSizeBytes / 1024 / 1024).toFixed(2);
      throw new BadRequestException(
        `${ErrorMessages.FILE_TOO_LARGE} Tamaño actual: ${fileSizeMB}MB. Máximo permitido: ${this.MAX_FILE_SIZE_MB}MB`,
      );
    }

    return fileSizeBytes;
  }

  /**
   * Valida que el tipo MIME sea válido
   */
  private validateMimeType(mimeType: string): void {
    if (!mimeType || mimeType.trim() === '') {
      throw new BadRequestException(ErrorMessages.MIME_TYPE_MISSING);
    }

    const allowedMimeTypes = [
      // Documentos
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'text/csv',
      // Imágenes
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/bmp',
      'image/webp',
      'image/svg+xml',
      // Audio
      'audio/mpeg',
      'audio/wav',
      'audio/mp3',
      // Video
      'video/mp4',
      'video/avi',
      'video/quicktime',
      // Archivos comprimidos
      'application/zip',
      'application/x-rar-compressed',
      'application/x-7z-compressed',
      // JSON/XML
      'application/json',
      'application/xml',
      'text/xml',
    ];

    if (!allowedMimeTypes.includes(mimeType.toLowerCase())) {
      throw new BadRequestException(
        `${ErrorMessages.MIME_TYPE_NOT_ALLOWED} Tipo recibido: ${mimeType}. Tipos permitidos: PDF, Word, Excel, PowerPoint, imágenes (JPEG, PNG, GIF), audio, video, archivos comprimidos, JSON, XML.`,
      );
    }
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiUploadOperation('multipart', 6)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: `Blob upload data (Max 6MB). La extensión del archivo original debe coincidir con la extensión en blobName.`,
    type: UploadBlobDto,
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
    // Validar tamaño del archivo
    this.validateMultipartFileSize(file);

    // Validar extensiones y compatibilidad
    this.fileValidationService.validateMultipartUpload(
      file,
      uploadBlobDto.blobName,
    );

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

  @Post('upload/base64')
  @ApiUploadOperation('base64', 6)
  @ApiBody({
    description: `Base64 blob upload data (Max 6MB). El mimeType debe coincidir con la extensión en blobName.`,
    type: UploadBlobBase64Dto,
    examples: {
      pdfExample: {
        summary: 'Upload PDF in Base64',
        value: {
          containerName: 'uploads',
          blobName: 'documento.pdf',
          directory: 'documentos/2024',
          fileBase64: 'fileBase64',
          mimeType: 'application/pdf',
        },
      },
      imageExample: {
        summary: 'Upload Image in Base64',
        value: {
          containerName: 'uploads',
          blobName: 'imagen.jpg',
          fileBase64: 'fileBase64',
          mimeType: 'image/jpeg',
        },
      },
    },
  })
  @HttpCode(HttpStatus.OK)
  async uploadBlobBase64(
    @Body() uploadBlobBase64Dto: UploadBlobBase64Dto,
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
    // Validar tipo MIME
    this.validateMimeType(uploadBlobBase64Dto.mimeType);

    // Validar tamaño del archivo Base64
    const fileSizeBytes = this.validateBase64FileSize(
      uploadBlobBase64Dto.fileBase64,
    );

    // Validar que el MIME type coincida con la extensión del blob
    this.fileValidationService.validateBase64Upload(
      uploadBlobBase64Dto.mimeType,
      uploadBlobBase64Dto.blobName,
    );

    const result = await this.blobStorageService.uploadBlobBase64(
      uploadBlobBase64Dto.containerName,
      uploadBlobBase64Dto.directory,
      uploadBlobBase64Dto.blobName,
      uploadBlobBase64Dto.fileBase64,
      uploadBlobBase64Dto.mimeType,
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
  @ApiDownloadOperation('binary')
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

  @Post('download/base64')
  @ApiDownloadOperation('base64')
  @ApiBody({
    description: 'Download blob data for Base64 response',
    type: DownloadBlobBase64Dto,
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
  @HttpCode(HttpStatus.OK)
  async downloadBlobBase64(
    @Body() downloadBlobBase64Dto: DownloadBlobBase64Dto,
  ): Promise<{
    status: { statusCode: number; statusDescription: string };
    data: {
      fileBase64: string;
      contentType: string;
      containerName: string;
      blobName: string;
      fullPath: string;
      size: number;
      requestId: string;
    };
  }> {
    const result = await this.blobStorageService.downloadBlobBase64(
      downloadBlobBase64Dto.containerName,
      downloadBlobBase64Dto.directory,
      downloadBlobBase64Dto.blobName,
    );

    return {
      status: {
        statusCode: HttpStatus.OK,
        statusDescription: 'Operación completada con éxito.',
      },
      data: result,
    };
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
  @ApiSuccessResponse('Blob deleted successfully', {
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
    description:
      'List all blobs in a container or in a specific directory within a container',
  })
  @ApiBody({
    description:
      'List blobs data. If directory is provided, only blobs in that directory will be listed.',
    type: ListBlobsDto,
    examples: {
      listAllBlobs: {
        summary: 'List all blobs in container',
        value: {
          containerName: 'uploads',
        },
      },
      listBlobsInDirectory: {
        summary: 'List blobs in specific directory',
        value: {
          containerName: 'uploads',
          directory: 'documentos/2024',
        },
      },
      listBlobsInNestedDirectory: {
        summary: 'List blobs in nested directory',
        value: {
          containerName: 'uploads',
          directory: 'projects/2024/reports',
        },
      },
    },
  })
  @ApiSuccessResponse('Blobs listed successfully', {
    status: {
      statusCode: 200,
      statusDescription: 'Operación completada con éxito.',
    },
    data: {
      blobs: ['documento1.pdf', 'imagen.jpg', 'folder/archivo.xlsx'],
      containerName: 'uploads',
      directory: 'documentos/2024',
      requestId: '123e4567-e89b-12d3-a456-426614174000',
    },
  })
  @HttpCode(HttpStatus.OK)
  async listBlobs(@Body() listBlobsDto: ListBlobsDto): Promise<{
    status: { statusCode: number; statusDescription: string };
    data: BlobListResponse;
  }> {
    const result = await this.blobStorageService.listBlobs(
      listBlobsDto.containerName,
      listBlobsDto.directory,
    );

    return {
      status: {
        statusCode: HttpStatus.OK,
        statusDescription: 'Operación completada con éxito.',
      },
      data: result,
    };
  }

  @Post('move')
  @ApiMoveBlobOperation()
  @ApiBody({
    description: 'Move blob data',
    type: MoveBlobDto,
    examples: {
      moveToDirectory: {
        summary: 'Move to different directory',
        value: {
          containerName: 'uploads',
          sourceBlobPath: 'temporal/documento.pdf',
          destinationBlobPath: 'documentos/2024/documento-final.pdf',
        },
      },
      renameFile: {
        summary: 'Rename file in same directory',
        value: {
          containerName: 'uploads',
          sourceBlobPath: 'documentos/draft.pdf',
          destinationBlobPath: 'documentos/final-version.pdf',
        },
      },
      reorganizeStructure: {
        summary: 'Reorganize file structure',
        value: {
          containerName: 'uploads',
          sourceBlobPath: 'Archivo_1.pdf',
          destinationBlobPath: 'documentos/2025/Archivo_1.pdf',
        },
      },
    },
  })
  @HttpCode(HttpStatus.OK)
  async moveBlobPost(@Body() moveBlobDto: MoveBlobDto): Promise<{
    status: { statusCode: number; statusDescription: string };
    data: {
      message: string;
      containerName: string;
      sourcePath: string;
      destinationPath: string;
      requestId: string;
    };
  }> {
    const result = await this.blobStorageService.moveBlob(
      moveBlobDto.containerName,
      moveBlobDto.sourceBlobPath,
      moveBlobDto.destinationBlobPath,
    );

    return {
      status: {
        statusCode: HttpStatus.OK,
        statusDescription: 'Operación completada con éxito.',
      },
      data: result,
    };
  }

  @Post('copy')
  @ApiCopyBlobOperation()
  @ApiBody({
    description: 'Copy blob data',
    type: CopyBlobDto,
    examples: {
      copyToBackup: {
        summary: 'Copy to backup directory',
        value: {
          containerName: 'uploads',
          sourceBlobPath: 'documentos/importante.pdf',
          destinationBlobPath: 'backup/documentos/importante-backup.pdf',
        },
      },
      duplicateFile: {
        summary: 'Create duplicate with different name',
        value: {
          containerName: 'uploads',
          sourceBlobPath: 'plantillas/template.docx',
          destinationBlobPath: 'plantillas/template-v2.docx',
        },
      },
      copyToWorkingDirectory: {
        summary: 'Copy to working directory',
        value: {
          containerName: 'uploads',
          sourceBlobPath: 'archivos/original.pdf',
          destinationBlobPath: 'trabajo/en-progreso.pdf',
        },
      },
    },
  })
  @HttpCode(HttpStatus.OK)
  async copyBlobPost(@Body() copyBlobDto: CopyBlobDto): Promise<{
    status: { statusCode: number; statusDescription: string };
    data: {
      message: string;
      containerName: string;
      sourcePath: string;
      destinationPath: string;
      requestId: string;
    };
  }> {
    const result = await this.blobStorageService.copyBlob(
      copyBlobDto.containerName,
      copyBlobDto.sourceBlobPath,
      copyBlobDto.destinationBlobPath,
    );

    return {
      status: {
        statusCode: HttpStatus.OK,
        statusDescription: 'Operación completada con éxito.',
      },
      data: result,
    };
  }

  @Post('expose-public')
  @ApiExposePublicBlobOperation()
  @ApiBody({
    description:
      'Datos del archivo a exponer públicamente con opción de método',
    type: ExposePublicBlobDto,
    examples: {
      defaultDirectCopy: {
        summary: 'Exposición por copia directa (por defecto - recomendado)',
        description:
          'Método más eficiente que copia directamente entre contenedores sin descargar/subir',
        value: {
          containerName: 'contenedor',
          blobName: 'documento.pdf',
          directory: 'directorio/2000000000',
          expirationMinutes: 60,
          base64: false,
        },
      },
      explicitDirectCopy: {
        summary: 'Exposición por copia directa (explícito)',
        description: 'Especifica explícitamente usar copia directa',
        value: {
          containerName: 'contenedor',
          blobName: 'imagen.jpg',
          directory: 'directorio/2000000000',
          expirationMinutes: 120,
          base64: true,
          useDirectCopy: true,
        },
      },
      downloadUploadMethod: {
        summary: 'Exposición por descarga/subida (legacy)',
        description:
          'Método legacy que descarga y luego sube. Usar solo si hay problemas con copia directa',
        value: {
          containerName: 'contenedor',
          blobName: 'reporte.xlsx',
          directory: 'directorio/2000000000',
          expirationMinutes: 30,
          base64: false,
          useDirectCopy: false,
        },
      },
      largeFileOptimized: {
        summary: 'Archivo grande con copia optimizada',
        description:
          'Para archivos grandes, la copia directa es significativamente más rápida',
        value: {
          containerName: 'contenedor',
          blobName: 'video-presentation.mp4',
          directory: 'directorio/2000000000',
          expirationMinutes: 180,
          base64: false,
          useDirectCopy: true,
        },
      },
    },
  })
  @HttpCode(HttpStatus.OK)
  async exposePublicBlob(
    @Body() exposePublicBlobDto: ExposePublicBlobDto,
  ): Promise<{
    status: { statusCode: number; statusDescription: string };
    data: {
      sasToken: string;
      sasUrl: string;
      permissions: string;
      expiresOn: Date;
      fileBase64?: string;
      contentType: string;
      containerName: string;
      blobName: string;
      fullPath: string;
      size: number;
      requestId: string;
      useDirectCopy: boolean;
    };
  }> {
    const useDirectCopy = exposePublicBlobDto.useDirectCopy ?? true;

    const result = await this.blobStorageService.exposePublicBlob(
      {
        privateContainerName: exposePublicBlobDto.containerName,
        directory: exposePublicBlobDto.directory || '',
        blobName: exposePublicBlobDto.blobName,
        expirationMinutes: exposePublicBlobDto.expirationMinutes ?? 60,
        includeBase64: exposePublicBlobDto.base64 ?? false,
      },
      useDirectCopy,
    );

    return {
      status: {
        statusCode: HttpStatus.OK,
        statusDescription: 'Operación completada con éxito.',
      },
      data: {
        ...result,
        useDirectCopy,
      },
    };
  }

  @Post('list-public')
  @ApiListPublicBlobsOperation()
  @ApiBody({
    description: 'Parámetros para listar archivos del store público',
    type: ListPublicBlobsDto,
    examples: {
      listAll: {
        summary: 'Listar todos los archivos públicos',
        value: {},
      },
      listByDirectory: {
        summary: 'Listar archivos de un directorio específico',
        value: {
          directory: 'afiliaciones/2000000005',
        },
      },
      listReports: {
        summary: 'Listar reportes mensuales',
        value: {
          directory: 'reportes/mensuales',
        },
      },
    },
  })
  @HttpCode(HttpStatus.OK)
  async listPublicBlobs(
    @Body() listPublicBlobsDto: ListPublicBlobsDto,
  ): Promise<{
    status: { statusCode: number; statusDescription: string };
    data: BlobListResponse;
  }> {
    const result = await this.blobStorageService.listPublicBlobs(
      listPublicBlobsDto.directory,
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
