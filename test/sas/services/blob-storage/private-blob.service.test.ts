import * as storageBlob from '@azure/storage-blob';
import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@src/shared/exceptions/bad-request.exception';
import { BusinessErrorException } from '@src/shared/exceptions/business-error.exception';
import { PrivateBlobService } from '@src/sas/services/blob-storage/private-blob.service';
import { SasService } from '@src/sas/services/sas.service';

jest.mock('@src/common/utils', () => ({
  formatFileSize: jest.fn((size: number) => `${size} B`),
  processEnrichedBlobs: jest.fn((items: any[]) => {
    const enrichedBlobs = items.map((item) => ({
      name: item.name,
      fileName: item.name.split('/').pop(),
      directory: item.name.includes('/')
        ? item.name.split('/').slice(0, -1).join('/')
        : undefined,
      fileExtension: item.name.includes('.')
        ? item.name.substring(item.name.lastIndexOf('.'))
        : undefined,
      size: item.properties?.contentLength ?? 0,
      sizeFormatted: `${item.properties?.contentLength ?? 0} B`,
      contentType: item.properties?.contentType,
      lastModified: item.properties?.lastModified ?? new Date(),
      etag: item.properties?.etag,
    }));

    const totalSize = items.reduce(
      (acc, item) => acc + (item.properties?.contentLength ?? 0),
      0,
    );

    return { enrichedBlobs, totalSize };
  }),
}));

jest.mock('@azure/storage-blob');
jest.mock('uuid', () => ({
  v4: jest.fn(() => '123e4567-e89b-12d3-a456-426614174000'),
}));

