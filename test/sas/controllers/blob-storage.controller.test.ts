import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BlobStorageController } from '@src/sas/controllers/blob-storage.controller';
import { BlobStorageService } from '@src/sas/services/blob-storage/blob-storage.service';
import { FileValidationService } from '@src/sas/services/file-validation.service';
import { CopyBlobDto } from '@src/shared/dto/copy-blob.dto';
import { DownloadBlobBase64Dto } from '@src/shared/dto/download-blob-base64.dto';
import { MoveBlobDto } from '@src/shared/dto/move-blob.dto';
import { UploadBlobBase64Dto } from '@src/shared/dto/upload-blob-base64.dto';
import { UploadBlobDto } from '@src/shared/dto/upload-blob-dto';
import { ErrorMessages } from '@src/shared/enums/error-messages.enum';
import { BadRequestException } from '@src/shared/exceptions/bad-request.exception';
import { BusinessErrorException } from '@src/shared/exceptions/business-error.exception';

describe('BlobStorageController', () => {
  let blobStorageController: BlobStorageController;
  let blobStorageService: Partial<BlobStorageService>;
  let fileValidationService: Partial<FileValidationService>;

  beforeEach(async () => {
    blobStorageService = {
      uploadBlob: jest.fn(),
      uploadBlobBase64: jest.fn(),
      downloadBlob: jest.fn(),
      downloadBlobBase64: jest.fn(),
      deleteBlob: jest.fn(),
      listBlobs: jest.fn(),
      moveBlob: jest.fn(),
      copyBlob: jest.fn(),
      exposePublicBlob: jest.fn(),
      listPublicBlobs: jest.fn(),
    };

    fileValidationService = {
      validateMultipartUpload: jest.fn(),
      validateBase64Upload: jest.fn(),
      validateBlobNameExtension: jest.fn(),
      validateFileExtensionMatch: jest.fn(),
      validateMimeTypeAndExtension: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BlobStorageController],
      providers: [
        {
          provide: BlobStorageService,
          useValue: blobStorageService,
        },
        {
          provide: FileValidationService,
          useValue: fileValidationService,
        },
      ],
    }).compile();

    blobStorageController = module.get<BlobStorageController>(
      BlobStorageController,
    );
  });

  describe('uploadBlob (Multipart)', () => {
    it('should upload a blob successfully', async () => {
      const mockFile = {
        fieldname: 'file',
        originalname: 'test.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('test file content'),
      } as Express.Multer.File;

      const uploadDto: UploadBlobDto = {
        containerName: 'uploads',
        directory: 'documents/2024',
        blobName: 'test.pdf',
        file: null,
      };

      const mockResult = {
        blobUrl:
          'https://account.blob.core.windows.net/uploads/documents/2024/test.pdf',
        containerName: 'uploads',
        blobName: 'test.pdf',
        fullPath: 'documents/2024/test.pdf',
        requestId: '123e4567-e89b-12d3-a456-426614174000',
      };

      (blobStorageService.uploadBlob as jest.Mock).mockResolvedValue(
        mockResult,
      );

      const result = await blobStorageController.uploadBlob(
        mockFile,
        uploadDto,
      );

      expect(result).toEqual({
        status: {
          statusCode: HttpStatus.OK,
          statusDescription: 'Operación completada con éxito.',
        },
        data: {
          ...mockResult,
        },
      });

      expect(
        fileValidationService.validateMultipartUpload,
      ).toHaveBeenCalledWith(mockFile, uploadDto.blobName);

      expect(blobStorageService.uploadBlob).toHaveBeenCalledWith(
        uploadDto.containerName,
        uploadDto.directory,
        uploadDto.blobName,
        mockFile,
      );
    });

    it('should throw error when file is missing', async () => {
      const uploadDto: UploadBlobDto = {
        containerName: 'uploads',
        blobName: 'test.pdf',
        file: null,
      };

      await expect(
        blobStorageController.uploadBlob(null as any, uploadDto),
      ).rejects.toThrow(new BadRequestException(ErrorMessages.FILE_MISSING));

      expect(
        fileValidationService.validateMultipartUpload,
      ).not.toHaveBeenCalled();
    });

    it('should throw error when file buffer is missing', async () => {
      const mockFile = {
        fieldname: 'file',
        originalname: 'test.pdf',
        buffer: null,
      } as any;

      const uploadDto: UploadBlobDto = {
        containerName: 'uploads',
        blobName: 'test.pdf',
        file: null,
      };

      await expect(
        blobStorageController.uploadBlob(mockFile, uploadDto),
      ).rejects.toThrow(new BadRequestException(ErrorMessages.FILE_MISSING));

      expect(
        fileValidationService.validateMultipartUpload,
      ).not.toHaveBeenCalled();
    });

    it('should throw error when file is too large', async () => {
      const largeBuffer = Buffer.alloc(7 * 1024 * 1024);
      const mockFile = {
        fieldname: 'file',
        originalname: 'large.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: largeBuffer.length,
        buffer: largeBuffer,
      } as Express.Multer.File;

      const uploadDto: UploadBlobDto = {
        containerName: 'uploads',
        blobName: 'large.pdf',
        file: null,
      };

      await expect(
        blobStorageController.uploadBlob(mockFile, uploadDto),
      ).rejects.toThrow(
        new BadRequestException(
          `${ErrorMessages.FILE_TOO_LARGE} Tamaño actual: 7.00MB. Máximo permitido: 6MB`,
        ),
      );

      expect(
        fileValidationService.validateMultipartUpload,
      ).not.toHaveBeenCalled();
    });

    it('should throw error when file extension validation fails', async () => {
      const mockFile = {
        fieldname: 'file',
        originalname: 'test.jpg',
        encoding: '7bit',
        mimetype: 'image/jpeg',
        size: 1024,
        buffer: Buffer.from('test file content'),
      } as Express.Multer.File;

      const uploadDto: UploadBlobDto = {
        containerName: 'uploads',
        blobName: 'test.pdf',
        file: null,
      };

      (
        fileValidationService.validateMultipartUpload as jest.Mock
      ).mockImplementation(() => {
        throw new BadRequestException(ErrorMessages.FILE_EXTENSION_MISMATCH);
      });

      await expect(
        blobStorageController.uploadBlob(mockFile, uploadDto),
      ).rejects.toThrow(
        new BadRequestException(ErrorMessages.FILE_EXTENSION_MISMATCH),
      );

      expect(
        fileValidationService.validateMultipartUpload,
      ).toHaveBeenCalledWith(mockFile, uploadDto.blobName);

      expect(blobStorageService.uploadBlob).not.toHaveBeenCalled();
    });
  });

  describe('uploadBlobBase64', () => {
    it('should upload a Base64 blob successfully', async () => {
      const uploadDto: UploadBlobBase64Dto = {
        containerName: 'uploads',
        directory: 'documents/2024',
        blobName: 'test.pdf',
        fileBase64: 'JVBERi0xLjQK',
        mimeType: 'application/pdf',
      };

      const mockResult = {
        blobUrl:
          'https://account.blob.core.windows.net/uploads/documents/2024/test.pdf',
        containerName: 'uploads',
        blobName: 'test.pdf',
        fullPath: 'documents/2024/test.pdf',
        requestId: '123e4567-e89b-12d3-a456-426614174000',
      };

      (blobStorageService.uploadBlobBase64 as jest.Mock).mockResolvedValue(
        mockResult,
      );

      const result = await blobStorageController.uploadBlobBase64(uploadDto);

      expect(result).toEqual({
        status: {
          statusCode: HttpStatus.OK,
          statusDescription: 'Operación completada con éxito.',
        },
        data: mockResult,
      });

      expect(fileValidationService.validateBase64Upload).toHaveBeenCalledWith(
        uploadDto.mimeType,
        uploadDto.blobName,
      );

      expect(blobStorageService.uploadBlobBase64).toHaveBeenCalledWith(
        uploadDto.containerName,
        uploadDto.directory,
        uploadDto.blobName,
        uploadDto.fileBase64,
        uploadDto.mimeType,
      );
    });

    it('should throw error when Base64 is missing', async () => {
      const uploadDto: UploadBlobBase64Dto = {
        containerName: 'uploads',
        blobName: 'test.pdf',
        fileBase64: '',
        mimeType: 'application/pdf',
      };

      await expect(
        blobStorageController.uploadBlobBase64(uploadDto),
      ).rejects.toThrow(
        new BadRequestException(ErrorMessages.FILE_BASE64_MISSING),
      );

      expect(fileValidationService.validateBase64Upload).not.toHaveBeenCalled();
    });

    it('should throw error when MIME type is missing', async () => {
      const uploadDto: UploadBlobBase64Dto = {
        containerName: 'uploads',
        blobName: 'test.pdf',
        fileBase64: 'JVBERi0xLjQK',
        mimeType: '',
      };

      await expect(
        blobStorageController.uploadBlobBase64(uploadDto),
      ).rejects.toThrow(
        new BadRequestException(ErrorMessages.MIME_TYPE_MISSING),
      );

      expect(fileValidationService.validateBase64Upload).not.toHaveBeenCalled();
    });

    it('should throw error when MIME type is not allowed', async () => {
      const uploadDto: UploadBlobBase64Dto = {
        containerName: 'uploads',
        blobName: 'virus.exe',
        fileBase64: 'JVBERi0xLjQK',
        mimeType: 'application/exe',
      };

      await expect(
        blobStorageController.uploadBlobBase64(uploadDto),
      ).rejects.toThrow(
        new BadRequestException(
          `${ErrorMessages.MIME_TYPE_NOT_ALLOWED} Tipo recibido: application/exe. Tipos permitidos: PDF, Word, Excel, PowerPoint, imágenes (JPEG, PNG, GIF), audio, video, archivos comprimidos, JSON, XML.`,
        ),
      );

      expect(fileValidationService.validateBase64Upload).not.toHaveBeenCalled();
    });

    it('should throw error when Base64 file is too large', async () => {
      const largeBase64 = 'A'.repeat(9 * 1024 * 1024);

      const uploadDto: UploadBlobBase64Dto = {
        containerName: 'uploads',
        blobName: 'large.pdf',
        fileBase64: largeBase64,
        mimeType: 'application/pdf',
      };

      await expect(
        blobStorageController.uploadBlobBase64(uploadDto),
      ).rejects.toThrow(
        expect.objectContaining({
          name: expect.stringContaining('BadRequestException'),
          message: expect.stringContaining('Bad Request Exception'),
        }),
      );

      expect(fileValidationService.validateBase64Upload).not.toHaveBeenCalled();
    });

    it('should throw error when MIME type and extension do not match', async () => {
      const uploadDto: UploadBlobBase64Dto = {
        containerName: 'uploads',
        blobName: 'test.pdf',
        fileBase64: 'JVBERi0xLjQK',
        mimeType: 'image/jpeg',
      };

      (
        fileValidationService.validateBase64Upload as jest.Mock
      ).mockImplementation(() => {
        throw new BadRequestException(ErrorMessages.FILE_EXTENSION_MISMATCH);
      });

      await expect(
        blobStorageController.uploadBlobBase64(uploadDto),
      ).rejects.toThrow(
        new BadRequestException(ErrorMessages.FILE_EXTENSION_MISMATCH),
      );

      expect(fileValidationService.validateBase64Upload).toHaveBeenCalledWith(
        uploadDto.mimeType,
        uploadDto.blobName,
      );

      expect(blobStorageService.uploadBlobBase64).not.toHaveBeenCalled();
    });

    it('should accept valid MIME types with matching extensions', async () => {
      const testCases = [
        { mimeType: 'application/pdf', blobName: 'test.pdf' },
        { mimeType: 'image/jpeg', blobName: 'test.jpg' },
        { mimeType: 'image/png', blobName: 'test.png' },
        { mimeType: 'application/json', blobName: 'test.json' },
        { mimeType: 'text/plain', blobName: 'test.txt' },
        { mimeType: 'application/zip', blobName: 'test.zip' },
        { mimeType: 'video/mp4', blobName: 'test.mp4' },
        { mimeType: 'audio/mp3', blobName: 'test.mp3' },
      ];

      for (const testCase of testCases) {
        const uploadDto: UploadBlobBase64Dto = {
          containerName: 'uploads',
          blobName: testCase.blobName,
          fileBase64: 'JVBERi0xLjQK',
          mimeType: testCase.mimeType,
        };

        const mockResult = {
          blobUrl: `https://account.blob.core.windows.net/uploads/${testCase.blobName}`,
          containerName: 'uploads',
          blobName: testCase.blobName,
          fullPath: testCase.blobName,
          requestId: '123e4567-e89b-12d3-a456-426614174000',
        };

        (blobStorageService.uploadBlobBase64 as jest.Mock).mockResolvedValue(
          mockResult,
        );

        await expect(
          blobStorageController.uploadBlobBase64(uploadDto),
        ).resolves.not.toThrow();

        expect(fileValidationService.validateBase64Upload).toHaveBeenCalledWith(
          testCase.mimeType,
          testCase.blobName,
        );
      }
    });
  });

  describe('downloadBlobBase64', () => {
    it('should download a blob as Base64 successfully', async () => {
      const downloadDto: DownloadBlobBase64Dto = {
        containerName: 'uploads',
        directory: 'documents/2024',
        blobName: 'test.pdf',
      };

      const mockResult = {
        fileBase64: 'JVBERi0xLj',
        contentType: 'application/pdf',
        containerName: 'uploads',
        blobName: 'test.pdf',
        fullPath: 'documents/2024/test.pdf',
        size: 1024,
        requestId: '123e4567-e89b-12d3-a456-426614174000',
      };

      (blobStorageService.downloadBlobBase64 as jest.Mock).mockResolvedValue(
        mockResult,
      );

      const result =
        await blobStorageController.downloadBlobBase64(downloadDto);

      expect(result).toEqual({
        status: {
          statusCode: HttpStatus.OK,
          statusDescription: 'Operación completada con éxito.',
        },
        data: mockResult,
      });

      expect(blobStorageService.downloadBlobBase64).toHaveBeenCalledWith(
        downloadDto.containerName,
        downloadDto.directory,
        downloadDto.blobName,
      );
    });

    it('should download a blob without directory', async () => {
      const downloadDto: DownloadBlobBase64Dto = {
        containerName: 'uploads',
        blobName: 'test.pdf',
      };

      const mockResult = {
        fileBase64: 'JVBERi0xLjQK',
        contentType: 'application/pdf',
        containerName: 'uploads',
        blobName: 'test.pdf',
        fullPath: 'test.pdf',
        size: 512,
        requestId: '123e4567-e89b-12d3-a456-426614174000',
      };

      (blobStorageService.downloadBlobBase64 as jest.Mock).mockResolvedValue(
        mockResult,
      );

      const result =
        await blobStorageController.downloadBlobBase64(downloadDto);

      expect(result.data.fullPath).toBe('test.pdf');
      expect(blobStorageService.downloadBlobBase64).toHaveBeenCalledWith(
        downloadDto.containerName,
        undefined,
        downloadDto.blobName,
      );
    });
  });

  describe('deleteBlob (POST)', () => {
    it('should delete a blob successfully', async () => {
      const deleteDto = {
        containerName: 'uploads',
        directory: 'documents/2024',
        blobName: 'test.pdf',
      };

      const mockResult = {
        containerName: 'uploads',
        blobName: 'test.pdf',
        fullPath: 'documents/2024/test.pdf',
        requestId: '123e4567-e89b-12d3-a456-426614174000',
      };

      (blobStorageService.deleteBlob as jest.Mock).mockResolvedValue(
        mockResult,
      );

      const result = await blobStorageController.deleteBlobPost(deleteDto);

      expect(result).toEqual({
        status: {
          statusCode: HttpStatus.OK,
          statusDescription: 'Operación completada con éxito.',
        },
        data: {
          message: 'Blob deleted successfully',
          ...mockResult,
        },
      });

      expect(blobStorageService.deleteBlob).toHaveBeenCalledWith(
        deleteDto.containerName,
        deleteDto.directory,
        deleteDto.blobName,
      );
    });
  });

  describe('listBlobs (POST)', () => {
    it('should list all blobs in a container', async () => {
      const listDto = {
        containerName: 'uploads',
        directory: '',
      };

      const mockResult = {
        blobs: ['document1.pdf', 'image.jpg', 'folder/file.xlsx'],
        containerName: 'uploads',
        requestId: '123e4567-e89b-12d3-a456-426614174000',
      };

      (blobStorageService.listBlobs as jest.Mock).mockResolvedValue(mockResult);

      const result = await blobStorageController.listBlobs(listDto);

      expect(result).toEqual({
        status: {
          statusCode: HttpStatus.OK,
          statusDescription: 'Operación completada con éxito.',
        },
        data: mockResult,
      });

      expect(blobStorageService.listBlobs).toHaveBeenCalledWith(
        listDto.containerName,
        listDto.directory,
      );
    });
  });

  describe('moveBlob (POST)', () => {
    it('should move a blob successfully', async () => {
      const moveBlobDto: MoveBlobDto = {
        containerName: 'uploads',
        sourceBlobPath: 'temporal/documento.pdf',
        destinationBlobPath: 'documentos/2024/documento-final.pdf',
      };

      const mockResult = {
        message: 'Blob moved successfully',
        containerName: 'uploads',
        sourcePath: 'temporal/documento.pdf',
        destinationPath: 'documentos/2024/documento-final.pdf',
        requestId: '123e4567-e89b-12d3-a456-426614174000',
      };

      (blobStorageService.moveBlob as jest.Mock).mockResolvedValue(mockResult);

      const result = await blobStorageController.moveBlobPost(moveBlobDto);

      expect(result).toEqual({
        status: {
          statusCode: HttpStatus.OK,
          statusDescription: 'Operación completada con éxito.',
        },
        data: mockResult,
      });

      expect(blobStorageService.moveBlob).toHaveBeenCalledWith(
        moveBlobDto.containerName,
        moveBlobDto.sourceBlobPath,
        moveBlobDto.destinationBlobPath,
      );
    });

    it('should move blob to different directory successfully', async () => {
      const moveBlobDto: MoveBlobDto = {
        containerName: 'uploads',
        sourceBlobPath: 'Archivo_1.pdf',
        destinationBlobPath: 'documentos/2025/Archivo_1.pdf',
      };

      const mockResult = {
        message: 'Blob moved successfully',
        containerName: 'uploads',
        sourcePath: 'Archivo_1.pdf',
        destinationPath: 'documentos/2025/Archivo_1.pdf',
        requestId: '456e7890-e12b-34c5-d678-901234567890',
      };

      (blobStorageService.moveBlob as jest.Mock).mockResolvedValue(mockResult);

      const result = await blobStorageController.moveBlobPost(moveBlobDto);

      expect(result).toEqual({
        status: {
          statusCode: HttpStatus.OK,
          statusDescription: 'Operación completada con éxito.',
        },
        data: mockResult,
      });

      expect(blobStorageService.moveBlob).toHaveBeenCalledWith(
        'uploads',
        'Archivo_1.pdf',
        'documentos/2025/Archivo_1.pdf',
      );
    });

    it('should rename blob in same directory successfully', async () => {
      const moveBlobDto: MoveBlobDto = {
        containerName: 'uploads',
        sourceBlobPath: 'image001 (1).png',
        destinationBlobPath: 'image001-cleaned.png',
      };

      const mockResult = {
        message: 'Blob moved successfully',
        containerName: 'uploads',
        sourcePath: 'image001 (1).png',
        destinationPath: 'image001-cleaned.png',
        requestId: '789e0123-e45f-67g8-h901-234567890123',
      };

      (blobStorageService.moveBlob as jest.Mock).mockResolvedValue(mockResult);

      const result = await blobStorageController.moveBlobPost(moveBlobDto);

      expect(result).toEqual({
        status: {
          statusCode: HttpStatus.OK,
          statusDescription: 'Operación completada con éxito.',
        },
        data: mockResult,
      });

      expect(blobStorageService.moveBlob).toHaveBeenCalledWith(
        'uploads',
        'image001 (1).png',
        'image001-cleaned.png',
      );
    });

    it('should handle move blob with overwrite (existing destination)', async () => {
      const moveBlobDto: MoveBlobDto = {
        containerName: 'uploads',
        sourceBlobPath: 'porvenir.jpg',
        destinationBlobPath: 'imagenes/2025/porvenir.jpg',
      };

      const mockResult = {
        message: 'Blob moved successfully',
        containerName: 'uploads',
        sourcePath: 'porvenir.jpg',
        destinationPath: 'imagenes/2025/porvenir.jpg',
        requestId: '012e3456-e78a-9bcd-ef01-234567890abc',
      };

      (blobStorageService.moveBlob as jest.Mock).mockResolvedValue(mockResult);

      const result = await blobStorageController.moveBlobPost(moveBlobDto);

      expect(result).toEqual({
        status: {
          statusCode: HttpStatus.OK,
          statusDescription: 'Operación completada con éxito.',
        },
        data: mockResult,
      });

      expect(blobStorageService.moveBlob).toHaveBeenCalledWith(
        'uploads',
        'porvenir.jpg',
        'imagenes/2025/porvenir.jpg',
      );
    });

    it('should throw error when source blob does not exist', async () => {
      const moveBlobDto: MoveBlobDto = {
        containerName: 'uploads',
        sourceBlobPath: 'archivo-inexistente.pdf',
        destinationBlobPath: 'documentos/archivo.pdf',
      };

      const error = new BusinessErrorException(ErrorMessages.BLOB_NOT_FOUND);
      (blobStorageService.moveBlob as jest.Mock).mockRejectedValue(error);

      await expect(
        blobStorageController.moveBlobPost(moveBlobDto),
      ).rejects.toThrow(BusinessErrorException);

      expect(blobStorageService.moveBlob).toHaveBeenCalledWith(
        'uploads',
        'archivo-inexistente.pdf',
        'documentos/archivo.pdf',
      );
    });

    it('should throw error when source and destination paths are the same', async () => {
      const moveBlobDto: MoveBlobDto = {
        containerName: 'uploads',
        sourceBlobPath: 'Archivo_1.pdf',
        destinationBlobPath: 'Archivo_1.pdf',
      };

      const error = new BadRequestException(ErrorMessages.BLOB_SAME_PATH);
      (blobStorageService.moveBlob as jest.Mock).mockRejectedValue(error);

      await expect(
        blobStorageController.moveBlobPost(moveBlobDto),
      ).rejects.toThrow(BadRequestException);

      expect(blobStorageService.moveBlob).toHaveBeenCalledWith(
        'uploads',
        'Archivo_1.pdf',
        'Archivo_1.pdf',
      );
    });

    it('should handle service errors during move operation', async () => {
      const moveBlobDto: MoveBlobDto = {
        containerName: 'uploads',
        sourceBlobPath: 'Archivo_2.pdf',
        destinationBlobPath: 'documentos/Archivo_2.pdf',
      };

      const error = new BadRequestException('Move operation failed');
      (blobStorageService.moveBlob as jest.Mock).mockRejectedValue(error);

      await expect(
        blobStorageController.moveBlobPost(moveBlobDto),
      ).rejects.toThrow(BadRequestException);

      expect(blobStorageService.moveBlob).toHaveBeenCalledWith(
        'uploads',
        'Archivo_2.pdf',
        'documentos/Archivo_2.pdf',
      );
    });
  });

  describe('copyBlob (POST)', () => {
    it('should copy a blob successfully', async () => {
      const copyBlobDto: CopyBlobDto = {
        containerName: 'uploads',
        sourceBlobPath: 'documentos/original.pdf',
        destinationBlobPath: 'backup/documentos/copia.pdf',
      };

      const mockResult = {
        message: 'Blob copied successfully',
        containerName: 'uploads',
        sourcePath: 'documentos/original.pdf',
        destinationPath: 'backup/documentos/copia.pdf',
        requestId: '123e4567-e89b-12d3-a456-426614174000',
      };

      (blobStorageService.copyBlob as jest.Mock).mockResolvedValue(mockResult);

      const result = await blobStorageController.copyBlobPost(copyBlobDto);

      expect(result).toEqual({
        status: {
          statusCode: HttpStatus.OK,
          statusDescription: 'Operación completada con éxito.',
        },
        data: mockResult,
      });

      expect(blobStorageService.copyBlob).toHaveBeenCalledWith(
        copyBlobDto.containerName,
        copyBlobDto.sourceBlobPath,
        copyBlobDto.destinationBlobPath,
      );
    });

    it('should create backup copy successfully', async () => {
      const copyBlobDto: CopyBlobDto = {
        containerName: 'uploads',
        sourceBlobPath: 'Archivo_1.pdf',
        destinationBlobPath: 'backup/Archivo_1-backup.pdf',
      };

      const mockResult = {
        message: 'Blob copied successfully',
        containerName: 'uploads',
        sourcePath: 'Archivo_1.pdf',
        destinationPath: 'backup/Archivo_1-backup.pdf',
        requestId: '456e7890-e12b-34c5-d678-901234567890',
      };

      (blobStorageService.copyBlob as jest.Mock).mockResolvedValue(mockResult);

      const result = await blobStorageController.copyBlobPost(copyBlobDto);

      expect(result).toEqual({
        status: {
          statusCode: HttpStatus.OK,
          statusDescription: 'Operación completada con éxito.',
        },
        data: mockResult,
      });
    });

    it('should create working copy successfully', async () => {
      const copyBlobDto: CopyBlobDto = {
        containerName: 'uploads',
        sourceBlobPath: 'plantillas/base-template.docx',
        destinationBlobPath: 'trabajo/documento-trabajo.docx',
      };

      const mockResult = {
        message: 'Blob copied successfully',
        containerName: 'uploads',
        sourcePath: 'plantillas/base-template.docx',
        destinationPath: 'trabajo/documento-trabajo.docx',
        requestId: '789e0123-e45f-67g8-h901-234567890123',
      };

      (blobStorageService.copyBlob as jest.Mock).mockResolvedValue(mockResult);

      const result = await blobStorageController.copyBlobPost(copyBlobDto);

      expect(result.data.message).toBe('Blob copied successfully');
      expect(result.data.sourcePath).toBe('plantillas/base-template.docx');
      expect(result.data.destinationPath).toBe(
        'trabajo/documento-trabajo.docx',
      );
    });

    it('should throw error when source blob does not exist', async () => {
      const copyBlobDto: CopyBlobDto = {
        containerName: 'uploads',
        sourceBlobPath: 'archivo-inexistente.pdf',
        destinationBlobPath: 'backup/archivo.pdf',
      };

      const error = new BusinessErrorException(ErrorMessages.BLOB_NOT_FOUND);
      (blobStorageService.copyBlob as jest.Mock).mockRejectedValue(error);

      await expect(
        blobStorageController.copyBlobPost(copyBlobDto),
      ).rejects.toThrow(BusinessErrorException);
    });

    it('should throw error when source and destination paths are the same', async () => {
      const copyBlobDto: CopyBlobDto = {
        containerName: 'uploads',
        sourceBlobPath: 'documento.pdf',
        destinationBlobPath: 'documento.pdf',
      };

      const error = new BadRequestException(ErrorMessages.BLOB_SAME_PATH);
      (blobStorageService.copyBlob as jest.Mock).mockRejectedValue(error);

      await expect(
        blobStorageController.copyBlobPost(copyBlobDto),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Validation edge cases', () => {
    it('should handle Base64 validation correctly', async () => {
      const uploadDto: UploadBlobBase64Dto = {
        containerName: 'uploads',
        blobName: 'test.pdf',
        fileBase64: '   ',
        mimeType: 'application/pdf',
      };

      await expect(
        blobStorageController.uploadBlobBase64(uploadDto),
      ).rejects.toThrow(
        new BadRequestException(ErrorMessages.FILE_BASE64_MISSING),
      );
    });

    it('should handle MIME type validation correctly', async () => {
      const uploadDto: UploadBlobBase64Dto = {
        containerName: 'uploads',
        blobName: 'test.pdf',
        fileBase64: 'JVBERi0xLjQK',
        mimeType: '   ',
      };

      await expect(
        blobStorageController.uploadBlobBase64(uploadDto),
      ).rejects.toThrow(
        new BadRequestException(ErrorMessages.MIME_TYPE_MISSING),
      );
    });

    it('should accept case insensitive MIME types', async () => {
      const uploadDto: UploadBlobBase64Dto = {
        containerName: 'uploads',
        blobName: 'test.pdf',
        fileBase64: 'JVBERi0xLjQK',
        mimeType: 'APPLICATION/PDF',
      };

      const mockResult = {
        blobUrl: 'https://account.blob.core.windows.net/uploads/test.pdf',
        containerName: 'uploads',
        blobName: 'test.pdf',
        fullPath: 'test.pdf',
        requestId: '123e4567-e89b-12d3-a456-426614174000',
      };

      (blobStorageService.uploadBlobBase64 as jest.Mock).mockResolvedValue(
        mockResult,
      );

      await expect(
        blobStorageController.uploadBlobBase64(uploadDto),
      ).resolves.not.toThrow();
    });
  });

  describe('Error handling', () => {
    it('should throw error when Base64 upload fails', async () => {
      const uploadDto: UploadBlobBase64Dto = {
        containerName: 'uploads',
        blobName: 'test.pdf',
        fileBase64: 'JVBERi0xLjQK',
        mimeType: 'application/pdf',
      };

      const error = new BadRequestException('Upload failed');
      (blobStorageService.uploadBlobBase64 as jest.Mock).mockRejectedValue(
        error,
      );

      await expect(
        blobStorageController.uploadBlobBase64(uploadDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw error when Base64 download fails', async () => {
      const downloadDto: DownloadBlobBase64Dto = {
        containerName: 'uploads',
        blobName: 'nonexistent.pdf',
      };

      const error = new BadRequestException('Blob not found');
      (blobStorageService.downloadBlobBase64 as jest.Mock).mockRejectedValue(
        error,
      );

      await expect(
        blobStorageController.downloadBlobBase64(downloadDto),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('exposePublicBlob', () => {
    it('should expose private blob to public with default settings', async () => {
      const exposePublicBlobDto = {
        containerName: 'contenedor',
        blobName: 'documento.pdf',
        directory: 'directorio/2000000005',
      };

      const mockResult = {
        sasToken:
          'sv=2022-11-02&ss=b&srt=o&sp=r&se=2025-06-17T10%3A30%3A00Z&st=2025-06-17T09%3A30%3A00Z&spr=https&sig=mockSignature',
        sasUrl:
          'https://publicaccount.blob.core.windows.net/public-container/directorio/2000000005/documento.pdf?sv=2022-11-02&ss=b&srt=o&sp=r&se=2025-06-17T10%3A30%3A00Z&st=2025-06-17T09%3A30%3A00Z&spr=https&sig=mockSignature',
        permissions: 'r',
        expiresOn: new Date('2025-06-17T10:30:00Z'),
        contentType: 'application/pdf',
        containerName: 'contenedor',
        blobName: 'documento.pdf',
        fullPath: 'directorio/2000000005/documento.pdf',
        size: 1048576,
        requestId: '123e4567-e89b-12d3-a456-426614174000',
        useDirectCopy: true,
      };

      (blobStorageService.exposePublicBlob as jest.Mock).mockResolvedValue(
        mockResult,
      );

      const result =
        await blobStorageController.exposePublicBlob(exposePublicBlobDto);

      expect(result).toEqual({
        status: {
          statusCode: HttpStatus.OK,
          statusDescription: 'Operación completada con éxito.',
        },
        data: mockResult,
      });

      expect(blobStorageService.exposePublicBlob).toHaveBeenCalledWith(
        {
          privateContainerName: 'contenedor',
          directory: 'directorio/2000000005',
          blobName: 'documento.pdf',
          expirationMinutes: 60,
          includeBase64: false,
        },
        true,
      );
    });

    it('should expose private blob with custom expiration and base64', async () => {
      const exposePublicBlobDto = {
        containerName: 'contenedor',
        blobName: 'imagen.jpg',
        directory: 'documentos/identificacion',
        expirationMinutes: 120,
        base64: true,
      };

      const mockResult = {
        sasToken:
          'sv=2022-11-02&ss=b&srt=o&sp=r&se=2025-06-17T11%3A30%3A00Z&st=2025-06-17T09%3A30%3A00Z&spr=https&sig=mockSignature2',
        sasUrl:
          'https://publicaccount.blob.core.windows.net/public-container/documentos/identificacion/imagen.jpg?sv=2022-11-02&ss=b&srt=o&sp=r&se=2025-06-17T11%3A30%3A00Z&st=2025-06-17T09%3A30%3A00Z&spr=https&sig=mockSignature2',
        permissions: 'r',
        expiresOn: new Date('2025-06-17T11:30:00Z'),
        fileBase64:
          '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=',
        contentType: 'image/jpeg',
        containerName: 'contenedor',
        blobName: 'imagen.jpg',
        fullPath: 'documentos/identificacion/imagen.jpg',
        size: 2097152,
        requestId: '456e7890-e12b-34c5-d678-901234567890',
        useDirectCopy: true,
      };

      (blobStorageService.exposePublicBlob as jest.Mock).mockResolvedValue(
        mockResult,
      );

      const result =
        await blobStorageController.exposePublicBlob(exposePublicBlobDto);

      expect(result).toEqual({
        status: {
          statusCode: HttpStatus.OK,
          statusDescription: 'Operación completada con éxito.',
        },
        data: mockResult,
      });

      expect(blobStorageService.exposePublicBlob).toHaveBeenCalledWith(
        {
          privateContainerName: 'contenedor',
          directory: 'documentos/identificacion',
          blobName: 'imagen.jpg',
          expirationMinutes: 120,
          includeBase64: true,
        },
        true,
      );

      expect(result.data.fileBase64).toBeDefined();
      expect(result.data.fileBase64).toContain('/9j/4AAQSkZJRg');
    });

    it('should expose blob with short expiration time', async () => {
      const exposePublicBlobDto = {
        containerName: 'documentos',
        blobName: 'reporte.xlsx',
        directory: 'reportes/mensuales',
        expirationMinutes: 30,
        base64: false,
      };

      const mockResult = {
        sasToken:
          'sv=2022-11-02&ss=b&srt=o&sp=r&se=2025-06-17T10%3A00%3A00Z&st=2025-06-17T09%3A30%3A00Z&spr=https&sig=mockSignature3',
        sasUrl:
          'https://publicaccount.blob.core.windows.net/public-container/reportes/mensuales/reporte.xlsx?sv=2022-11-02&ss=b&srt=o&sp=r&se=2025-06-17T10%3A00%3A00Z&st=2025-06-17T09%3A30%3A00Z&spr=https&sig=mockSignature3',
        permissions: 'r',
        expiresOn: new Date('2025-06-17T10:00:00Z'),
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        containerName: 'documentos',
        blobName: 'reporte.xlsx',
        fullPath: 'reportes/mensuales/reporte.xlsx',
        size: 524288,
        requestId: '789e0123-e45f-67g8-h901-234567890123',
      };

      (blobStorageService.exposePublicBlob as jest.Mock).mockResolvedValue(
        mockResult,
      );

      const result =
        await blobStorageController.exposePublicBlob(exposePublicBlobDto);

      expect(result.data.contentType).toBe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(result.data.fileBase64).toBeUndefined();

      expect(blobStorageService.exposePublicBlob).toHaveBeenCalledWith(
        {
          privateContainerName: 'documentos',
          directory: 'reportes/mensuales',
          blobName: 'reporte.xlsx',
          expirationMinutes: 30,
          includeBase64: false,
        },
        true,
      );
    });

    it('should handle file without directory (root level)', async () => {
      const exposePublicBlobDto = {
        containerName: 'contenedor',
        blobName: 'archivo-raiz.txt',
        directory: undefined,
        expirationMinutes: 90,
        base64: false,
      };

      const mockResult = {
        sasToken:
          'sv=2022-11-02&ss=b&srt=o&sp=r&se=2025-06-17T11%3A00%3A00Z&st=2025-06-17T09%3A30%3A00Z&spr=https&sig=mockSignature4',
        sasUrl:
          'https://publicaccount.blob.core.windows.net/public-container/archivo-raiz.txt?sv=2022-11-02&ss=b&srt=o&sp=r&se=2025-06-17T11%3A00%3A00Z&st=2025-06-17T09%3A30%3A00Z&spr=https&sig=mockSignature4',
        permissions: 'r',
        expiresOn: new Date('2025-06-17T11:00:00Z'),
        contentType: 'text/plain',
        containerName: 'contenedor',
        blobName: 'archivo-raiz.txt',
        fullPath: 'archivo-raiz.txt',
        size: 1024,
        requestId: '012e3456-e78a-9bcd-ef01-234567890abc',
      };

      (blobStorageService.exposePublicBlob as jest.Mock).mockResolvedValue(
        mockResult,
      );

      const result =
        await blobStorageController.exposePublicBlob(exposePublicBlobDto);

      expect(result.data.fullPath).toBe('archivo-raiz.txt');
      expect(result.data.contentType).toBe('text/plain');

      expect(blobStorageService.exposePublicBlob).toHaveBeenCalledWith(
        {
          privateContainerName: 'contenedor',
          directory: '',
          blobName: 'archivo-raiz.txt',
          expirationMinutes: 90,
          includeBase64: false,
        },
        true,
      );
    });

    it('should handle empty directory as undefined', async () => {
      const exposePublicBlobDto = {
        containerName: 'contenedor',
        blobName: 'archivo.pdf',
        directory: '',
        expirationMinutes: 60,
        base64: false,
      };

      const mockResult = {
        sasToken:
          'sv=2022-11-02&ss=b&srt=o&sp=r&se=2025-06-17T10%3A30%3A00Z&st=2025-06-17T09%3A30%3A00Z&spr=https&sig=mockSignature5',
        sasUrl:
          'https://publicaccount.blob.core.windows.net/public-container/archivo.pdf?sv=2022-11-02&ss=b&srt=o&sp=r&se=2025-06-17T10%3A30%3A00Z&st=2025-06-17T09%3A30%3A00Z&spr=https&sig=mockSignature5',
        permissions: 'r',
        expiresOn: new Date('2025-06-17T10:30:00Z'),
        contentType: 'application/pdf',
        containerName: 'contenedor',
        blobName: 'archivo.pdf',
        fullPath: 'archivo.pdf',
        size: 2048576,
        requestId: '345e6789-e01b-23c4-d567-890123456789',
      };

      (blobStorageService.exposePublicBlob as jest.Mock).mockResolvedValue(
        mockResult,
      );

      const result =
        await blobStorageController.exposePublicBlob(exposePublicBlobDto);

      expect(result.data.fullPath).toBe('archivo.pdf');

      expect(blobStorageService.exposePublicBlob).toHaveBeenCalledWith(
        {
          privateContainerName: 'contenedor',
          directory: '',
          blobName: 'archivo.pdf',
          expirationMinutes: 60,
          includeBase64: false,
        },
        true,
      );
    });

    it('should handle service errors when exposing blob', async () => {
      const exposePublicBlobDto = {
        containerName: 'contenedor',
        blobName: 'archivo-inexistente.pdf',
        directory: 'directorio/inexistente',
        expirationMinutes: 60,
        base64: false,
      };

      const error = new BadRequestException('Private blob not found');
      (blobStorageService.exposePublicBlob as jest.Mock).mockRejectedValue(
        error,
      );

      await expect(
        blobStorageController.exposePublicBlob(exposePublicBlobDto),
      ).rejects.toThrow(BadRequestException);

      expect(blobStorageService.exposePublicBlob).toHaveBeenCalledWith(
        {
          privateContainerName: 'contenedor',
          directory: 'directorio/inexistente',
          blobName: 'archivo-inexistente.pdf',
          expirationMinutes: 60,
          includeBase64: false,
        },
        true,
      );
    });

    it('should handle large file exposure with base64', async () => {
      const exposePublicBlobDto = {
        containerName: 'contenedor',
        blobName: 'video-large.mp4',
        directory: 'media/videos',
        expirationMinutes: 240,
        base64: true,
      };

      const mockResult = {
        sasToken:
          'sv=2022-11-02&ss=b&srt=o&sp=r&se=2025-06-17T13%3A30%3A00Z&st=2025-06-17T09%3A30%3A00Z&spr=https&sig=mockSignature6',
        sasUrl:
          'https://publicaccount.blob.core.windows.net/public-container/media/videos/video-large.mp4?sv=2022-11-02&ss=b&srt=o&sp=r&se=2025-06-17T13%3A30%3A00Z&st=2025-06-17T09%3A30%3A00Z&spr=https&sig=mockSignature6',
        permissions: 'r',
        expiresOn: new Date('2025-06-17T13:30:00Z'),
        fileBase64: 'AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDE=',
        contentType: 'video/mp4',
        containerName: 'contenedor',
        blobName: 'video-large.mp4',
        fullPath: 'media/videos/video-large.mp4',
        size: 10485760,
        requestId: '678e9012-e34f-56a7-b890-123456789012',
      };

      (blobStorageService.exposePublicBlob as jest.Mock).mockResolvedValue(
        mockResult,
      );

      const result =
        await blobStorageController.exposePublicBlob(exposePublicBlobDto);

      expect(result.data.size).toBe(10485760);
      expect(result.data.contentType).toBe('video/mp4');
      expect(result.data.fileBase64).toBeDefined();
      expect(result.data.fileBase64).toContain('AAAAIGZ0eXBpc29t');

      expect(blobStorageService.exposePublicBlob).toHaveBeenCalledWith(
        {
          privateContainerName: 'contenedor',
          directory: 'media/videos',
          blobName: 'video-large.mp4',
          expirationMinutes: 240,
          includeBase64: true,
        },
        true,
      );
    });

    it('should handle business errors when private blob does not exist', async () => {
      const exposePublicBlobDto = {
        containerName: 'contenedor',
        blobName: 'archivo-eliminado.pdf',
        directory: 'documentos/eliminados',
      };

      const error = new BusinessErrorException('Private blob not found');
      (blobStorageService.exposePublicBlob as jest.Mock).mockRejectedValue(
        error,
      );

      await expect(
        blobStorageController.exposePublicBlob(exposePublicBlobDto),
      ).rejects.toThrow(BusinessErrorException);
    });
  });

  describe('listPublicBlobs', () => {
    it('should list all public blobs when no directory is specified', async () => {
      const listPublicBlobsDto = {};

      const mockResult = {
        blobs: [
          'public-file1.pdf',
          'public-image.jpg',
          'documents/report.xlsx',
        ],
        publicContainerName: 'public-container',
        requestId: '123e4567-e89b-12d3-a456-426614174000',
      };

      (blobStorageService.listPublicBlobs as jest.Mock).mockResolvedValue(
        mockResult,
      );

      const result =
        await blobStorageController.listPublicBlobs(listPublicBlobsDto);

      expect(result).toEqual({
        status: {
          statusCode: HttpStatus.OK,
          statusDescription: 'Operación completada con éxito.',
        },
        data: mockResult,
      });

      expect(blobStorageService.listPublicBlobs).toHaveBeenCalledWith(
        undefined,
      );
    });

    it('should list public blobs in specific directory', async () => {
      const listPublicBlobsDto = {
        directory: 'afiliaciones/2000000005',
      };

      const mockResult = {
        blobs: [
          'afiliaciones/2000000005/documento1.pdf',
          'afiliaciones/2000000005/documento2.pdf',
        ],
        publicContainerName: 'public-container',
        directory: 'afiliaciones/2000000005',
        requestId: '123e4567-e89b-12d3-a456-426614174000',
      };

      (blobStorageService.listPublicBlobs as jest.Mock).mockResolvedValue(
        mockResult,
      );

      const result =
        await blobStorageController.listPublicBlobs(listPublicBlobsDto);

      expect(result).toEqual({
        status: {
          statusCode: HttpStatus.OK,
          statusDescription: 'Operación completada con éxito.',
        },
        data: mockResult,
      });

      expect(blobStorageService.listPublicBlobs).toHaveBeenCalledWith(
        'afiliaciones/2000000005',
      );
    });

    it('should list public blobs in reports directory', async () => {
      const listPublicBlobsDto = {
        directory: 'reportes/mensuales',
      };

      const mockResult = {
        blobs: [
          'reportes/mensuales/enero-2024.xlsx',
          'reportes/mensuales/febrero-2024.xlsx',
          'reportes/mensuales/marzo-2024.xlsx',
        ],
        publicContainerName: 'public-container',
        directory: 'reportes/mensuales',
        requestId: '456e7890-e12b-34c5-d678-901234567890',
      };

      (blobStorageService.listPublicBlobs as jest.Mock).mockResolvedValue(
        mockResult,
      );

      const result =
        await blobStorageController.listPublicBlobs(listPublicBlobsDto);

      expect(result).toEqual({
        status: {
          statusCode: HttpStatus.OK,
          statusDescription: 'Operación completada con éxito.',
        },
        data: mockResult,
      });

      expect(blobStorageService.listPublicBlobs).toHaveBeenCalledWith(
        'reportes/mensuales',
      );
    });

    it('should handle empty directory gracefully', async () => {
      const listPublicBlobsDto = {
        directory: '',
      };

      const mockResult = {
        blobs: ['root-file1.pdf', 'root-file2.jpg'],
        publicContainerName: 'public-container',
        requestId: '789e0123-e45f-67g8-h901-234567890123',
      };

      (blobStorageService.listPublicBlobs as jest.Mock).mockResolvedValue(
        mockResult,
      );

      const result =
        await blobStorageController.listPublicBlobs(listPublicBlobsDto);

      expect(result.data.blobs).toEqual(['root-file1.pdf', 'root-file2.jpg']);
      expect(blobStorageService.listPublicBlobs).toHaveBeenCalledWith('');
    });

    it('should handle service errors when listing public blobs', async () => {
      const listPublicBlobsDto = {
        directory: 'non-existent-directory',
      };

      const error = new BadRequestException('Public container not found');
      (blobStorageService.listPublicBlobs as jest.Mock).mockRejectedValue(
        error,
      );

      await expect(
        blobStorageController.listPublicBlobs(listPublicBlobsDto),
      ).rejects.toThrow(BadRequestException);

      expect(blobStorageService.listPublicBlobs).toHaveBeenCalledWith(
        'non-existent-directory',
      );
    });

    it('should handle directory with nested paths', async () => {
      const listPublicBlobsDto = {
        directory: 'documentos/identificacion/cedulas',
      };

      const mockResult = {
        blobs: [
          'documentos/identificacion/cedulas/cedula-001.pdf',
          'documentos/identificacion/cedulas/cedula-002.pdf',
        ],
        publicContainerName: 'public-container',
        directory: 'documentos/identificacion/cedulas',
        requestId: '012e3456-e78a-9bcd-ef01-234567890abc',
      };

      (blobStorageService.listPublicBlobs as jest.Mock).mockResolvedValue(
        mockResult,
      );

      const result =
        await blobStorageController.listPublicBlobs(listPublicBlobsDto);

      expect(result.data.directory).toBe('documentos/identificacion/cedulas');
      expect(result.data.blobs).toHaveLength(2);
      expect(blobStorageService.listPublicBlobs).toHaveBeenCalledWith(
        'documentos/identificacion/cedulas',
      );
    });

    it('should return empty blob list when directory has no files', async () => {
      const listPublicBlobsDto = {
        directory: 'empty-directory',
      };

      const mockResult = {
        blobs: [],
        publicContainerName: 'public-container',
        directory: 'empty-directory',
        requestId: '345e6789-e01b-23c4-d567-890123456789',
      };

      (blobStorageService.listPublicBlobs as jest.Mock).mockResolvedValue(
        mockResult,
      );

      const result =
        await blobStorageController.listPublicBlobs(listPublicBlobsDto);

      expect(result.data.blobs).toEqual([]);
      expect(result.data.directory).toBe('empty-directory');
      expect(result.status.statusCode).toBe(HttpStatus.OK);
    });
  });
});
