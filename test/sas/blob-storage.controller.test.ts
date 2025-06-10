import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DownloadBlobBase64Dto } from '@src/shared/dto/download-blob-base64.dto';
import { UploadBlobBase64Dto } from '@src/shared/dto/upload-blob-base64.dto';
import { UploadBlobDto } from '@src/shared/dto/upload-blob-dto';
import { ErrorMessages } from '@src/shared/enums/error-messages.enum';
import { BadRequestException } from '@src/shared/exceptions/bad-request.exception';
import { BlobStorageController } from '../../src/sas/controllers/blob-storage.controller';
import { BlobStorageService } from '../../src/sas/services/blob-storage.service';
import { FileValidationService } from '../../src/sas/services/file-validation.service';
import { MoveBlobDto } from '@src/shared/dto/move-blob.dto';
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
      listBlobsInDirectory: jest.fn(),
      moveBlob: jest.fn(),
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
        data: mockResult,
      });

      // Verificar que se llamó la validación
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

      // No debería llamar la validación si el archivo es null
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

      // No debería llamar la validación si el buffer es null
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

      // No debería llamar la validación si el archivo es muy grande
      expect(
        fileValidationService.validateMultipartUpload,
      ).not.toHaveBeenCalled();
    });

    it('should throw error when file extension validation fails', async () => {
      const mockFile = {
        fieldname: 'file',
        originalname: 'test.jpg', // Archivo JPG
        encoding: '7bit',
        mimetype: 'image/jpeg',
        size: 1024,
        buffer: Buffer.from('test file content'),
      } as Express.Multer.File;

      const uploadDto: UploadBlobDto = {
        containerName: 'uploads',
        blobName: 'test.pdf', // Blob PDF - ¡No coinciden!
        file: null,
      };

      // Mock para que la validación lance error
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

      // No debería llamar al servicio de blob si la validación falla
      expect(blobStorageService.uploadBlob).not.toHaveBeenCalled();
    });
  });

  describe('uploadBlobBase64', () => {
    it('should upload a Base64 blob successfully', async () => {
      const uploadDto: UploadBlobBase64Dto = {
        containerName: 'uploads',
        directory: 'documents/2024',
        blobName: 'test.pdf',
        fileBase64: 'JVBERi0xLjQK', // Base64 válido
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

      // Verificar que se llamó la validación
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

      // No debería llamar la validación si el Base64 está vacío
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

      // No debería llamar la validación si el MIME type está vacío
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

      // No debería llamar la validación si el MIME type no está permitido
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

      // No debería llamar la validación si el archivo es muy grande
      expect(fileValidationService.validateBase64Upload).not.toHaveBeenCalled();
    });

    it('should throw error when MIME type and extension do not match', async () => {
      const uploadDto: UploadBlobBase64Dto = {
        containerName: 'uploads',
        blobName: 'test.pdf', // PDF extension
        fileBase64: 'JVBERi0xLjQK',
        mimeType: 'image/jpeg', // JPEG MIME type - ¡No coinciden!
      };

      // Mock para que la validación lance error
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

      // No debería llamar al servicio de blob si la validación falla
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

  // Resto de tests permanecen igual ya que no usan FileValidationService
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
      };

      const mockResult = {
        blobs: ['document1.pdf', 'image.jpg', 'folder/file.xlsx'],
        containerName: 'uploads',
        requestId: '123e4567-e89b-12d3-a456-426614174000',
      };

      (blobStorageService.listBlobs as jest.Mock).mockResolvedValue(mockResult);

      const result = await blobStorageController.listBlobsPost(listDto);

      expect(result).toEqual({
        status: {
          statusCode: HttpStatus.OK,
          statusDescription: 'Operación completada con éxito.',
        },
        data: mockResult,
      });

      expect(blobStorageService.listBlobs).toHaveBeenCalledWith(
        listDto.containerName,
      );
    });
  });

  describe('listBlobsInDirectory (POST)', () => {
    it('should list blobs in a specific directory', async () => {
      const listDto = {
        containerName: 'uploads',
        directory: 'documents/2024',
      };

      const mockResult = {
        blobs: ['documents/2024/invoice1.pdf', 'documents/2024/report.xlsx'],
        containerName: 'uploads',
        directory: 'documents/2024',
        requestId: '123e4567-e89b-12d3-a456-426614174000',
      };

      (blobStorageService.listBlobsInDirectory as jest.Mock).mockResolvedValue(
        mockResult,
      );

      const result =
        await blobStorageController.listBlobsInDirectoryPost(listDto);

      expect(result).toEqual({
        status: {
          statusCode: HttpStatus.OK,
          statusDescription: 'Operación completada con éxito.',
        },
        data: mockResult,
      });

      expect(blobStorageService.listBlobsInDirectory).toHaveBeenCalledWith(
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

      const error = new BadRequestException(ErrorMessages.BLOB_MOVE_SAME_PATH);
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
});
