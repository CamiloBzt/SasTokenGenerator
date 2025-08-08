import * as storageBlob from '@azure/storage-blob';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrivateBlobService } from '@src/sas/services/blob-storage/private-blob.service';
import { PublicBlobService } from '@src/sas/services/blob-storage/public-blob.service';
import { SasService } from '@src/sas/services/sas.service';

jest.mock('@azure/storage-blob');
jest.mock('uuid', () => ({
  v4: jest.fn(() => '123e4567-e89b-12d3-a456-426614174000'),
}));

describe('PublicBlobService', () => {
  let publicBlobService: PublicBlobService;
  let privateBlobService: Partial<PrivateBlobService>;
  let sasService: Partial<SasService>;
  let configService: Partial<ConfigService>;

  beforeEach(async () => {
    jest.clearAllMocks();

    configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          'azure.publicConnectionString':
            'DefaultEndpointsProtocol=https;AccountName=publicaccount;AccountKey=key123',
          'azure.publicContainerName': 'public-container',
          'azure.publicCustomDomain': 'cdn.example.com',
        };
        return values[key];
      }),
    };

    sasService = {
      generateSasTokenWithCustomConnection: jest.fn(),
    };

    privateBlobService = {
      downloadBlob: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PublicBlobService,
        {
          provide: ConfigService,
          useValue: configService,
        },
        {
          provide: SasService,
          useValue: sasService,
        },
        {
          provide: PrivateBlobService,
          useValue: privateBlobService,
        },
      ],
    }).compile();

    publicBlobService = module.get<PublicBlobService>(PublicBlobService);
  });

  describe('exposePublicBlob', () => {
    it('should expose private blob to public store successfully', async () => {
      const mockDownloadResult = {
        data: Buffer.from('test file content'),
        contentType: 'application/pdf',
        containerName: 'private-container',
        blobName: 'test.pdf',
        fullPath: 'documents/test.pdf',
        requestId: 'download-request-id',
      };

      const mockPublicSasData = {
        sasToken: 'public-sas-token',
        sasUrl:
          'https://publicaccount.blob.core.windows.net/public-container/documents/test.pdf?sv=...',
        permissions: 'r',
        expiresOn: new Date(Date.now() + 60 * 60 * 1000),
      };

      const mockBlockBlobClient = {
        upload: jest.fn().mockResolvedValue({}),
        exists: jest.fn().mockResolvedValue(false),
        deleteIfExists: jest.fn().mockResolvedValue({ succeeded: true }),
        getProperties: jest.fn().mockResolvedValue({
          contentType: 'application/pdf',
          contentLength: 17,
        }),
        setMetadata: jest.fn().mockResolvedValue({}),
        setHTTPHeaders: jest.fn().mockResolvedValue({}),
      };

      const mockAppendBlobClient = {
        exists: jest.fn().mockResolvedValue(false),
        deleteIfExists: jest.fn().mockResolvedValue({ succeeded: true }),
      };

      const mockContainerClient = {
        getBlockBlobClient: jest.fn().mockReturnValue(mockBlockBlobClient),
        getAppendBlobClient: jest.fn().mockReturnValue(mockAppendBlobClient),
      };

      const mockBlobServiceClient = {
        getContainerClient: jest.fn().mockReturnValue(mockContainerClient),
      };

      (privateBlobService.downloadBlob as jest.Mock).mockResolvedValue(
        mockDownloadResult,
      );
      (
        sasService.generateSasTokenWithCustomConnection as jest.Mock
      ).mockResolvedValue(mockPublicSasData);
      (
        storageBlob.BlobServiceClient.fromConnectionString as jest.Mock
      ).mockReturnValue(mockBlobServiceClient);

      const result = await publicBlobService.exposePublicBlob(
        {
          privateContainerName: 'private-container',
          directory: 'documents',
          blobName: 'test.pdf',
          expirationMinutes: 60,
          includeBase64: false,
        },
        false,
      );

      expect(result).toEqual({
        sasToken: 'public-sas-token',
        sasUrl:
          'https://cdn.example.com/public-container/documents/test.pdf?sv=...',
        permissions: 'r',
        expiresOn: expect.any(Date),
        contentType: 'application/pdf',
        containerName: 'private-container',
        blobName: 'test.pdf',
        fullPath: 'documents/test.pdf',
        size: 17,
        requestId: '123e4567-e89b-12d3-a456-426614174000',
      });

      expect(mockBlockBlobClient.exists).toHaveBeenCalled();
      expect(mockAppendBlobClient.exists).toHaveBeenCalled();

      expect(privateBlobService.downloadBlob).toHaveBeenCalledWith(
        'private-container',
        'documents',
        'test.pdf',
      );

      expect(mockBlockBlobClient.upload).toHaveBeenCalledWith(
        mockDownloadResult.data,
        mockDownloadResult.data.length,
        expect.objectContaining({
          blobHTTPHeaders: {
            blobContentType: 'application/pdf',
          },
          metadata: expect.objectContaining({
            sourceContainer: 'private-container',
            sourceBlob: 'documents/test.pdf',
            exposeMethod: 'download_upload',
            recreated: 'true',
          }),
        }),
      );
    });

    it('should cleanup existing destination blob before upload', async () => {
      const mockDownloadResult = {
        data: Buffer.from('test content'),
        contentType: 'text/csv',
        containerName: 'private-container',
        blobName: 'report.csv',
        fullPath: 'data/report.csv',
        requestId: 'download-request-id',
      };

      const mockPublicSasData = {
        sasToken: 'public-sas-token',
        sasUrl:
          'https://publicaccount.blob.core.windows.net/public-container/data/report.csv?sv=...',
        permissions: 'r',
        expiresOn: new Date(Date.now() + 60 * 60 * 1000),
      };

      const mockBlockBlobClient = {
        upload: jest.fn().mockResolvedValue({}),
        exists: jest
          .fn()
          .mockResolvedValueOnce(true)
          .mockResolvedValueOnce(false),
        deleteIfExists: jest.fn().mockResolvedValue({ succeeded: true }),
        getProperties: jest.fn().mockResolvedValue({
          contentType: 'text/csv',
          contentLength: 12,
        }),
        setMetadata: jest.fn().mockResolvedValue({}),
        setHTTPHeaders: jest.fn().mockResolvedValue({}),
      };

      const mockAppendBlobClient = {
        exists: jest.fn().mockResolvedValue(false),
        deleteIfExists: jest.fn().mockResolvedValue({ succeeded: true }),
      };

      const mockContainerClient = {
        getBlockBlobClient: jest.fn().mockReturnValue(mockBlockBlobClient),
        getAppendBlobClient: jest.fn().mockReturnValue(mockAppendBlobClient),
      };

      const mockBlobServiceClient = {
        getContainerClient: jest.fn().mockReturnValue(mockContainerClient),
      };

      (privateBlobService.downloadBlob as jest.Mock).mockResolvedValue(
        mockDownloadResult,
      );
      (
        sasService.generateSasTokenWithCustomConnection as jest.Mock
      ).mockResolvedValue(mockPublicSasData);
      (
        storageBlob.BlobServiceClient.fromConnectionString as jest.Mock
      ).mockReturnValue(mockBlobServiceClient);

      const result = await publicBlobService.exposePublicBlob(
        {
          privateContainerName: 'private-container',
          directory: 'data',
          blobName: 'report.csv',
          expirationMinutes: 60,
          includeBase64: false,
        },
        false,
      );

      expect(mockBlockBlobClient.exists).toHaveBeenCalledTimes(2);
      expect(mockBlockBlobClient.deleteIfExists).toHaveBeenCalledTimes(1);

      expect(result).toEqual(
        expect.objectContaining({
          sasToken: 'public-sas-token',
          contentType: 'text/csv',
          blobName: 'report.csv',
          size: 12,
        }),
      );
    });

    it('should expose blob using direct copy method successfully', async () => {
      const mockSourceSasData = {
        sasUrl:
          'https://privateaccount.blob.core.windows.net/private-container/documents/test.pdf?sv=source-sas',
        sasToken: 'source-sas-token',
        permissions: 'r',
        expiresOn: new Date(),
      };

      const mockPublicSasData = {
        sasToken: 'public-sas-token',
        sasUrl:
          'https://publicaccount.blob.core.windows.net/public-container/documents/test.pdf?sv=...',
        permissions: 'r',
        expiresOn: new Date(Date.now() + 60 * 60 * 1000),
      };

      const mockSourceBlockBlobClient = {
        exists: jest.fn().mockResolvedValue(true),
        getProperties: jest.fn().mockResolvedValue({
          contentType: 'application/pdf',
          contentLength: 1024,
          contentEncoding: null,
          contentLanguage: null,
          contentDisposition: null,
          cacheControl: null,
        }),
        downloadToBuffer: jest
          .fn()
          .mockResolvedValue(Buffer.from('test content')),
      };

      const mockDestinationBlockBlobClient = {
        exists: jest.fn().mockResolvedValue(false),
        deleteIfExists: jest.fn().mockResolvedValue({ succeeded: true }),
        syncCopyFromURL: jest.fn().mockResolvedValue({ copyStatus: 'success' }),
        setMetadata: jest.fn().mockResolvedValue({}),
        setHTTPHeaders: jest.fn().mockResolvedValue({}),
      };

      const mockAppendBlobClient = {
        exists: jest.fn().mockResolvedValue(false),
        deleteIfExists: jest.fn().mockResolvedValue({ succeeded: true }),
      };

      const mockContainerClient = {
        getBlockBlobClient: jest
          .fn()
          .mockReturnValue(mockDestinationBlockBlobClient),
        getAppendBlobClient: jest.fn().mockReturnValue(mockAppendBlobClient),
      };

      const mockBlobServiceClient = {
        getContainerClient: jest.fn().mockReturnValue(mockContainerClient),
      };

      (
        sasService.generateSasTokenWithCustomConnection as jest.Mock
      ).mockResolvedValueOnce(mockPublicSasData);

      (sasService as any).generateSasTokenWithParams = jest
        .fn()
        .mockResolvedValue(mockSourceSasData);

      (storageBlob.BlockBlobClient as jest.Mock).mockImplementation(
        (url: string) => {
          if (url.includes('source-sas')) {
            return mockSourceBlockBlobClient;
          }
          return mockDestinationBlockBlobClient;
        },
      );

      (
        storageBlob.BlobServiceClient.fromConnectionString as jest.Mock
      ).mockReturnValue(mockBlobServiceClient);

      const result = await publicBlobService.exposePublicBlob(
        {
          privateContainerName: 'private-container',
          directory: 'documents',
          blobName: 'test.pdf',
          expirationMinutes: 60,
          includeBase64: true,
        },
        true,
      );

      expect(mockSourceBlockBlobClient.exists).toHaveBeenCalled();
      expect(
        mockDestinationBlockBlobClient.syncCopyFromURL,
      ).toHaveBeenCalledWith(mockSourceSasData.sasUrl);

      expect(result.fileBase64).toBeDefined();
      expect(result.size).toBe(1024);
      expect(result.contentType).toBe('application/pdf');
    });

    it('should throw error when public connection string is missing', async () => {
      (configService.get as jest.Mock).mockImplementation((key: string) => {
        if (key === 'azure.publicConnectionString') return '';
        return 'public-container';
      });

      await expect(
        publicBlobService.exposePublicBlob(
          {
            privateContainerName: 'private-container',
            directory: 'documents',
            blobName: 'test.pdf',
            expirationMinutes: 60,
            includeBase64: false,
          },
          false,
        ),
      ).rejects.toThrow('Bad Request Exception');
    });

    it('should handle InvalidBlobType error gracefully', async () => {
      const mockError = {
        code: 'InvalidBlobType',
        statusCode: 409,
        message: 'The blob type is invalid for this operation',
      };

      (privateBlobService.downloadBlob as jest.Mock).mockRejectedValue(
        mockError,
      );

      await expect(
        publicBlobService.exposePublicBlob(
          {
            privateContainerName: 'private-container',
            directory: 'documents',
            blobName: 'test.pdf',
            expirationMinutes: 60,
            includeBase64: false,
          },
          false,
        ),
      ).rejects.toThrow('Error al exponer archivo público');
    });
  });

  describe('listPublicBlobs', () => {
    it('should list public blobs successfully', async () => {
      const mockSasData = {
        sasToken: 'mock-sas-token',
        sasUrl:
          'https://publicaccount.blob.core.windows.net/public-container?mock-sas-token',
      };

      const mockBlobs = [{ name: 'file1.jpg' }, { name: 'file2.pdf' }];

      const mockContainerClient = {
        listBlobsFlat: jest.fn().mockImplementation(function* () {
          yield* mockBlobs;
        }),
      };

      (
        sasService.generateSasTokenWithCustomConnection as jest.Mock
      ).mockResolvedValue(mockSasData);
      (storageBlob.ContainerClient as unknown as jest.Mock).mockImplementation(
        () => mockContainerClient,
      );

      const result = await publicBlobService.listPublicBlobs();

      expect(result).toMatchObject({
        blobs: [
          expect.objectContaining({
            name: 'file1.jpg',
            fileName: 'file1.jpg',
            fileExtension: '.jpg',
          }),
          expect.objectContaining({
            name: 'file2.pdf',
            fileName: 'file2.pdf',
            fileExtension: '.pdf',
          }),
        ],
        containerName: 'public-container',
        requestId: '123e4567-e89b-12d3-a456-426614174000',
      });
    });

    it('should throw error when public connection string is missing', async () => {
      (configService.get as jest.Mock).mockImplementation((key: string) => {
        if (key === 'azure.publicConnectionString') return '';
        return 'public-container';
      });

      await expect(publicBlobService.listPublicBlobs()).rejects.toThrow(
        'Bad Request Exception',
      );
    });
  });
});
