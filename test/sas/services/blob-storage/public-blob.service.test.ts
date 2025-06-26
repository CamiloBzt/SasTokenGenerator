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
      };

      const mockBlobServiceClient = {
        getContainerClient: jest.fn().mockReturnValue({
          getBlockBlobClient: jest.fn().mockReturnValue(mockBlockBlobClient),
        }),
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

      expect(privateBlobService.downloadBlob).toHaveBeenCalledWith(
        'private-container',
        'documents',
        'test.pdf',
      );
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
