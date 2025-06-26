import { Test, TestingModule } from '@nestjs/testing';
import { BlobOperationService } from '@src/sas/services/blob-storage/blob-operation.service';
import { BlobStorageService } from '@src/sas/services/blob-storage/blob-storage.service';
import { PrivateBlobService } from '@src/sas/services/blob-storage/private-blob.service';
import { PublicBlobService } from '@src/sas/services/blob-storage/public-blob.service';

jest.mock('@azure/storage-blob');
jest.mock('uuid', () => ({
  v4: jest.fn(() => '123e4567-e89b-12d3-a456-426614174000'),
}));

describe('BlobStorageService', () => {
  let blobStorageService: BlobStorageService;
  let privateBlobService: PrivateBlobService;
  let publicBlobService: PublicBlobService;
  let blobOperationService: BlobOperationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BlobStorageService,
        {
          provide: PrivateBlobService,
          useValue: {
            uploadBlob: jest.fn(),
            downloadBlob: jest.fn(),
            deleteBlob: jest.fn(),
            listBlobs: jest.fn(),
            uploadBlobBase64: jest.fn(),
            downloadBlobBase64: jest.fn(),
          },
        },
        {
          provide: PublicBlobService,
          useValue: {
            exposePublicBlob: jest.fn(),
            listPublicBlobs: jest.fn(),
          },
        },
        {
          provide: BlobOperationService,
          useValue: {
            moveBlob: jest.fn(),
            copyBlob: jest.fn(),
          },
        },
      ],
    }).compile();

    blobStorageService = module.get<BlobStorageService>(BlobStorageService);
    privateBlobService = module.get<PrivateBlobService>(PrivateBlobService);
    publicBlobService = module.get<PublicBlobService>(PublicBlobService);
    blobOperationService =
      module.get<BlobOperationService>(BlobOperationService);
  });

  describe('Private Blob Methods', () => {
    it('should delegate uploadBlob to PrivateBlobService', async () => {
      const mockFile = {} as Express.Multer.File;
      const mockResult = {
        blobUrl: 'test-url',
        containerName: 'container',
        blobName: 'file',
        fullPath: 'dir/file',
        requestId: 'test-id',
      };

      (privateBlobService.uploadBlob as jest.Mock).mockResolvedValue(
        mockResult,
      );

      const result = await blobStorageService.uploadBlob(
        'container',
        'dir',
        'file',
        mockFile,
      );

      expect(privateBlobService.uploadBlob).toHaveBeenCalledWith(
        'container',
        'dir',
        'file',
        mockFile,
      );
      expect(result).toBe(mockResult);
    });

    it('should delegate uploadBlobBase64 to PrivateBlobService', async () => {
      const mockResult = {
        blobUrl: 'test-url',
        containerName: 'container',
        blobName: 'file',
        fullPath: 'dir/file',
        requestId: 'test-id',
      };

      (privateBlobService.uploadBlobBase64 as jest.Mock).mockResolvedValue(
        mockResult,
      );

      const result = await blobStorageService.uploadBlobBase64(
        'container',
        'dir',
        'file.pdf',
        'base64content',
        'application/pdf',
      );

      expect(privateBlobService.uploadBlobBase64).toHaveBeenCalledWith(
        'container',
        'dir',
        'file.pdf',
        'base64content',
        'application/pdf',
      );
      expect(result).toBe(mockResult);
    });

    it('should delegate downloadBlob to PrivateBlobService', async () => {
      const mockResult = {
        data: Buffer.from('test'),
        contentType: 'application/pdf',
        containerName: 'container',
        blobName: 'file',
        fullPath: 'dir/file',
        requestId: 'test-id',
      };

      (privateBlobService.downloadBlob as jest.Mock).mockResolvedValue(
        mockResult,
      );

      const result = await blobStorageService.downloadBlob(
        'container',
        'dir',
        'file.pdf',
      );

      expect(privateBlobService.downloadBlob).toHaveBeenCalledWith(
        'container',
        'dir',
        'file.pdf',
      );
      expect(result).toBe(mockResult);
    });

    it('should delegate downloadBlobBase64 to PrivateBlobService', async () => {
      const mockResult = {
        fileBase64: 'base64content',
        contentType: 'application/pdf',
        containerName: 'container',
        blobName: 'file',
        fullPath: 'dir/file',
        size: 1024,
        requestId: 'test-id',
      };

      (privateBlobService.downloadBlobBase64 as jest.Mock).mockResolvedValue(
        mockResult,
      );

      const result = await blobStorageService.downloadBlobBase64(
        'container',
        'dir',
        'file.pdf',
      );

      expect(privateBlobService.downloadBlobBase64).toHaveBeenCalledWith(
        'container',
        'dir',
        'file.pdf',
      );
      expect(result).toBe(mockResult);
    });

    it('should delegate deleteBlob to PrivateBlobService', async () => {
      const mockResult = {
        containerName: 'container',
        blobName: 'file',
        fullPath: 'dir/file',
        requestId: 'test-id',
      };

      (privateBlobService.deleteBlob as jest.Mock).mockResolvedValue(
        mockResult,
      );

      const result = await blobStorageService.deleteBlob(
        'container',
        'dir',
        'file.pdf',
      );

      expect(privateBlobService.deleteBlob).toHaveBeenCalledWith(
        'container',
        'dir',
        'file.pdf',
      );
      expect(result).toBe(mockResult);
    });

    it('should delegate listBlobs to PrivateBlobService', async () => {
      const mockResult = {
        blobs: [],
        containerName: 'container',
        totalBlobs: 0,
        totalSize: 0,
        totalSizeFormatted: '0 B',
        requestId: 'test-id',
      };

      (privateBlobService.listBlobs as jest.Mock).mockResolvedValue(mockResult);

      const result = await blobStorageService.listBlobs('container', 'dir');

      expect(privateBlobService.listBlobs).toHaveBeenCalledWith(
        'container',
        'dir',
      );
      expect(result).toBe(mockResult);
    });

    it('should delegate listBlobs without directory to PrivateBlobService', async () => {
      const mockResult = {
        blobs: [],
        containerName: 'container',
        totalBlobs: 0,
        totalSize: 0,
        totalSizeFormatted: '0 B',
        requestId: 'test-id',
      };

      (privateBlobService.listBlobs as jest.Mock).mockResolvedValue(mockResult);

      const result = await blobStorageService.listBlobs('container');

      expect(privateBlobService.listBlobs).toHaveBeenCalledWith(
        'container',
        undefined,
      );
      expect(result).toBe(mockResult);
    });
  });

  describe('Blob Operation Methods', () => {
    it('should delegate moveBlob to BlobOperationService', async () => {
      const mockResult = {
        message: 'Blob moved successfully',
        containerName: 'container',
        sourcePath: 'source/file.pdf',
        destinationPath: 'dest/file.pdf',
        requestId: 'test-id',
      };

      (blobOperationService.moveBlob as jest.Mock).mockResolvedValue(
        mockResult,
      );

      const result = await blobStorageService.moveBlob(
        'container',
        'source/file.pdf',
        'dest/file.pdf',
      );

      expect(blobOperationService.moveBlob).toHaveBeenCalledWith(
        'container',
        'source/file.pdf',
        'dest/file.pdf',
      );
      expect(result).toBe(mockResult);
    });

    it('should delegate copyBlob to BlobOperationService', async () => {
      const mockResult = {
        message: 'Blob copied successfully',
        containerName: 'container',
        sourcePath: 'source/file.pdf',
        destinationPath: 'dest/file.pdf',
        requestId: 'test-id',
      };

      (blobOperationService.copyBlob as jest.Mock).mockResolvedValue(
        mockResult,
      );

      const result = await blobStorageService.copyBlob(
        'container',
        'source/file.pdf',
        'dest/file.pdf',
      );

      expect(blobOperationService.copyBlob).toHaveBeenCalledWith(
        'container',
        'source/file.pdf',
        'dest/file.pdf',
      );
      expect(result).toBe(mockResult);
    });
  });

  describe('Public Blob Methods', () => {
    it('should delegate exposePublicBlob to PublicBlobService with default useDirectCopy', async () => {
      const mockParams = {
        privateContainerName: 'private-container',
        directory: 'docs',
        blobName: 'file.pdf',
        expirationMinutes: 60,
        includeBase64: false,
      };
      const mockResult = {
        sasToken: 'token',
        sasUrl: 'public-url',
        permissions: 'r',
        expiresOn: new Date(),
        contentType: 'application/pdf',
        containerName: 'private-container',
        blobName: 'file.pdf',
        fullPath: 'docs/file.pdf',
        size: 1024,
        requestId: 'test-id',
      };

      (publicBlobService.exposePublicBlob as jest.Mock).mockResolvedValue(
        mockResult,
      );

      const result = await blobStorageService.exposePublicBlob(mockParams);

      expect(publicBlobService.exposePublicBlob).toHaveBeenCalledWith(
        mockParams,
        true,
      );
      expect(result).toBe(mockResult);
    });

    it('should delegate exposePublicBlob to PublicBlobService with custom useDirectCopy', async () => {
      const mockParams = {
        privateContainerName: 'private-container',
        directory: 'docs',
        blobName: 'file.pdf',
        expirationMinutes: 60,
        includeBase64: true,
      };
      const mockResult = {
        sasToken: 'token',
        sasUrl: 'public-url',
        permissions: 'r',
        expiresOn: new Date(),
        contentType: 'application/pdf',
        containerName: 'private-container',
        blobName: 'file.pdf',
        fullPath: 'docs/file.pdf',
        size: 1024,
        requestId: 'test-id',
        fileBase64: 'base64content',
      };

      (publicBlobService.exposePublicBlob as jest.Mock).mockResolvedValue(
        mockResult,
      );

      const result = await blobStorageService.exposePublicBlob(
        mockParams,
        false,
      );

      expect(publicBlobService.exposePublicBlob).toHaveBeenCalledWith(
        mockParams,
        false,
      );
      expect(result).toBe(mockResult);
    });

    it('should delegate listPublicBlobs to PublicBlobService with directory', async () => {
      const mockResult = {
        blobs: [],
        containerName: 'public-container',
        totalBlobs: 0,
        totalSize: 0,
        totalSizeFormatted: '0 B',
        directory: 'uploads',
        requestId: 'test-id',
      };

      (publicBlobService.listPublicBlobs as jest.Mock).mockResolvedValue(
        mockResult,
      );

      const result = await blobStorageService.listPublicBlobs('uploads');

      expect(publicBlobService.listPublicBlobs).toHaveBeenCalledWith('uploads');
      expect(result).toBe(mockResult);
    });

    it('should delegate listPublicBlobs to PublicBlobService without directory', async () => {
      const mockResult = {
        blobs: [],
        containerName: 'public-container',
        totalBlobs: 0,
        totalSize: 0,
        totalSizeFormatted: '0 B',
        requestId: 'test-id',
      };

      (publicBlobService.listPublicBlobs as jest.Mock).mockResolvedValue(
        mockResult,
      );

      const result = await blobStorageService.listPublicBlobs();

      expect(publicBlobService.listPublicBlobs).toHaveBeenCalledWith(undefined);
      expect(result).toBe(mockResult);
    });
  });

  describe('Dependency Injection', () => {
    it('should be defined and have all required services injected', () => {
      expect(blobStorageService).toBeDefined();
      expect(privateBlobService).toBeDefined();
      expect(publicBlobService).toBeDefined();
      expect(blobOperationService).toBeDefined();
    });

    it('should have privateBlobService instance', () => {
      expect(blobStorageService['privateBlobService']).toBe(privateBlobService);
    });

    it('should have publicBlobService instance', () => {
      expect(blobStorageService['publicBlobService']).toBe(publicBlobService);
    });

    it('should have blobOperationService instance', () => {
      expect(blobStorageService['blobOperationService']).toBe(
        blobOperationService,
      );
    });
  });

  describe('Error Propagation', () => {
    it('should propagate errors from PrivateBlobService.uploadBlob', async () => {
      const error = new Error('Upload failed');
      (privateBlobService.uploadBlob as jest.Mock).mockRejectedValue(error);

      await expect(
        blobStorageService.uploadBlob(
          'container',
          'dir',
          'file',
          {} as Express.Multer.File,
        ),
      ).rejects.toThrow('Upload failed');
    });

    it('should propagate errors from BlobOperationService.moveBlob', async () => {
      const error = new Error('Move failed');
      (blobOperationService.moveBlob as jest.Mock).mockRejectedValue(error);

      await expect(
        blobStorageService.moveBlob('container', 'source', 'dest'),
      ).rejects.toThrow('Move failed');
    });

    it('should propagate errors from PublicBlobService.exposePublicBlob', async () => {
      const error = new Error('Expose failed');
      (publicBlobService.exposePublicBlob as jest.Mock).mockRejectedValue(
        error,
      );

      await expect(
        blobStorageService.exposePublicBlob({} as any),
      ).rejects.toThrow('Expose failed');
    });
  });
});
