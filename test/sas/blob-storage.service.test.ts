import * as storageBlob from '@azure/storage-blob';
import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { ErrorMessages } from '@src/shared/enums/error-messages.enum';
import { SasPermission } from '@src/shared/enums/sas-permission.enum';
import { BadRequestException } from '@src/shared/exceptions/bad-request.exception';
import { BlobStorageService } from '../../src/sas/services/blob-storage.service';
import { SasService } from '../../src/sas/services/sas.service';

jest.mock('@azure/storage-blob');
jest.mock('uuid', () => ({
  v4: jest.fn(() => '123e4567-e89b-12d3-a456-426614174000'),
}));

describe('BlobStorageService', () => {
  let blobStorageService: BlobStorageService;
  let sasService: Partial<SasService>;
  let configService: Partial<ConfigService>;

  beforeEach(async () => {
    jest.clearAllMocks();

    configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          'azure.connectionString': '',
          'azure.storageAccountName': 'teststorageaccount',
        };
        return values[key];
      }),
    };

    sasService = {
      generateSasTokenWithParams: jest.fn(),
    };

    const mockBlobServiceClient = {};

    (storageBlob.BlobServiceClient as unknown as jest.Mock).mockImplementation(
      () => mockBlobServiceClient,
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BlobStorageService,
        {
          provide: ConfigService,
          useValue: configService,
        },
        {
          provide: SasService,
          useValue: sasService,
        },
      ],
    }).compile();

    blobStorageService = module.get<BlobStorageService>(BlobStorageService);
  });

  describe('initialization', () => {
    it('should initialize with storage account name', () => {
      expect(storageBlob.BlobServiceClient).toHaveBeenCalledWith(
        'https://teststorageaccount.blob.core.windows.net/',
      );
    });

    it('should throw error when no configuration is provided', () => {
      jest.resetModules();
      jest.clearAllMocks();

      (configService.get as jest.Mock).mockReturnValue(undefined);

      expect(() => {
        new BlobStorageService(
          configService as ConfigService,
          sasService as SasService,
        );
      }).toThrow(BadRequestException);
    });
  });

  describe('uploadBlob', () => {
    const mockFile = {
      fieldname: 'file',
      originalname: 'test.pdf',
      encoding: '7bit',
      mimetype: 'application/pdf',
      size: 1024,
      buffer: Buffer.from('test file content'),
    } as Express.Multer.File;

    it('should upload a blob successfully with directory', async () => {
      const mockSasData = {
        sasUrl:
          'https://teststorageaccount.blob.core.windows.net/uploads/documents/2024/test.pdf?sv=...',
        sasToken: 'sv=...',
      };

      const mockBlockBlobClient = {
        upload: jest.fn().mockResolvedValue({}),
      };

      (sasService.generateSasTokenWithParams as jest.Mock).mockResolvedValue(
        mockSasData,
      );
      (storageBlob.BlockBlobClient as unknown as jest.Mock).mockImplementation(
        () => mockBlockBlobClient,
      );

      const result = await blobStorageService.uploadBlob(
        'uploads',
        'documents/2024',
        'test.pdf',
        mockFile,
      );

      expect(result).toEqual({
        blobUrl:
          'https://teststorageaccount.blob.core.windows.net/uploads/documents/2024/test.pdf',
        containerName: 'uploads',
        blobName: 'test.pdf',
        fullPath: 'documents/2024/test.pdf',
        requestId: '123e4567-e89b-12d3-a456-426614174000',
      });

      expect(sasService.generateSasTokenWithParams).toHaveBeenCalledWith(
        'uploads',
        'documents/2024/test.pdf',
        [SasPermission.WRITE, SasPermission.CREATE],
        30,
      );

      expect(mockBlockBlobClient.upload).toHaveBeenCalledWith(
        mockFile.buffer,
        mockFile.buffer.length,
        {
          blobHTTPHeaders: {
            blobContentType: mockFile.mimetype,
          },
        },
      );
    });

    it('should upload a blob successfully without directory', async () => {
      const mockSasData = {
        sasUrl:
          'https://teststorageaccount.blob.core.windows.net/uploads/test.pdf?sv=...',
        sasToken: 'sv=...',
      };

      const mockBlockBlobClient = {
        upload: jest.fn().mockResolvedValue({}),
      };

      (sasService.generateSasTokenWithParams as jest.Mock).mockResolvedValue(
        mockSasData,
      );
      (storageBlob.BlockBlobClient as unknown as jest.Mock).mockImplementation(
        () => mockBlockBlobClient,
      );

      const result = await blobStorageService.uploadBlob(
        'uploads',
        undefined,
        'test.pdf',
        mockFile,
      );

      expect(result).toEqual({
        blobUrl:
          'https://teststorageaccount.blob.core.windows.net/uploads/test.pdf',
        containerName: 'uploads',
        blobName: 'test.pdf',
        fullPath: 'test.pdf',
        requestId: '123e4567-e89b-12d3-a456-426614174000',
      });
    });

    it('should throw BadRequestException when file is missing', async () => {
      await expect(
        blobStorageService.uploadBlob(
          'uploads',
          undefined,
          'test.pdf',
          null as any,
        ),
      ).rejects.toThrow(new BadRequestException(ErrorMessages.FILE_MISSING));
    });

    it('should throw BadRequestException when file buffer is missing', async () => {
      const invalidFile = { ...mockFile, buffer: null } as any;

      await expect(
        blobStorageService.uploadBlob(
          'uploads',
          undefined,
          'test.pdf',
          invalidFile,
        ),
      ).rejects.toThrow(new BadRequestException(ErrorMessages.FILE_MISSING));
    });

    it('should handle 404 container not found error', async () => {
      const mockSasData = {
        sasUrl:
          'https://teststorageaccount.blob.core.windows.net/uploads/test.pdf?sv=...',
      };

      const mockError = { statusCode: 404 };
      const mockBlockBlobClient = {
        upload: jest.fn().mockRejectedValue(mockError),
      };

      (sasService.generateSasTokenWithParams as jest.Mock).mockResolvedValue(
        mockSasData,
      );
      (storageBlob.BlockBlobClient as unknown as jest.Mock).mockImplementation(
        () => mockBlockBlobClient,
      );

      await expect(
        blobStorageService.uploadBlob(
          'nonexistent',
          undefined,
          'test.pdf',
          mockFile,
        ),
      ).rejects.toThrow(
        new BadRequestException(ErrorMessages.CONTAINER_NOT_FOUND),
      );
    });

    it('should handle 401 authentication error', async () => {
      const mockSasData = {
        sasUrl:
          'https://teststorageaccount.blob.core.windows.net/uploads/test.pdf?sv=...',
      };

      const mockError = { statusCode: 401 };
      const mockBlockBlobClient = {
        upload: jest.fn().mockRejectedValue(mockError),
      };

      (sasService.generateSasTokenWithParams as jest.Mock).mockResolvedValue(
        mockSasData,
      );
      (storageBlob.BlockBlobClient as unknown as jest.Mock).mockImplementation(
        () => mockBlockBlobClient,
      );

      await expect(
        blobStorageService.uploadBlob(
          'uploads',
          undefined,
          'test.pdf',
          mockFile,
        ),
      ).rejects.toThrow(
        new InternalServerErrorException(ErrorMessages.SAS_PERMISSION),
      );
    });

    it('should handle 403 permission error', async () => {
      const mockSasData = {
        sasUrl:
          'https://teststorageaccount.blob.core.windows.net/uploads/test.pdf?sv=...',
      };

      const mockError = { statusCode: 403 };
      const mockBlockBlobClient = {
        upload: jest.fn().mockRejectedValue(mockError),
      };

      (sasService.generateSasTokenWithParams as jest.Mock).mockResolvedValue(
        mockSasData,
      );
      (storageBlob.BlockBlobClient as unknown as jest.Mock).mockImplementation(
        () => mockBlockBlobClient,
      );

      await expect(
        blobStorageService.uploadBlob(
          'uploads',
          undefined,
          'test.pdf',
          mockFile,
        ),
      ).rejects.toThrow(
        new InternalServerErrorException(ErrorMessages.SAS_PERMISSION),
      );
    });

    it('should handle generic errors', async () => {
      const mockSasData = {
        sasUrl:
          'https://teststorageaccount.blob.core.windows.net/uploads/test.pdf?sv=...',
      };

      const mockError = new Error('Unknown error');
      const mockBlockBlobClient = {
        upload: jest.fn().mockRejectedValue(mockError),
      };

      (sasService.generateSasTokenWithParams as jest.Mock).mockResolvedValue(
        mockSasData,
      );
      (storageBlob.BlockBlobClient as unknown as jest.Mock).mockImplementation(
        () => mockBlockBlobClient,
      );

      await expect(
        blobStorageService.uploadBlob(
          'uploads',
          undefined,
          'test.pdf',
          mockFile,
        ),
      ).rejects.toThrow(
        new InternalServerErrorException(ErrorMessages.SAS_GENERATION),
      );
    });
  });

  describe('deleteBlob', () => {
    it('should delete a blob successfully with directory', async () => {
      const mockSasData = {
        sasUrl:
          'https://teststorageaccount.blob.core.windows.net/uploads/documents/2024/test.pdf?sv=...',
        sasToken: 'sv=...',
      };

      const mockBlockBlobClient = {
        deleteIfExists: jest.fn().mockResolvedValue({ succeeded: true }),
      };

      (sasService.generateSasTokenWithParams as jest.Mock).mockResolvedValue(
        mockSasData,
      );
      (storageBlob.BlockBlobClient as unknown as jest.Mock).mockImplementation(
        () => mockBlockBlobClient,
      );

      const result = await blobStorageService.deleteBlob(
        'uploads',
        'documents/2024',
        'test.pdf',
      );

      expect(result).toEqual({
        containerName: 'uploads',
        blobName: 'test.pdf',
        fullPath: 'documents/2024/test.pdf',
        requestId: '123e4567-e89b-12d3-a456-426614174000',
      });

      expect(sasService.generateSasTokenWithParams).toHaveBeenCalledWith(
        'uploads',
        'documents/2024/test.pdf',
        [SasPermission.DELETE],
        30,
      );

      expect(mockBlockBlobClient.deleteIfExists).toHaveBeenCalled();
    });

    it('should delete a blob successfully without directory', async () => {
      const mockSasData = {
        sasUrl:
          'https://teststorageaccount.blob.core.windows.net/uploads/test.pdf?sv=...',
      };

      const mockBlockBlobClient = {
        deleteIfExists: jest.fn().mockResolvedValue({ succeeded: true }),
      };

      (sasService.generateSasTokenWithParams as jest.Mock).mockResolvedValue(
        mockSasData,
      );
      (storageBlob.BlockBlobClient as unknown as jest.Mock).mockImplementation(
        () => mockBlockBlobClient,
      );

      const result = await blobStorageService.deleteBlob(
        'uploads',
        undefined,
        'test.pdf',
      );

      expect(result).toEqual({
        containerName: 'uploads',
        blobName: 'test.pdf',
        fullPath: 'test.pdf',
        requestId: '123e4567-e89b-12d3-a456-426614174000',
      });
    });

    it('should throw BadRequestException when blob does not exist', async () => {
      const mockSasData = {
        sasUrl:
          'https://teststorageaccount.blob.core.windows.net/uploads/test.pdf?sv=...',
      };

      const mockBlockBlobClient = {
        deleteIfExists: jest.fn().mockResolvedValue({ succeeded: false }),
      };

      (sasService.generateSasTokenWithParams as jest.Mock).mockResolvedValue(
        mockSasData,
      );
      (storageBlob.BlockBlobClient as unknown as jest.Mock).mockImplementation(
        () => mockBlockBlobClient,
      );

      await expect(
        blobStorageService.deleteBlob('uploads', undefined, 'nonexistent.pdf'),
      ).rejects.toThrow(new BadRequestException(ErrorMessages.BLOB_NOT_FOUND));
    });

    it('should handle 404 error', async () => {
      const mockSasData = {
        sasUrl:
          'https://teststorageaccount.blob.core.windows.net/uploads/test.pdf?sv=...',
      };

      const mockError = { statusCode: 404 };
      const mockBlockBlobClient = {
        deleteIfExists: jest.fn().mockRejectedValue(mockError),
      };

      (sasService.generateSasTokenWithParams as jest.Mock).mockResolvedValue(
        mockSasData,
      );
      (storageBlob.BlockBlobClient as unknown as jest.Mock).mockImplementation(
        () => mockBlockBlobClient,
      );

      await expect(
        blobStorageService.deleteBlob('uploads', undefined, 'test.pdf'),
      ).rejects.toThrow(new BadRequestException(ErrorMessages.BLOB_NOT_FOUND));
    });

    it('should handle 401 authentication error', async () => {
      const mockSasData = {
        sasUrl:
          'https://teststorageaccount.blob.core.windows.net/uploads/test.pdf?sv=...',
      };

      const mockError = { statusCode: 401 };
      const mockBlockBlobClient = {
        deleteIfExists: jest.fn().mockRejectedValue(mockError),
      };

      (sasService.generateSasTokenWithParams as jest.Mock).mockResolvedValue(
        mockSasData,
      );
      (storageBlob.BlockBlobClient as unknown as jest.Mock).mockImplementation(
        () => mockBlockBlobClient,
      );

      await expect(
        blobStorageService.deleteBlob('uploads', undefined, 'test.pdf'),
      ).rejects.toThrow(
        new InternalServerErrorException(ErrorMessages.SAS_PERMISSION),
      );
    });

    it('should handle 403 permission error', async () => {
      const mockSasData = {
        sasUrl:
          'https://teststorageaccount.blob.core.windows.net/uploads/test.pdf?sv=...',
      };

      const mockError = { statusCode: 403 };
      const mockBlockBlobClient = {
        deleteIfExists: jest.fn().mockRejectedValue(mockError),
      };

      (sasService.generateSasTokenWithParams as jest.Mock).mockResolvedValue(
        mockSasData,
      );
      (storageBlob.BlockBlobClient as unknown as jest.Mock).mockImplementation(
        () => mockBlockBlobClient,
      );

      await expect(
        blobStorageService.deleteBlob('uploads', undefined, 'test.pdf'),
      ).rejects.toThrow(
        new InternalServerErrorException(ErrorMessages.SAS_PERMISSION),
      );
    });

    it('should rethrow BadRequestException', async () => {
      const mockSasData = {
        sasUrl:
          'https://teststorageaccount.blob.core.windows.net/uploads/test.pdf?sv=...',
      };

      const mockError = new BadRequestException('Custom error');
      const mockBlockBlobClient = {
        deleteIfExists: jest.fn().mockRejectedValue(mockError),
      };

      (sasService.generateSasTokenWithParams as jest.Mock).mockResolvedValue(
        mockSasData,
      );
      (storageBlob.BlockBlobClient as unknown as jest.Mock).mockImplementation(
        () => mockBlockBlobClient,
      );

      await expect(
        blobStorageService.deleteBlob('uploads', undefined, 'test.pdf'),
      ).rejects.toThrow(mockError);
    });
  });

  describe('listBlobs', () => {
    it('should call listBlobsInDirectory with undefined directory', async () => {
      const mockResult = {
        blobs: ['file1.pdf', 'file2.jpg'],
        containerName: 'uploads',
        requestId: '123e4567-e89b-12d3-a456-426614174000',
      };

      jest
        .spyOn(blobStorageService, 'listBlobsInDirectory')
        .mockResolvedValue(mockResult);

      const result = await blobStorageService.listBlobs('uploads');

      expect(result).toEqual(mockResult);
      expect(blobStorageService.listBlobsInDirectory).toHaveBeenCalledWith(
        'uploads',
      );
    });
  });

  describe('listBlobsInDirectory', () => {
    it('should list blobs successfully with directory', async () => {
      const mockSasData = {
        sasToken: 'sv=...',
      };

      const mockBlobs = [
        { name: 'documents/file1.pdf' },
        { name: 'documents/file2.jpg' },
      ];

      const mockContainerClient = {
        listBlobsFlat: jest.fn().mockReturnValue({
          [Symbol.asyncIterator]: async function* () {
            for (const blob of mockBlobs) {
              yield blob;
            }
          },
        }),
      };

      (sasService.generateSasTokenWithParams as jest.Mock).mockResolvedValue(
        mockSasData,
      );
      (storageBlob.ContainerClient as unknown as jest.Mock).mockImplementation(
        () => mockContainerClient,
      );

      const result = await blobStorageService.listBlobsInDirectory(
        'uploads',
        'documents',
      );

      expect(result).toEqual({
        blobs: ['documents/file1.pdf', 'documents/file2.jpg'],
        containerName: 'uploads',
        directory: 'documents',
        requestId: '123e4567-e89b-12d3-a456-426614174000',
      });

      expect(sasService.generateSasTokenWithParams).toHaveBeenCalledWith(
        'uploads',
        undefined,
        [SasPermission.LIST],
        30,
      );

      expect(mockContainerClient.listBlobsFlat).toHaveBeenCalledWith({
        prefix: 'documents/',
      });
    });

    it('should list blobs successfully without directory', async () => {
      const mockSasData = {
        sasToken: 'sv=...',
      };

      const mockBlobs = [{ name: 'file1.pdf' }, { name: 'file2.jpg' }];

      const mockContainerClient = {
        listBlobsFlat: jest.fn().mockReturnValue({
          [Symbol.asyncIterator]: async function* () {
            for (const blob of mockBlobs) {
              yield blob;
            }
          },
        }),
      };

      (sasService.generateSasTokenWithParams as jest.Mock).mockResolvedValue(
        mockSasData,
      );
      (storageBlob.ContainerClient as unknown as jest.Mock).mockImplementation(
        () => mockContainerClient,
      );

      const result = await blobStorageService.listBlobsInDirectory('uploads');

      expect(result).toEqual({
        blobs: ['file1.pdf', 'file2.jpg'],
        containerName: 'uploads',
        requestId: '123e4567-e89b-12d3-a456-426614174000',
      });

      expect(mockContainerClient.listBlobsFlat).toHaveBeenCalledWith({});
    });

    it('should handle empty directory', async () => {
      const mockSasData = {
        sasToken: 'sv=...',
      };

      const mockContainerClient = {
        listBlobsFlat: jest.fn().mockReturnValue({
          [Symbol.asyncIterator]: async function* () {},
        }),
      };

      (sasService.generateSasTokenWithParams as jest.Mock).mockResolvedValue(
        mockSasData,
      );
      (storageBlob.ContainerClient as unknown as jest.Mock).mockImplementation(
        () => mockContainerClient,
      );

      const result = await blobStorageService.listBlobsInDirectory(
        'uploads',
        'empty',
      );

      expect(result).toEqual({
        blobs: [],
        containerName: 'uploads',
        directory: 'empty',
        requestId: '123e4567-e89b-12d3-a456-426614174000',
      });
    });

    it('should handle 404 container not found error', async () => {
      const mockSasData = {
        sasToken: 'sv=...',
      };

      const mockError = { statusCode: 404 };
      const mockContainerClient = {
        listBlobsFlat: jest.fn().mockReturnValue({
          [Symbol.asyncIterator]: async function* () {
            throw mockError;
          },
        }),
      };

      (sasService.generateSasTokenWithParams as jest.Mock).mockResolvedValue(
        mockSasData,
      );
      (storageBlob.ContainerClient as unknown as jest.Mock).mockImplementation(
        () => mockContainerClient,
      );

      await expect(
        blobStorageService.listBlobsInDirectory('nonexistent'),
      ).rejects.toThrow(
        new BadRequestException(ErrorMessages.CONTAINER_NOT_FOUND),
      );
    });

    it('should handle 401 authentication error', async () => {
      const mockSasData = {
        sasToken: 'sv=...',
      };

      const mockError = { statusCode: 401 };
      const mockContainerClient = {
        listBlobsFlat: jest.fn().mockReturnValue({
          [Symbol.asyncIterator]: async function* () {
            throw mockError;
          },
        }),
      };

      (sasService.generateSasTokenWithParams as jest.Mock).mockResolvedValue(
        mockSasData,
      );
      (storageBlob.ContainerClient as unknown as jest.Mock).mockImplementation(
        () => mockContainerClient,
      );

      await expect(
        blobStorageService.listBlobsInDirectory('uploads'),
      ).rejects.toThrow(
        new InternalServerErrorException(ErrorMessages.SAS_PERMISSION),
      );
    });

    it('should handle 403 permission error', async () => {
      const mockSasData = {
        sasToken: 'sv=...',
      };

      const mockError = { statusCode: 403 };
      const mockContainerClient = {
        listBlobsFlat: jest.fn().mockReturnValue({
          [Symbol.asyncIterator]: async function* () {
            throw mockError;
          },
        }),
      };

      (sasService.generateSasTokenWithParams as jest.Mock).mockResolvedValue(
        mockSasData,
      );
      (storageBlob.ContainerClient as unknown as jest.Mock).mockImplementation(
        () => mockContainerClient,
      );

      await expect(
        blobStorageService.listBlobsInDirectory('uploads'),
      ).rejects.toThrow(
        new InternalServerErrorException(ErrorMessages.SAS_PERMISSION),
      );
    });

    it('should handle generic errors', async () => {
      const mockSasData = {
        sasToken: 'sv=...',
      };

      const mockError = new Error('Unknown error');
      const mockContainerClient = {
        listBlobsFlat: jest.fn().mockReturnValue({
          [Symbol.asyncIterator]: async function* () {
            throw mockError;
          },
        }),
      };

      (sasService.generateSasTokenWithParams as jest.Mock).mockResolvedValue(
        mockSasData,
      );
      (storageBlob.ContainerClient as unknown as jest.Mock).mockImplementation(
        () => mockContainerClient,
      );

      await expect(
        blobStorageService.listBlobsInDirectory('uploads'),
      ).rejects.toThrow(
        new InternalServerErrorException(ErrorMessages.SAS_GENERATION),
      );
    });
  });

  describe('downloadBlob', () => {
    it('should download a blob successfully with directory', async () => {
      const mockSasData = {
        sasUrl:
          'https://teststorageaccount.blob.core.windows.net/uploads/documents/2024/test.pdf?sv=...',
        sasToken: 'sv=...',
      };

      const mockBuffer = Buffer.from('test file content');
      const mockProperties = {
        contentType: 'application/pdf',
      };

      const mockBlockBlobClient = {
        downloadToBuffer: jest.fn().mockResolvedValue(mockBuffer),
        getProperties: jest.fn().mockResolvedValue(mockProperties),
      };

      (sasService.generateSasTokenWithParams as jest.Mock).mockResolvedValue(
        mockSasData,
      );
      (storageBlob.BlockBlobClient as unknown as jest.Mock).mockImplementation(
        () => mockBlockBlobClient,
      );

      const result = await blobStorageService.downloadBlob(
        'uploads',
        'documents/2024',
        'test.pdf',
      );

      expect(result).toEqual({
        data: mockBuffer,
        contentType: 'application/pdf',
        containerName: 'uploads',
        blobName: 'test.pdf',
        fullPath: 'documents/2024/test.pdf',
        requestId: '123e4567-e89b-12d3-a456-426614174000',
      });

      expect(sasService.generateSasTokenWithParams).toHaveBeenCalledWith(
        'uploads',
        'documents/2024/test.pdf',
        [SasPermission.READ],
        30,
      );

      expect(mockBlockBlobClient.downloadToBuffer).toHaveBeenCalled();
      expect(mockBlockBlobClient.getProperties).toHaveBeenCalled();
    });

    it('should download a blob successfully without directory', async () => {
      const mockSasData = {
        sasUrl:
          'https://teststorageaccount.blob.core.windows.net/uploads/test.pdf?sv=...',
        sasToken: 'sv=...',
      };

      const mockBuffer = Buffer.from('test file content');
      const mockProperties = {
        contentType: 'text/plain',
      };

      const mockBlockBlobClient = {
        downloadToBuffer: jest.fn().mockResolvedValue(mockBuffer),
        getProperties: jest.fn().mockResolvedValue(mockProperties),
      };

      (sasService.generateSasTokenWithParams as jest.Mock).mockResolvedValue(
        mockSasData,
      );
      (storageBlob.BlockBlobClient as unknown as jest.Mock).mockImplementation(
        () => mockBlockBlobClient,
      );

      const result = await blobStorageService.downloadBlob(
        'uploads',
        undefined,
        'test.txt',
      );

      expect(result).toEqual({
        data: mockBuffer,
        contentType: 'text/plain',
        containerName: 'uploads',
        blobName: 'test.txt',
        fullPath: 'test.txt',
        requestId: '123e4567-e89b-12d3-a456-426614174000',
      });

      expect(sasService.generateSasTokenWithParams).toHaveBeenCalledWith(
        'uploads',
        'test.txt',
        [SasPermission.READ],
        30,
      );
    });

    it('should use default content type when not provided', async () => {
      const mockSasData = {
        sasUrl:
          'https://teststorageaccount.blob.core.windows.net/uploads/test.bin?sv=...',
      };

      const mockBuffer = Buffer.from('binary content');
      const mockProperties = {};

      const mockBlockBlobClient = {
        downloadToBuffer: jest.fn().mockResolvedValue(mockBuffer),
        getProperties: jest.fn().mockResolvedValue(mockProperties),
      };

      (sasService.generateSasTokenWithParams as jest.Mock).mockResolvedValue(
        mockSasData,
      );
      (storageBlob.BlockBlobClient as unknown as jest.Mock).mockImplementation(
        () => mockBlockBlobClient,
      );

      const result = await blobStorageService.downloadBlob(
        'uploads',
        undefined,
        'test.bin',
      );

      expect(result.contentType).toBe('application/octet-stream');
    });

    it('should throw BadRequestException when blob not found', async () => {
      const mockSasData = {
        sasUrl:
          'https://teststorageaccount.blob.core.windows.net/uploads/test.pdf?sv=...',
      };

      const mockError = { statusCode: 404 };
      const mockBlockBlobClient = {
        downloadToBuffer: jest.fn().mockRejectedValue(mockError),
        getProperties: jest.fn(),
      };

      (sasService.generateSasTokenWithParams as jest.Mock).mockResolvedValue(
        mockSasData,
      );
      (storageBlob.BlockBlobClient as unknown as jest.Mock).mockImplementation(
        () => mockBlockBlobClient,
      );

      await expect(
        blobStorageService.downloadBlob(
          'uploads',
          undefined,
          'nonexistent.pdf',
        ),
      ).rejects.toThrow(new BadRequestException(ErrorMessages.BLOB_NOT_FOUND));
    });

    it('should handle 401 authentication error', async () => {
      const mockSasData = {
        sasUrl:
          'https://teststorageaccount.blob.core.windows.net/uploads/test.pdf?sv=...',
      };

      const mockError = { statusCode: 401 };
      const mockBlockBlobClient = {
        downloadToBuffer: jest.fn().mockRejectedValue(mockError),
        getProperties: jest.fn(),
      };

      (sasService.generateSasTokenWithParams as jest.Mock).mockResolvedValue(
        mockSasData,
      );
      (storageBlob.BlockBlobClient as unknown as jest.Mock).mockImplementation(
        () => mockBlockBlobClient,
      );

      await expect(
        blobStorageService.downloadBlob('uploads', undefined, 'test.pdf'),
      ).rejects.toThrow(
        new InternalServerErrorException(ErrorMessages.SAS_PERMISSION),
      );
    });

    it('should handle 403 permission error', async () => {
      const mockSasData = {
        sasUrl:
          'https://teststorageaccount.blob.core.windows.net/uploads/test.pdf?sv=...',
      };

      const mockError = { statusCode: 403 };
      const mockBlockBlobClient = {
        downloadToBuffer: jest.fn().mockRejectedValue(mockError),
        getProperties: jest.fn(),
      };

      (sasService.generateSasTokenWithParams as jest.Mock).mockResolvedValue(
        mockSasData,
      );
      (storageBlob.BlockBlobClient as unknown as jest.Mock).mockImplementation(
        () => mockBlockBlobClient,
      );

      await expect(
        blobStorageService.downloadBlob('uploads', undefined, 'test.pdf'),
      ).rejects.toThrow(
        new InternalServerErrorException(ErrorMessages.SAS_PERMISSION),
      );
    });

    it('should handle generic errors', async () => {
      const mockSasData = {
        sasUrl:
          'https://teststorageaccount.blob.core.windows.net/uploads/test.pdf?sv=...',
      };

      const mockError = new Error('Network error');
      const mockBlockBlobClient = {
        downloadToBuffer: jest.fn().mockRejectedValue(mockError),
        getProperties: jest.fn(),
      };

      (sasService.generateSasTokenWithParams as jest.Mock).mockResolvedValue(
        mockSasData,
      );
      (storageBlob.BlockBlobClient as unknown as jest.Mock).mockImplementation(
        () => mockBlockBlobClient,
      );

      await expect(
        blobStorageService.downloadBlob('uploads', undefined, 'test.pdf'),
      ).rejects.toThrow(
        new InternalServerErrorException(ErrorMessages.SAS_GENERATION),
      );
    });

    it('should handle error when getting properties fails', async () => {
      const mockSasData = {
        sasUrl:
          'https://teststorageaccount.blob.core.windows.net/uploads/test.pdf?sv=...',
      };

      const mockBuffer = Buffer.from('test content');
      const mockError = new Error('Properties error');
      const mockBlockBlobClient = {
        downloadToBuffer: jest.fn().mockResolvedValue(mockBuffer),
        getProperties: jest.fn().mockRejectedValue(mockError),
      };

      (sasService.generateSasTokenWithParams as jest.Mock).mockResolvedValue(
        mockSasData,
      );
      (storageBlob.BlockBlobClient as unknown as jest.Mock).mockImplementation(
        () => mockBlockBlobClient,
      );

      await expect(
        blobStorageService.downloadBlob('uploads', undefined, 'test.pdf'),
      ).rejects.toThrow(
        new InternalServerErrorException(ErrorMessages.SAS_GENERATION),
      );
    });
  });
});
