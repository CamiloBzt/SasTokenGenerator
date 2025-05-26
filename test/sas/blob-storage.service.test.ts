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

  describe('uploadBlobBase64', () => {
    const validBase64 =
      'JVBERi0xLjQKJdP0zOEKMSAwIG9iago8PAovVHlwZSAvQ2F0YWxvZwovUGFnZXMgMiAwIFIKPj4KZW5kb2JqCg==';
    const validMimeType = 'application/pdf';

    it('should upload a Base64 blob successfully with directory', async () => {
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

      const result = await blobStorageService.uploadBlobBase64(
        'uploads',
        'documents/2024',
        'test.pdf',
        validBase64,
        validMimeType,
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
        expect.any(Buffer),
        expect.any(Number),
        {
          blobHTTPHeaders: {
            blobContentType: validMimeType,
          },
        },
      );
    });

    it('should upload a Base64 blob successfully without directory', async () => {
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

      const result = await blobStorageService.uploadBlobBase64(
        'uploads',
        undefined,
        'test.pdf',
        validBase64,
        validMimeType,
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

    it('should throw BadRequestException when Base64 is missing', async () => {
      await expect(
        blobStorageService.uploadBlobBase64(
          'uploads',
          undefined,
          'test.pdf',
          '',
          validMimeType,
        ),
      ).rejects.toThrow(
        new BadRequestException(ErrorMessages.FILE_BASE64_MISSING),
      );
    });

    it('should throw BadRequestException when Base64 is only whitespace', async () => {
      await expect(
        blobStorageService.uploadBlobBase64(
          'uploads',
          undefined,
          'test.pdf',
          '   ',
          validMimeType,
        ),
      ).rejects.toThrow(
        new BadRequestException(ErrorMessages.FILE_BASE64_MISSING),
      );
    });

    it('should throw BadRequestException when MIME type is missing', async () => {
      await expect(
        blobStorageService.uploadBlobBase64(
          'uploads',
          undefined,
          'test.pdf',
          validBase64,
          '',
        ),
      ).rejects.toThrow(
        new BadRequestException(ErrorMessages.MIME_TYPE_MISSING),
      );
    });

    it('should throw BadRequestException when MIME type is only whitespace', async () => {
      await expect(
        blobStorageService.uploadBlobBase64(
          'uploads',
          undefined,
          'test.pdf',
          validBase64,
          '   ',
        ),
      ).rejects.toThrow(
        new BadRequestException(ErrorMessages.MIME_TYPE_MISSING),
      );
    });

    it('should throw BadRequestException when Base64 results in empty buffer', async () => {
      await expect(
        blobStorageService.uploadBlobBase64(
          'uploads',
          undefined,
          'test.pdf',
          '', // Empty Base64 that results in empty buffer
          validMimeType,
        ),
      ).rejects.toThrow(
        new BadRequestException(ErrorMessages.FILE_BASE64_MISSING),
      );
    });

    it('should throw BadRequestException when Base64 is invalid', async () => {
      const invalidBase64 = 'invalid-base64!!!';

      await expect(
        blobStorageService.uploadBlobBase64(
          'uploads',
          undefined,
          'test.pdf',
          invalidBase64,
          validMimeType,
        ),
      ).rejects.toThrow(
        new BadRequestException(ErrorMessages.BASE64_CONTENT_INVALID),
      );
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
        blobStorageService.uploadBlobBase64(
          'nonexistent',
          undefined,
          'test.pdf',
          validBase64,
          validMimeType,
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
        blobStorageService.uploadBlobBase64(
          'uploads',
          undefined,
          'test.pdf',
          validBase64,
          validMimeType,
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
        blobStorageService.uploadBlobBase64(
          'uploads',
          undefined,
          'test.pdf',
          validBase64,
          validMimeType,
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

      const mockError = new Error('Network error');
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
        blobStorageService.uploadBlobBase64(
          'uploads',
          undefined,
          'test.pdf',
          validBase64,
          validMimeType,
        ),
      ).rejects.toThrow(
        new InternalServerErrorException(ErrorMessages.SAS_GENERATION),
      );
    });

    it('should rethrow existing BadRequestException', async () => {
      const mockSasData = {
        sasUrl:
          'https://teststorageaccount.blob.core.windows.net/uploads/test.pdf?sv=...',
      };

      const customError = new BadRequestException('Custom validation error');
      const mockBlockBlobClient = {
        upload: jest.fn().mockRejectedValue(customError),
      };

      (sasService.generateSasTokenWithParams as jest.Mock).mockResolvedValue(
        mockSasData,
      );
      (storageBlob.BlockBlobClient as unknown as jest.Mock).mockImplementation(
        () => mockBlockBlobClient,
      );

      await expect(
        blobStorageService.uploadBlobBase64(
          'uploads',
          undefined,
          'test.pdf',
          validBase64,
          validMimeType,
        ),
      ).rejects.toThrow(customError);
    });
  });

  describe('downloadBlobBase64', () => {
    it('should download a blob as Base64 successfully with directory', async () => {
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

      const result = await blobStorageService.downloadBlobBase64(
        'uploads',
        'documents/2024',
        'test.pdf',
      );

      expect(result).toEqual({
        fileBase64: mockBuffer.toString('base64'),
        contentType: 'application/pdf',
        containerName: 'uploads',
        blobName: 'test.pdf',
        fullPath: 'documents/2024/test.pdf',
        size: mockBuffer.length,
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

    it('should download a blob as Base64 successfully without directory', async () => {
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

      const result = await blobStorageService.downloadBlobBase64(
        'uploads',
        undefined,
        'test.txt',
      );

      expect(result).toEqual({
        fileBase64: mockBuffer.toString('base64'),
        contentType: 'text/plain',
        containerName: 'uploads',
        blobName: 'test.txt',
        fullPath: 'test.txt',
        size: mockBuffer.length,
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
      const mockProperties = {}; // No contentType

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

      const result = await blobStorageService.downloadBlobBase64(
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
        blobStorageService.downloadBlobBase64(
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
        blobStorageService.downloadBlobBase64('uploads', undefined, 'test.pdf'),
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
        blobStorageService.downloadBlobBase64('uploads', undefined, 'test.pdf'),
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
        blobStorageService.downloadBlobBase64('uploads', undefined, 'test.pdf'),
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
        blobStorageService.downloadBlobBase64('uploads', undefined, 'test.pdf'),
      ).rejects.toThrow(
        new InternalServerErrorException(ErrorMessages.SAS_GENERATION),
      );
    });

    it('should convert buffer to Base64 correctly', async () => {
      const mockSasData = {
        sasUrl:
          'https://teststorageaccount.blob.core.windows.net/uploads/test.txt?sv=...',
      };

      const testContent = 'Hello World!';
      const mockBuffer = Buffer.from(testContent);
      const expectedBase64 = mockBuffer.toString('base64');
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

      const result = await blobStorageService.downloadBlobBase64(
        'uploads',
        undefined,
        'test.txt',
      );

      expect(result.fileBase64).toBe(expectedBase64);
      expect(result.size).toBe(testContent.length);
    });
  });
});
