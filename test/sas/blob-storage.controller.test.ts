import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UploadBlobDto } from '@src/shared/dto/upload-blob-dto';
import { BadRequestException } from '@src/shared/exceptions/bad-request.exception';
import { BlobStorageController } from '../../src/sas/controllers/blob-storage.controller';
import { BlobStorageService } from '../../src/sas/services/blob-storage.service';

describe('BlobStorageController', () => {
  let blobStorageController: BlobStorageController;
  let blobStorageService: Partial<BlobStorageService>;

  beforeEach(async () => {
    blobStorageService = {
      uploadBlob: jest.fn(),
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

  describe('uploadBlob', () => {
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

    it('should upload a blob without directory', async () => {
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
        blobName: 'test.pdf',
        file: null,
      };

      const mockResult = {
        blobUrl: 'https://account.blob.core.windows.net/uploads/test.pdf',
        containerName: 'uploads',
        blobName: 'test.pdf',
        fullPath: 'test.pdf',
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
        undefined,
        uploadDto.blobName,
        mockFile,
      );
    });
  });

  describe('deleteBlob', () => {
    it('should delete a blob successfully', async () => {
      const containerName = 'uploads';
      const blobName = 'test.pdf';
      const directory = 'documents/2024';

      const mockResult = {
        containerName,
        blobName,
        fullPath: 'documents/2024/test.pdf',
        requestId: '123e4567-e89b-12d3-a456-426614174000',
      };

      (blobStorageService.deleteBlob as jest.Mock).mockResolvedValue(
        mockResult,
      );

      const result = await blobStorageController.deleteBlob(
        containerName,
        blobName,
        directory,
      );

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
        containerName,
        directory,
        blobName,
      );
    });

    it('should delete a blob without directory', async () => {
      const containerName = 'uploads';
      const blobName = 'test.pdf';

      const mockResult = {
        containerName,
        blobName,
        fullPath: 'test.pdf',
        requestId: '123e4567-e89b-12d3-a456-426614174000',
      };

      (blobStorageService.deleteBlob as jest.Mock).mockResolvedValue(
        mockResult,
      );

      const result = await blobStorageController.deleteBlob(
        containerName,
        blobName,
        undefined,
      );

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
        containerName,
        undefined,
        blobName,
      );
    });
  });

  describe('listBlobs', () => {
    it('should list all blobs in a container', async () => {
      const containerName = 'uploads';

      const mockResult = {
        blobs: ['document1.pdf', 'image.jpg', 'folder/file.xlsx'],
        containerName,
        requestId: '123e4567-e89b-12d3-a456-426614174000',
      };

      (blobStorageService.listBlobs as jest.Mock).mockResolvedValue(mockResult);

      const result = await blobStorageController.listBlobs(containerName);

      expect(result).toEqual({
        status: {
          statusCode: HttpStatus.OK,
          statusDescription: 'Operación completada con éxito.',
        },
        data: mockResult,
      });

      expect(blobStorageService.listBlobs).toHaveBeenCalledWith(containerName);
    });
  });

  describe('listBlobsInDirectory', () => {
    it('should list blobs in a specific directory', async () => {
      const containerName = 'uploads';
      const directory = 'documents/2024';

      const mockResult = {
        blobs: ['documents/2024/invoice1.pdf', 'documents/2024/report.xlsx'],
        containerName,
        directory,
        requestId: '123e4567-e89b-12d3-a456-426614174000',
      };

      (blobStorageService.listBlobsInDirectory as jest.Mock).mockResolvedValue(
        mockResult,
      );

      const result = await blobStorageController.listBlobsInDirectory(
        containerName,
        directory,
      );

      expect(result).toEqual({
        status: {
          statusCode: HttpStatus.OK,
          statusDescription: 'Operación completada con éxito.',
        },
        data: mockResult,
      });

      expect(blobStorageService.listBlobsInDirectory).toHaveBeenCalledWith(
        containerName,
        directory,
      );
    });

    it('should list blobs in an empty directory', async () => {
      const containerName = 'uploads';
      const directory = 'empty-folder';

      const mockResult = {
        blobs: [],
        containerName,
        directory,
        requestId: '123e4567-e89b-12d3-a456-426614174000',
      };

      (blobStorageService.listBlobsInDirectory as jest.Mock).mockResolvedValue(
        mockResult,
      );

      const result = await blobStorageController.listBlobsInDirectory(
        containerName,
        directory,
      );

      expect(result).toEqual({
        status: {
          statusCode: HttpStatus.OK,
          statusDescription: 'Operación completada con éxito.',
        },
        data: mockResult,
      });

      expect(blobStorageService.listBlobsInDirectory).toHaveBeenCalledWith(
        containerName,
        directory,
      );
    });
  });

  describe('Error handling', () => {
    it('should throw error when upload fails', async () => {
      const mockFile = {} as Express.Multer.File;
      const uploadDto: UploadBlobDto = {
        containerName: 'uploads',
        blobName: 'test.pdf',
        file: null,
      };

      const error = new BadRequestException('File missing');
      (blobStorageService.uploadBlob as jest.Mock).mockRejectedValue(error);

      await expect(
        blobStorageController.uploadBlob(mockFile, uploadDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw error when delete fails', async () => {
      const containerName = 'uploads';
      const blobName = 'nonexistent.pdf';

      const error = new BadRequestException('Blob not found');
      (blobStorageService.deleteBlob as jest.Mock).mockRejectedValue(error);

      await expect(
        blobStorageController.deleteBlob(containerName, blobName),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw error when list fails', async () => {
      const containerName = 'nonexistent-container';

      const error = new BadRequestException('Container not found');
      (blobStorageService.listBlobs as jest.Mock).mockRejectedValue(error);

      await expect(
        blobStorageController.listBlobs(containerName),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
