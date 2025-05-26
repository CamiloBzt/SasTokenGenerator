import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DownloadBlobBase64Dto } from '@src/shared/dto/download-blob-base64.dto';
import { UploadBlobBase64Dto } from '@src/shared/dto/upload-blob-base64.dto';
import { UploadBlobDto } from '@src/shared/dto/upload-blob-dto';
import { ErrorMessages } from '@src/shared/enums/error-messages.enum';
import { BadRequestException } from '@src/shared/exceptions/bad-request.exception';
import { BlobStorageController } from '../../src/sas/controllers/blob-storage.controller';
import { BlobStorageService } from '../../src/sas/services/blob-storage.service';

describe('BlobStorageController', () => {
  let blobStorageController: BlobStorageController;
  let blobStorageService: Partial<BlobStorageService>;

  beforeEach(async () => {
    blobStorageService = {
      uploadBlob: jest.fn(),
      uploadBlobBase64: jest.fn(),
      downloadBlob: jest.fn(),
      downloadBlobBase64: jest.fn(),
      deleteBlob: jest.fn(),
      listBlobs: jest.fn(),
      listBlobsInDirectory: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BlobStorageController],
      providers: [
        {
          provide: BlobStorageService,
          useValue: blobStorageService,
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
    });
  });

  describe('uploadBlobBase64', () => {
    it('should upload a Base64 blob successfully', async () => {
      const uploadDto: UploadBlobBase64Dto = {
        containerName: 'uploads',
        directory: 'documents/2024',
        blobName: 'test.pdf',
        fileBase64:
          'JVBERi0xLjQKJdP0zOEKMSAwIG9iago8PAovVHlwZSAvQ2F0YWxvZwovUGFnZXMgMiAwIFIKPj4KZW5kb2JqCg==',
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
    });

    it('should accept valid MIME types', async () => {
      const validMimeTypes = [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'application/json',
        'text/plain',
        'application/zip',
        'video/mp4',
        'audio/mp3',
      ];

      for (const mimeType of validMimeTypes) {
        const uploadDto: UploadBlobBase64Dto = {
          containerName: 'uploads',
          blobName: 'test-file',
          fileBase64: 'JVBERi0xLjQK',
          mimeType,
        };

        const mockResult = {
          blobUrl: 'https://account.blob.core.windows.net/uploads/test-file',
          containerName: 'uploads',
          blobName: 'test-file',
          fullPath: 'test-file',
          requestId: '123e4567-e89b-12d3-a456-426614174000',
        };

        (blobStorageService.uploadBlobBase64 as jest.Mock).mockResolvedValue(
          mockResult,
        );

        await expect(
          blobStorageController.uploadBlobBase64(uploadDto),
        ).resolves.not.toThrow();
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
        fileBase64:
          'JVBERi0xLjQKJdP0zOEKMSAwIG9iago8PAovVHlwZSAvQ2F0YWxvZwovUGFnZXMgMiAwIFIKPj4KZW5kb2JqCg==',
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