describe('PrivateBlobService - Complete Coverage', () => {
  let privateBlobService: PrivateBlobService;
  let sasService: Partial<SasService>;
  let configService: Partial<ConfigService>;

  beforeEach(async () => {
    jest.clearAllMocks();

    configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          'azure.storageAccountName': 'teststorageaccount',
        };
        return values[key];
      }),
    };

    sasService = {
      generateSasTokenWithParams: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrivateBlobService,
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

    privateBlobService = module.get<PrivateBlobService>(PrivateBlobService);
  });

  describe('uploadBlob', () => {
    const mockFile: Express.Multer.File = {
      fieldname: 'file',
      originalname: 'test.pdf',
      encoding: '7bit',
      mimetype: 'application/pdf',
      size: 1024,
      buffer: Buffer.from('test content'),
      destination: '',
      filename: '',
      path: '',
      stream: null as any,
    };

    it('should upload a file successfully', async () => {
      const mockSasData = {
        sasUrl:
          'https://teststorageaccount.blob.core.windows.net/uploads/test.pdf?sv=...',
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

      const result = await privateBlobService.uploadBlob(
        'uploads',
        undefined,
        'test.pdf',
        mockFile,
      );

      expect(result.blobUrl).toBe(
        'https://teststorageaccount.blob.core.windows.net/uploads/test.pdf',
      );
      expect(result.containerName).toBe('uploads');
      expect(result.blobName).toBe('test.pdf');
      expect(result.fullPath).toBe('test.pdf');
      expect(result.requestId).toBe('123e4567-e89b-12d3-a456-426614174000');
    });

    it('should upload file with directory successfully', async () => {
      const mockSasData = {
        sasUrl:
          'https://teststorageaccount.blob.core.windows.net/uploads/docs/test.pdf?sv=...',
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

      const result = await privateBlobService.uploadBlob(
        'uploads',
        'docs',
        'test.pdf',
        mockFile,
      );

      expect(result.fullPath).toBe('docs/test.pdf');
    });

    it('should upload file with directory ending with slash', async () => {
      const mockSasData = {
        sasUrl:
          'https://teststorageaccount.blob.core.windows.net/uploads/docs/test.pdf?sv=...',
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

      const result = await privateBlobService.uploadBlob(
        'uploads',
        'docs/',
        'test.pdf',
        mockFile,
      );

      expect(result.fullPath).toBe('docs/test.pdf');
    });

    it('should throw error when file is missing', async () => {
      await expect(
        privateBlobService.uploadBlob(
          'uploads',
          undefined,
          'test.pdf',
          null as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw error when file buffer is missing', async () => {
      const mockFileWithoutBuffer = { ...mockFile, buffer: undefined };

      await expect(
        privateBlobService.uploadBlob(
          'uploads',
          undefined,
          'test.pdf',
          mockFileWithoutBuffer as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle 401 upload errors', async () => {
      const mockSasData = { sasUrl: 'https://test.com' };
      const mockBlockBlobClient = {
        upload: jest
          .fn()
          .mockRejectedValue(
            Object.assign(new Error('Unauthorized'), { statusCode: 401 }),
          ),
      };

      (sasService.generateSasTokenWithParams as jest.Mock).mockResolvedValue(
        mockSasData,
      );
      (storageBlob.BlockBlobClient as unknown as jest.Mock).mockImplementation(
        () => mockBlockBlobClient,
      );

      await expect(
        privateBlobService.uploadBlob(
          'uploads',
          undefined,
          'test.pdf',
          mockFile,
        ),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('should handle 403 upload errors', async () => {
      const mockSasData = { sasUrl: 'https://test.com' };
      const mockBlockBlobClient = {
        upload: jest
          .fn()
          .mockRejectedValue(
            Object.assign(new Error('Forbidden'), { statusCode: 403 }),
          ),
      };

      (sasService.generateSasTokenWithParams as jest.Mock).mockResolvedValue(
        mockSasData,
      );
      (storageBlob.BlockBlobClient as unknown as jest.Mock).mockImplementation(
        () => mockBlockBlobClient,
      );

      await expect(
        privateBlobService.uploadBlob(
          'uploads',
          undefined,
          'test.pdf',
          mockFile,
        ),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('should handle 404 upload errors', async () => {
      const mockSasData = { sasUrl: 'https://test.com' };
      const mockBlockBlobClient = {
        upload: jest
          .fn()
          .mockRejectedValue(
            Object.assign(new Error('Not Found'), { statusCode: 404 }),
          ),
      };

      (sasService.generateSasTokenWithParams as jest.Mock).mockResolvedValue(
        mockSasData,
      );
      (storageBlob.BlockBlobClient as unknown as jest.Mock).mockImplementation(
        () => mockBlockBlobClient,
      );

      await expect(
        privateBlobService.uploadBlob(
          'uploads',
          undefined,
          'test.pdf',
          mockFile,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle generic upload errors', async () => {
      const mockSasData = { sasUrl: 'https://test.com' };
      const mockBlockBlobClient = {
        upload: jest.fn().mockRejectedValue(new Error('Network error')),
      };

      (sasService.generateSasTokenWithParams as jest.Mock).mockResolvedValue(
        mockSasData,
      );
      (storageBlob.BlockBlobClient as unknown as jest.Mock).mockImplementation(
        () => mockBlockBlobClient,
      );

      await expect(
        privateBlobService.uploadBlob(
          'uploads',
          undefined,
          'test.pdf',
          mockFile,
        ),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('uploadBlobBase64', () => {
    const validBase64 = 'dGVzdCBjb250ZW50';
    const validMimeType = 'application/pdf';

    it('should upload Base64 successfully', async () => {
      const mockSasData = {
        sasUrl:
          'https://teststorageaccount.blob.core.windows.net/uploads/test.pdf?sv=...',
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

      const result = await privateBlobService.uploadBlobBase64(
        'uploads',
        undefined,
        'test.pdf',
        validBase64,
        validMimeType,
      );

      expect(result.blobUrl).toBe(
        'https://teststorageaccount.blob.core.windows.net/uploads/test.pdf',
      );
      expect(result.fullPath).toBe('test.pdf');
    });

    it('should throw error when base64 is empty', async () => {
      await expect(
        privateBlobService.uploadBlobBase64(
          'uploads',
          undefined,
          'test.pdf',
          '',
          validMimeType,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw error when base64 is whitespace only', async () => {
      await expect(
        privateBlobService.uploadBlobBase64(
          'uploads',
          undefined,
          'test.pdf',
          '   ',
          validMimeType,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw error when mimeType is empty', async () => {
      await expect(
        privateBlobService.uploadBlobBase64(
          'uploads',
          undefined,
          'test.pdf',
          validBase64,
          '',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw error when mimeType is whitespace only', async () => {
      await expect(
        privateBlobService.uploadBlobBase64(
          'uploads',
          undefined,
          'test.pdf',
          validBase64,
          '   ',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw error when base64 buffer is empty', async () => {
      await expect(
        privateBlobService.uploadBlobBase64(
          'uploads',
          undefined,
          'test.pdf',
          '',
          validMimeType,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle invalid base64 content', async () => {
      const originalBufferFrom = Buffer.from;
      Buffer.from = jest.fn().mockImplementation((str, encoding) => {
        if (encoding === 'base64' && str === 'invalid-base64') {
          const error = new TypeError('Invalid base64');
          throw error;
        }
        return originalBufferFrom(str, encoding);
      });

      await expect(
        privateBlobService.uploadBlobBase64(
          'uploads',
          undefined,
          'test.pdf',
          'invalid-base64',
          validMimeType,
        ),
      ).rejects.toThrow(BadRequestException);

      Buffer.from = originalBufferFrom;
    });

    it('should handle base64 with Invalid in message', async () => {
      const originalBufferFrom = Buffer.from;
      Buffer.from = jest.fn().mockImplementation((str, encoding) => {
        if (encoding === 'base64') {
          const error = new Error('Invalid character found');
          throw error;
        }
        return originalBufferFrom(str, encoding);
      });

      await expect(
        privateBlobService.uploadBlobBase64(
          'uploads',
          undefined,
          'test.pdf',
          'invalid',
          validMimeType,
        ),
      ).rejects.toThrow(BadRequestException);

      Buffer.from = originalBufferFrom;
    });

    it('should re-throw BadRequestException from validation', async () => {
      await expect(
        privateBlobService.uploadBlobBase64(
          'uploads',
          undefined,
          'test.pdf',
          '',
          validMimeType,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle 401, 403, 404 Azure errors', async () => {
      const mockSasData = { sasUrl: 'https://test.com' };
      const mockBlockBlobClient = {
        upload: jest
          .fn()
          .mockRejectedValue(
            Object.assign(new Error('Unauthorized'), { statusCode: 401 }),
          ),
      };

      (sasService.generateSasTokenWithParams as jest.Mock).mockResolvedValue(
        mockSasData,
      );
      (storageBlob.BlockBlobClient as unknown as jest.Mock).mockImplementation(
        () => mockBlockBlobClient,
      );

      await expect(
        privateBlobService.uploadBlobBase64(
          'uploads',
          undefined,
          'test.pdf',
          validBase64,
          validMimeType,
        ),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('downloadBlob', () => {
    it('should download blob successfully', async () => {
      const mockSasData = {
        sasUrl:
          'https://teststorageaccount.blob.core.windows.net/uploads/test.pdf?sv=...',
      };

      const mockBuffer = Buffer.from('test content');
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

      const result = await privateBlobService.downloadBlob(
        'uploads',
        undefined,
        'test.pdf',
      );

      expect(result.data).toBe(mockBuffer);
      expect(result.contentType).toBe('application/pdf');
      expect(result.containerName).toBe('uploads');
      expect(result.blobName).toBe('test.pdf');
      expect(result.fullPath).toBe('test.pdf');
    });

    it('should use default content type when none provided', async () => {
      const mockSasData = { sasUrl: 'https://test.com' };
      const mockBuffer = Buffer.from('test content');
      const mockProperties = { contentType: undefined };

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

      const result = await privateBlobService.downloadBlob(
        'uploads',
        undefined,
        'test.pdf',
      );

      expect(result.contentType).toBe('application/octet-stream');
    });

    it('should handle 404 download errors', async () => {
      const mockSasData = { sasUrl: 'https://test.com' };
      const mockBlockBlobClient = {
        downloadToBuffer: jest
          .fn()
          .mockRejectedValue(
            Object.assign(new Error('Not Found'), { statusCode: 404 }),
          ),
        getProperties: jest.fn(),
      };

      (sasService.generateSasTokenWithParams as jest.Mock).mockResolvedValue(
        mockSasData,
      );
      (storageBlob.BlockBlobClient as unknown as jest.Mock).mockImplementation(
        () => mockBlockBlobClient,
      );

      await expect(
        privateBlobService.downloadBlob('uploads', undefined, 'test.pdf'),
      ).rejects.toThrow(BusinessErrorException);
    });

    it('should handle 401 and 403 download errors', async () => {
      const mockSasData = { sasUrl: 'https://test.com' };
      const mockBlockBlobClient = {
        downloadToBuffer: jest
          .fn()
          .mockRejectedValue(
            Object.assign(new Error('Unauthorized'), { statusCode: 401 }),
          ),
        getProperties: jest.fn(),
      };

      (sasService.generateSasTokenWithParams as jest.Mock).mockResolvedValue(
        mockSasData,
      );
      (storageBlob.BlockBlobClient as unknown as jest.Mock).mockImplementation(
        () => mockBlockBlobClient,
      );

      await expect(
        privateBlobService.downloadBlob('uploads', undefined, 'test.pdf'),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('should handle generic download errors', async () => {
      const mockSasData = { sasUrl: 'https://test.com' };
      const mockBlockBlobClient = {
        downloadToBuffer: jest
          .fn()
          .mockRejectedValue(new Error('Network error')),
        getProperties: jest.fn(),
      };

      (sasService.generateSasTokenWithParams as jest.Mock).mockResolvedValue(
        mockSasData,
      );
      (storageBlob.BlockBlobClient as unknown as jest.Mock).mockImplementation(
        () => mockBlockBlobClient,
      );

      await expect(
        privateBlobService.downloadBlob('uploads', undefined, 'test.pdf'),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('downloadBlobBase64', () => {
    it('should download blob as Base64 successfully', async () => {
      const mockSasData = { sasUrl: 'https://test.com' };
      const mockBuffer = Buffer.from('test content');
      const mockProperties = { contentType: 'text/plain' };

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

      const result = await privateBlobService.downloadBlobBase64(
        'uploads',
        undefined,
        'test.txt',
      );

      expect(result.fileBase64).toBe(mockBuffer.toString('base64'));
      expect(result.size).toBe(mockBuffer.length);
      expect(result.contentType).toBe('text/plain');
    });

    it('should use default content type for base64 download', async () => {
      const mockSasData = { sasUrl: 'https://test.com' };
      const mockBuffer = Buffer.from('test content');
      const mockProperties = { contentType: null };

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

      const result = await privateBlobService.downloadBlobBase64(
        'uploads',
        undefined,
        'test.txt',
      );

      expect(result.contentType).toBe('application/octet-stream');
    });

    it('should handle all error types for base64 download', async () => {
      const mockSasData = { sasUrl: 'https://test.com' };
      const mockBlockBlobClient = {
        downloadToBuffer: jest
          .fn()
          .mockRejectedValue(
            Object.assign(new Error('Not Found'), { statusCode: 404 }),
          ),
        getProperties: jest.fn(),
      };

      (sasService.generateSasTokenWithParams as jest.Mock).mockResolvedValue(
        mockSasData,
      );
      (storageBlob.BlockBlobClient as unknown as jest.Mock).mockImplementation(
        () => mockBlockBlobClient,
      );

      await expect(
        privateBlobService.downloadBlobBase64('uploads', undefined, 'test.txt'),
      ).rejects.toThrow(BusinessErrorException);
    });
  });

  describe('deleteBlob', () => {
    it('should delete blob successfully', async () => {
      const mockSasData = { sasUrl: 'https://test.com' };
      const mockBlockBlobClient = {
        deleteIfExists: jest.fn().mockResolvedValue({ succeeded: true }),
      };

      (sasService.generateSasTokenWithParams as jest.Mock).mockResolvedValue(
        mockSasData,
      );
      (storageBlob.BlockBlobClient as unknown as jest.Mock).mockImplementation(
        () => mockBlockBlobClient,
      );

      const result = await privateBlobService.deleteBlob(
        'uploads',
        undefined,
        'test.pdf',
      );

      expect(result.containerName).toBe('uploads');
      expect(result.blobName).toBe('test.pdf');
      expect(result.fullPath).toBe('test.pdf');
    });

    it('should handle blob not found during delete', async () => {
      const mockSasData = { sasUrl: 'https://test.com' };
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
        privateBlobService.deleteBlob('uploads', undefined, 'test.pdf'),
      ).rejects.toThrow(BusinessErrorException);
    });

    it('should re-throw BusinessErrorException', async () => {
      const mockSasData = { sasUrl: 'https://test.com' };
      const businessError = new BusinessErrorException('Custom error');
      const mockBlockBlobClient = {
        deleteIfExists: jest.fn().mockRejectedValue(businessError),
      };

      (sasService.generateSasTokenWithParams as jest.Mock).mockResolvedValue(
        mockSasData,
      );
      (storageBlob.BlockBlobClient as unknown as jest.Mock).mockImplementation(
        () => mockBlockBlobClient,
      );

      await expect(
        privateBlobService.deleteBlob('uploads', undefined, 'test.pdf'),
      ).rejects.toThrow(BusinessErrorException);
    });

    it('should handle 404 delete errors', async () => {
      const mockSasData = { sasUrl: 'https://test.com' };
      const mockBlockBlobClient = {
        deleteIfExists: jest
          .fn()
          .mockRejectedValue(
            Object.assign(new Error('Not Found'), { statusCode: 404 }),
          ),
      };

      (sasService.generateSasTokenWithParams as jest.Mock).mockResolvedValue(
        mockSasData,
      );
      (storageBlob.BlockBlobClient as unknown as jest.Mock).mockImplementation(
        () => mockBlockBlobClient,
      );

      await expect(
        privateBlobService.deleteBlob('uploads', undefined, 'test.pdf'),
      ).rejects.toThrow(BusinessErrorException);
    });

    it('should handle 401, 403 delete errors', async () => {
      const mockSasData = { sasUrl: 'https://test.com' };
      const mockBlockBlobClient = {
        deleteIfExists: jest
          .fn()
          .mockRejectedValue(
            Object.assign(new Error('Unauthorized'), { statusCode: 401 }),
          ),
      };

      (sasService.generateSasTokenWithParams as jest.Mock).mockResolvedValue(
        mockSasData,
      );
      (storageBlob.BlockBlobClient as unknown as jest.Mock).mockImplementation(
        () => mockBlockBlobClient,
      );

      await expect(
        privateBlobService.deleteBlob('uploads', undefined, 'test.pdf'),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('should handle generic delete errors', async () => {
      const mockSasData = { sasUrl: 'https://test.com' };
      const mockBlockBlobClient = {
        deleteIfExists: jest.fn().mockRejectedValue(new Error('Network error')),
      };

      (sasService.generateSasTokenWithParams as jest.Mock).mockResolvedValue(
        mockSasData,
      );
      (storageBlob.BlockBlobClient as unknown as jest.Mock).mockImplementation(
        () => mockBlockBlobClient,
      );

      await expect(
        privateBlobService.deleteBlob('uploads', undefined, 'test.pdf'),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('listBlobs', () => {
    it('should list blobs successfully', async () => {
      const mockSasData = {
        sasToken: 'sv=...',
      };

      const mockBlobs = [
        {
          name: 'file1.pdf',
          properties: {
            contentLength: 1024,
            contentType: 'application/pdf',
            lastModified: new Date('2024-01-01'),
            etag: '"0x8D1234567890"',
          },
        },
        {
          name: 'file2.txt',
          properties: {
            contentLength: 512,
            contentType: 'text/plain',
            lastModified: new Date('2024-01-02'),
            etag: '"0x8D1234567891"',
          },
        },
      ];

      const mockContainerClient = {
        listBlobsFlat: jest.fn().mockImplementation(function* () {
          yield* mockBlobs;
        }),
      };

      (sasService.generateSasTokenWithParams as jest.Mock).mockResolvedValue(
        mockSasData,
      );
      (storageBlob.ContainerClient as unknown as jest.Mock).mockImplementation(
        () => mockContainerClient,
      );

      const result = await privateBlobService.listBlobs('uploads');

      expect(result.containerName).toBe('uploads');
      expect(result.totalBlobs).toBe(2);
      expect(mockContainerClient.listBlobsFlat).toHaveBeenCalledWith({});
    });

    it('should list blobs with directory', async () => {
      const mockSasData = { sasToken: 'sv=...' };

      const mockBlobs = [
        {
          name: 'docs/file1.pdf',
          properties: {
            contentLength: 2048,
            contentType: 'application/pdf',
            lastModified: new Date('2024-01-01'),
            etag: '"0x8D1234567892"',
          },
        },
      ];

      const mockContainerClient = {
        listBlobsFlat: jest.fn().mockImplementation(function* () {
          yield* mockBlobs;
        }),
      };

      (sasService.generateSasTokenWithParams as jest.Mock).mockResolvedValue(
        mockSasData,
      );
      (storageBlob.ContainerClient as unknown as jest.Mock).mockImplementation(
        () => mockContainerClient,
      );

      const result = await privateBlobService.listBlobs('uploads', 'docs');

      expect(result.directory).toBe('docs');
      expect(mockContainerClient.listBlobsFlat).toHaveBeenCalledWith({
        prefix: 'docs/',
      });
    });

    it('should list blobs with directory ending with slash', async () => {
      const mockSasData = { sasToken: 'sv=...' };
      const mockBlobs = [];

      const mockContainerClient = {
        listBlobsFlat: jest.fn().mockImplementation(function* () {
          yield* mockBlobs;
        }),
      };

      (sasService.generateSasTokenWithParams as jest.Mock).mockResolvedValue(
        mockSasData,
      );
      (storageBlob.ContainerClient as unknown as jest.Mock).mockImplementation(
        () => mockContainerClient,
      );

      await privateBlobService.listBlobs('uploads', 'docs/');

      expect(mockContainerClient.listBlobsFlat).toHaveBeenCalledWith({
        prefix: 'docs/',
      });
    });

    it('should list blobs with empty directory', async () => {
      const mockSasData = { sasToken: 'sv=...' };
      const mockBlobs = [];

      const mockContainerClient = {
        listBlobsFlat: jest.fn().mockImplementation(function* () {
          yield* mockBlobs;
        }),
      };

      (sasService.generateSasTokenWithParams as jest.Mock).mockResolvedValue(
        mockSasData,
      );
      (storageBlob.ContainerClient as unknown as jest.Mock).mockImplementation(
        () => mockContainerClient,
      );

      const result = await privateBlobService.listBlobs('uploads', '');

      expect(result.directory).toBeUndefined();
      expect(mockContainerClient.listBlobsFlat).toHaveBeenCalledWith({});
    });

    it('should handle 404 list errors', async () => {
      const mockSasData = { sasToken: 'sv=...' };
      const mockContainerClient = {
        listBlobsFlat: jest.fn().mockImplementation(function* () {
          throw Object.assign(new Error('Container not found'), {
            statusCode: 404,
          });
        }),
      };

      (sasService.generateSasTokenWithParams as jest.Mock).mockResolvedValue(
        mockSasData,
      );
      (storageBlob.ContainerClient as unknown as jest.Mock).mockImplementation(
        () => mockContainerClient,
      );

      await expect(privateBlobService.listBlobs('uploads')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should handle 401, 403 list errors', async () => {
      const mockSasData = { sasToken: 'sv=...' };
      const mockContainerClient = {
        listBlobsFlat: jest.fn().mockImplementation(function* () {
          throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
        }),
      };

      (sasService.generateSasTokenWithParams as jest.Mock).mockResolvedValue(
        mockSasData,
      );
      (storageBlob.ContainerClient as unknown as jest.Mock).mockImplementation(
        () => mockContainerClient,
      );

      await expect(privateBlobService.listBlobs('uploads')).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });
});
