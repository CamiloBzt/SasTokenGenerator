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
import { CopyBlobDto } from '@src/shared/dto/copy-blob.dto';
import { DeleteBlobDto } from '@src/shared/dto/delete-blob.dto';
import { DownloadBlobBase64Dto } from '@src/shared/dto/download-blob-base64.dto';
import { DownloadBlobDto } from '@src/shared/dto/download-blob.dto';
import { ListBlobsInDirectoryDto } from '@src/shared/dto/list-blobs-directory.dto';
import { ListBlobsDto } from '@src/shared/dto/list-blobs.dto';
import { MoveBlobDto } from '@src/shared/dto/move-blob.dto';
import { UploadBlobBase64Dto } from '@src/shared/dto/upload-blob-base64.dto';
import { UploadBlobDto } from '@src/shared/dto/upload-blob-dto';
import { ErrorMessages } from '@src/shared/enums/error-messages.enum';
import { BadRequestException } from '@src/shared/exceptions/bad-request.exception';
import { Response } from 'express';
import { BlobStorageService } from '../services/blob-storage.service';
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
  @ApiOperation({
    summary: 'Upload a blob (Multipart)',
    description: `Upload a file to Azure Blob Storage using multipart/form-data. Máximo ${6}MB por archivo. La extensión del archivo debe coincidir con el nombre del blob.`,
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: `Blob upload data (Max ${6}MB). La extensión del archivo original debe coincidir con la extensión en blobName.`,
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
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'File too large, invalid extension, or extension mismatch',
    schema: {
      example: {
        status: {
          statusCode: 400,
          statusDescription:
            "La extensión del archivo original '.jpg' no coincide con la extensión del blob '.pdf'.",
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
    // Validar tamaño del archivo
    this.validateMultipartFileSize(file);

    // Validar extensiones y compatibilidad
    this.fileValidationService.validateMultipartUpload(
      file,
      uploadBlobDto.blobName,
    );

    console.log(
      `Uploading file: ${file.originalname} -> ${uploadBlobDto.blobName}, Size: ${(file.buffer.length / 1024 / 1024).toFixed(2)}MB, Type: ${file.mimetype}`,
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
  @ApiOperation({
    summary: 'Upload a blob (Base64)',
    description: `Upload a file to Azure Blob Storage using Base64 encoding. Máximo ${6}MB por archivo. El tipo MIME debe coincidir con la extensión del blob.`,
  })
  @ApiBody({
    description: `Base64 blob upload data (Max ${6}MB). El mimeType debe coincidir con la extensión en blobName.`,
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
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Base64 blob uploaded successfully',
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
          blobName: 'documento.pdf',
          fullPath: 'directory/documento.pdf',
          requestId: '123e4567-e89b-12d3-a456-426614174000',
        },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description:
      'File too large, invalid Base64, unsupported file type, or MIME type mismatch',
    schema: {
      example: {
        status: {
          statusCode: 400,
          statusDescription:
            "La extensión '.pdf' no coincide con el tipo MIME 'image/jpeg'. Extensiones válidas: .jpg, .jpeg",
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

    console.log(
      `Uploading Base64 file: ${uploadBlobBase64Dto.blobName}, Size: ${(fileSizeBytes / 1024 / 1024).toFixed(2)}MB, Type: ${uploadBlobBase64Dto.mimeType}`,
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
  @ApiOperation({
    summary: 'Download a blob (Binary)',
    description: 'Download a file from Azure Blob Storage as binary data',
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

  @Post('download/base64')
  @ApiOperation({
    summary: 'Download a blob (Base64)',
    description:
      'Download a file from Azure Blob Storage as Base64 encoded string',
  })
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
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Blob downloaded successfully as Base64',
    schema: {
      example: {
        status: {
          statusCode: 200,
          statusDescription: 'Operación completada con éxito.',
        },
        data: {
          fileBase64: 'fileBase64',
          contentType: 'application/pdf',
          containerName: 'uploads',
          blobName: 'archivo.pdf',
          fullPath: 'documentos/2024/archivo.pdf',
          size: 1024,
          requestId: '123e4567-e89b-12d3-a456-426614174000',
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

    console.log(
      `Downloaded Base64 file: ${result.blobName}, Size: ${(result.size / 1024 / 1024).toFixed(2)}MB, Type: ${result.contentType}`,
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

  @Post('move')
  @ApiOperation({
    summary: 'Move a blob to a different location',
    description:
      'Move a file from one location to another within the same container. This operation copies the file to the new location and then deletes the original. If the destination already exists, it will be overwritten.',
  })
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
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Blob moved successfully',
    schema: {
      example: {
        status: {
          statusCode: 200,
          statusDescription: 'Operación completada con éxito.',
        },
        data: {
          message: 'Blob moved successfully',
          containerName: 'uploads',
          sourcePath: 'temporal/documento.pdf',
          destinationPath: 'documentos/2024/documento-final.pdf',
          requestId: '123e4567-e89b-12d3-a456-426614174000',
        },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid request - same source and destination paths',
    schema: {
      example: {
        status: {
          statusCode: 400,
          statusDescription:
            'La ruta de origen y destino no pueden ser la misma.',
        },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.PARTIAL_CONTENT,
    description: 'Source blob not found',
    schema: {
      example: {
        status: {
          statusCode: 206,
          statusDescription: 'El archivo especificado no existe.',
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
  @ApiOperation({
    summary: 'Copy a blob to a different location',
    description:
      'Copy a file from one location to another within the same container. The original file remains unchanged. If the destination already exists, it will be overwritten.',
  })
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
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Blob copied successfully',
    schema: {
      example: {
        status: {
          statusCode: 200,
          statusDescription: 'Operación completada con éxito.',
        },
        data: {
          message: 'Blob copied successfully',
          containerName: 'uploads',
          sourcePath: 'documentos/importante.pdf',
          destinationPath: 'backup/documentos/importante-backup.pdf',
          requestId: '123e4567-e89b-12d3-a456-426614174000',
        },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid request - same source and destination paths',
    schema: {
      example: {
        status: {
          statusCode: 400,
          statusDescription:
            'La ruta de origen y destino no pueden ser la misma.',
        },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.PARTIAL_CONTENT,
    description: 'Source blob not found',
    schema: {
      example: {
        status: {
          statusCode: 206,
          statusDescription: 'El archivo especificado no existe.',
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
}
