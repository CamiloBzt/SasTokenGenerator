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
/**
 * Controlador HTTP para operaciones sobre Azure Blob Storage.
 *
 * Expone endpoints para:
 * - Subir archivos (multipart y Base64)
 * - Descargar archivos (binario y Base64)
 * - Eliminar, listar, mover y copiar blobs
 * - Exponer blobs de un store privado a uno público (con SAS)
 *
 * Valida tamaño, tipo MIME y extensiones antes de delegar en {@link BlobStorageService}.
 */
export class BlobStorageController {
  /** Límite de tamaño por archivo (MB) para uploads. */
  private readonly MAX_FILE_SIZE_MB = 6;
  /** Límite de tamaño por archivo (bytes) para uploads. */
  private readonly MAX_FILE_SIZE_BYTES = this.MAX_FILE_SIZE_MB * 1024 * 1024;

  constructor(
    private readonly blobStorageService: BlobStorageService,
    private readonly fileValidationService: FileValidationService,
  ) {}

  // ========= Validaciones internas =========

  /**
   * Valida tamaño del archivo multipart (buffer) contra el límite permitido.
   * @throws {BadRequestException} Si el archivo falta o excede el tamaño permitido.
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
   * Valida tamaño de archivo codificado en Base64 y retorna el tamaño calculado.
   * @param fileBase64 Cadena Base64 (sin encabezados data URI).
   * @returns Tamaño calculado en bytes.
   * @throws {BadRequestException} Si falta contenido o excede el límite.
   */
  private validateBase64FileSize(fileBase64: string): number {
    if (!fileBase64 || fileBase64.trim() === '') {
      throw new BadRequestException(ErrorMessages.FILE_BASE64_MISSING);
    }

    // Estimación de tamaño: cada 4 chars ~ 3 bytes
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
   * Verifica que el tipo MIME esté entre los permitidos.
   * @throws {BadRequestException} Si el `mimeType` es vacío o no permitido.
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
      // Comprimidos
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
        `${ErrorMessages.MIME_TYPE_NOT_ALLOWED} Tipo recibido: ${mimeType}. Tipos permitidos: PDF, Word, Excel, PowerPoint, imágenes (JPEG, PNG, GIF), audio, video, comprimidos, JSON, XML.`,
      );
    }
  }

  // ========= Endpoints =========

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiUploadOperation('multipart', 6)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description:
      'Blob upload data (máx. 6MB). La extensión del archivo original debe coincidir con la extensión en blobName.',
    type: UploadBlobDto,
  })
  @HttpCode(HttpStatus.OK)
  /**
   * Sube un archivo mediante multipart/form-data.
   *
   * Valida tamaño, extensión y coherencia MIME/extension. Delegado a {@link BlobStorageService.uploadBlob}.
   * @param file Archivo subido (campo `file`).
   * @param uploadBlobDto Datos de destino (contenedor, directorio, nombre de blob).
   * @returns Metadatos del blob creado (URL, rutas y requestId).
   */
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
    this.validateMultipartFileSize(file);
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
    description:
      'Base64 blob upload (máx. 6MB). El mimeType debe coincidir con la extensión en blobName.',
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
  /**
   * Sube un archivo codificado en Base64.
   *
   * Valida tipo MIME, tamaño y coherencia MIME/extensión. Delegado a {@link BlobStorageService.uploadBlobBase64}.
   * @param uploadBlobBase64Dto Parámetros de subida Base64 (contenedor, blob, directorio, base64, mimeType).
   */
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
    this.validateMimeType(uploadBlobBase64Dto.mimeType);
    this.validateBase64FileSize(uploadBlobBase64Dto.fileBase64);

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
    description: 'Descarga binaria de un blob.',
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
        schema: { type: 'string', format: 'binary' },
      },
    },
  })
  @HttpCode(HttpStatus.OK)
  /**
   * Descarga un blob y responde con contenido binario (stream).
   *
   * @param downloadBlobDto Ubicación del blob (contenedor/directorio/nombre).
   * @param res Respuesta HTTP (se setean headers y se envía el binario).
   */
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
    description: 'Descarga un blob y retorna su contenido en Base64.',
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
  /**
   * Descarga un blob y retorna su contenido codificado en Base64.
   *
   * @param downloadBlobBase64Dto Ubicación del blob.
   * @returns Metadatos del blob y contenido en Base64.
   */
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
      'Elimina un blob del contenedor (opcionalmente en un directorio).',
  })
  @ApiBody({
    description: 'Parámetros de eliminación',
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
  /**
   * Elimina un blob existente.
   *
   * @param deleteBlobDto Ubicación del blob a eliminar.
   * @returns Confirmación y metadatos del blob eliminado.
   */
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
      data: { message: 'Blob deleted successfully', ...result },
    };
  }

  @Post('list')
  @ApiOperation({
    summary: 'List blobs',
    description:
      'Lista blobs de un contenedor o de un directorio específico dentro del contenedor.',
  })
  @ApiBody({
    description: 'Parámetros de listado',
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
  /**
   * Lista blobs de un contenedor, opcionalmente filtrando por un directorio/prefijo.
   * @param listBlobsDto Contenedor y (opcional) directorio.
   */
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
    description: 'Parámetros para mover un blob',
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
  /**
   * Mueve un blob a otra ruta (posible renombrado).
   *
   * Implementado como copy + delete atómico en el backend.
   * @param moveBlobDto Rutas de origen y destino.
   */
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
    description: 'Parámetros para copiar un blob',
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
  /**
   * Copia un blob a otra ruta (posible duplicado/renombrado).
   * @param copyBlobDto Rutas de origen y destino.
   */
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
    description: 'Exponer un blob privado en un store público (con SAS).',
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
  /**
   * Expone un blob del store privado en un store público, generando una URL con SAS.
   *
   * Por defecto usa **copia directa** entre contenedores (más eficiente). Puede forzarse
   * el modo **descarga/subida** si `useDirectCopy = false`.
   *
   * @param exposePublicBlobDto Parámetros de exposición pública (contenedor, blob, directorio, expiración, base64, estrategia).
   * @returns Datos del SAS público y metadatos del blob expuesto.
   */
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
      data: { ...result, useDirectCopy },
    };
  }

  @Post('list-public')
  @ApiListPublicBlobsOperation()
  @ApiBody({
    description: 'Listar blobs en el store público',
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
  /**
   * Lista blobs del store público (opcionalmente filtrando por directorio/prefijo).
   * @param listPublicBlobsDto Directorio opcional.
   */
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
