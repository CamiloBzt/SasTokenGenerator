import * as storageBlob from '@azure/storage-blob';
import { Test, TestingModule } from '@nestjs/testing';
import { BlobOperationService } from '@src/sas/services/blob-storage/blob-operation.service';
import { SasService } from '@src/sas/services/sas.service';
import { BusinessErrorException } from '@src/shared/exceptions/business-error.exception';

jest.mock('@azure/storage-blob');
jest.mock('uuid', () => ({
  v4: jest.fn(() => '123e4567-e89b-12d3-a456-426614174000'),
}));

describe('BlobOperationService', () => {
  let blobOperationService: BlobOperationService;
  let sasService: Partial<SasService>;

  beforeEach(async () => {
    jest.clearAllMocks();

    sasService = {
      generateSasTokenWithParams: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BlobOperationService,
        {
          provide: SasService,
          useValue: sasService,
        },
      ],
    }).compile();

    blobOperationService =
      module.get<BlobOperationService>(BlobOperationService);
  });

  describe('moveBlob', () => {
    it('should move blob successfully', async () => {
      const mockSasData = {
        sasUrl:
          'https://teststorageaccount.blob.core.windows.net/uploads/test.pdf?sv=...',
      };

      const mockBlockBlobClient = {
        exists: jest.fn().mockResolvedValue(true),
        getProperties: jest.fn().mockResolvedValue({
          contentType: 'application/pdf',
          contentEncoding: 'gzip',
          contentLanguage: 'en-US',
          metadata: { author: 'test', version: '1.0' },
        }),
        syncCopyFromURL: jest.fn().mockResolvedValue({ copyStatus: 'success' }),
        setHTTPHeaders: jest.fn().mockResolvedValue({}),
        setMetadata: jest.fn().mockResolvedValue({}),
        deleteIfExists: jest.fn().mockResolvedValue({ succeeded: true }),
      };

      (sasService.generateSasTokenWithParams as jest.Mock).mockResolvedValue(
        mockSasData,
      );
      (storageBlob.BlockBlobClient as unknown as jest.Mock).mockImplementation(
        () => mockBlockBlobClient,
      );

      const result = await blobOperationService.moveBlob(
        'uploads',
        'temporal/file.pdf',
        'documentos/file.pdf',
      );

      expect(result.message).toBe('Blob moved successfully');
      expect(result.containerName).toBe('uploads');
      expect(result.sourcePath).toBe('temporal/file.pdf');
      expect(result.destinationPath).toBe('documentos/file.pdf');
      expect(result.requestId).toBe('123e4567-e89b-12d3-a456-426614174000');

      expect(mockBlockBlobClient.exists).toHaveBeenCalled();
      expect(mockBlockBlobClient.deleteIfExists).toHaveBeenCalled();
    });

    it('should throw error when source and destination are the same', async () => {
      await expect(
        blobOperationService.moveBlob('uploads', 'file.pdf', 'file.pdf'),
      ).rejects.toThrow('Bad Request Exception');

      expect(sasService.generateSasTokenWithParams).not.toHaveBeenCalled();
    });

    it('should throw error when source blob does not exist', async () => {
      const mockSasData = {
        sasUrl:
          'https://teststorageaccount.blob.core.windows.net/uploads/test.pdf?sv=...',
      };

      const mockBlockBlobClient = {
        exists: jest.fn().mockResolvedValue(false),
      };

      (sasService.generateSasTokenWithParams as jest.Mock).mockResolvedValue(
        mockSasData,
      );
      (storageBlob.BlockBlobClient as unknown as jest.Mock).mockImplementation(
        () => mockBlockBlobClient,
      );

      await expect(
        blobOperationService.moveBlob('uploads', 'nonexistent.pdf', 'dest.pdf'),
      ).rejects.toThrow(BusinessErrorException);

      expect(mockBlockBlobClient.exists).toHaveBeenCalled();
    });
  });

  describe('copyBlob', () => {
    it('should copy blob successfully without deleting source', async () => {
      const mockSasData = {
        sasUrl:
          'https://teststorageaccount.blob.core.windows.net/uploads/test.pdf?sv=...',
      };

      const mockBlockBlobClient = {
        exists: jest.fn().mockResolvedValue(true),
        getProperties: jest.fn().mockResolvedValue({
          contentType: 'application/pdf',
          metadata: { author: 'test' },
        }),
        syncCopyFromURL: jest.fn().mockResolvedValue({ copyStatus: 'success' }),
        setHTTPHeaders: jest.fn().mockResolvedValue({}),
        setMetadata: jest.fn().mockResolvedValue({}),
        deleteIfExists: jest.fn().mockResolvedValue({}),
      };

      (sasService.generateSasTokenWithParams as jest.Mock).mockResolvedValue(
        mockSasData,
      );
      (storageBlob.BlockBlobClient as unknown as jest.Mock).mockImplementation(
        () => mockBlockBlobClient,
      );

      const result = await blobOperationService.copyBlob(
        'uploads',
        'documentos/original.pdf',
        'backup/copia.pdf',
      );

      expect(result.message).toBe('Blob copied successfully');
      expect(result.sourcePath).toBe('documentos/original.pdf');
      expect(result.destinationPath).toBe('backup/copia.pdf');

      expect(mockBlockBlobClient.deleteIfExists).not.toHaveBeenCalled();
    });
  });
});
