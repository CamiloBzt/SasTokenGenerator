import * as storageBlob from '@azure/storage-blob';
import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@src/shared/exceptions/bad-request.exception';
import { BusinessErrorException } from '@src/shared/exceptions/business-error.exception';
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
    const mockContainerClient = {};

    (storageBlob.BlobServiceClient as unknown as jest.Mock).mockImplementation(
      () => mockBlobServiceClient,
    );

    (storageBlob.ContainerClient as unknown as jest.Mock).mockImplementation(
      () => mockContainerClient,
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

  // Test mínimo para uploadBlob - solo path exitoso
  describe('uploadBlob', () => {
    it('should upload a file successfully', async () => {
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

      const result = await blobStorageService.uploadBlob(
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
    });

    // Test para cubrir validación de archivo faltante
    it('should throw error when file is missing', async () => {
      await expect(
        blobStorageService.uploadBlob(
          'uploads',
          undefined,
          'test.pdf',
          null as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    // Test para cubrir manejo de errores
    it('should handle upload errors', async () => {
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

      const mockSasData = {
        sasUrl:
          'https://teststorageaccount.blob.core.windows.net/uploads/test.pdf?sv=...',
      };

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
        blobStorageService.uploadBlob(
          'uploads',
          undefined,
          'test.pdf',
          mockFile,
        ),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  // Test mínimo para uploadBlobBase64 - ya existe, solo agregar cobertura faltante
  describe('uploadBlobBase64', () => {
    it('should upload Base64 successfully', async () => {
      const validBase64 = 'dGVzdA=='; // 'test' en base64
      const validMimeType = 'text/plain';

      const mockSasData = {
        sasUrl:
          'https://teststorageaccount.blob.core.windows.net/uploads/test.txt?sv=...',
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
        'test.txt',
        validBase64,
        validMimeType,
      );

      expect(result.blobUrl).toBe(
        'https://teststorageaccount.blob.core.windows.net/uploads/test.txt',
      );
    });
  });

  // Test mínimo para downloadBlob
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

      const result = await blobStorageService.downloadBlob(
        'uploads',
        undefined,
        'test.pdf',
      );

      expect(result.data).toBe(mockBuffer);
      expect(result.contentType).toBe('application/pdf');
    });

    // Test para cubrir manejo de errores
    it('should handle download errors', async () => {
      const mockSasData = {
        sasUrl:
          'https://teststorageaccount.blob.core.windows.net/uploads/test.pdf?sv=...',
      };

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
        blobStorageService.downloadBlob('uploads', undefined, 'test.pdf'),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  // Test mínimo para downloadBlobBase64 - ya existe, mantener uno básico
  describe('downloadBlobBase64', () => {
    it('should download blob as Base64 successfully', async () => {
      const mockSasData = {
        sasUrl:
          'https://teststorageaccount.blob.core.windows.net/uploads/test.txt?sv=...',
      };

      const mockBuffer = Buffer.from('test content');
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

      expect(result.fileBase64).toBe(mockBuffer.toString('base64'));
      expect(result.size).toBe(mockBuffer.length);
    });
  });

  // Test mínimo para deleteBlob
  describe('deleteBlob', () => {
    it('should delete blob successfully', async () => {
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

      expect(result.containerName).toBe('uploads');
      expect(result.blobName).toBe('test.pdf');
    });

    // Test para cubrir caso cuando blob no existe
    it('should handle blob not found', async () => {
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
        blobStorageService.deleteBlob('uploads', undefined, 'test.pdf'),
      ).rejects.toThrow(BusinessErrorException);
    });

    // Test para cubrir manejo de errores
    it('should handle delete errors', async () => {
      const mockSasData = {
        sasUrl:
          'https://teststorageaccount.blob.core.windows.net/uploads/test.pdf?sv=...',
      };

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
        blobStorageService.deleteBlob('uploads', undefined, 'test.pdf'),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  // Test mínimo para listBlobs
  describe('listBlobs', () => {
    it('should list blobs successfully', async () => {
      const mockSasData = {
        sasToken: 'sv=...',
      };

      const mockBlobs = [{ name: 'file1.pdf' }, { name: 'file2.txt' }];

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

      const result = await blobStorageService.listBlobs('uploads');

      expect(result.blobs).toEqual(['file1.pdf', 'file2.txt']);
      expect(result.containerName).toBe('uploads');
    });
  });

  // Test mínimo para listBlobsInDirectory
  describe('listBlobsInDirectory', () => {
    it('should list blobs in directory successfully', async () => {
      const mockSasData = {
        sasToken: 'sv=...',
      };

      const mockBlobs = [{ name: 'docs/file1.pdf' }];

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

      const result = await blobStorageService.listBlobsInDirectory(
        'uploads',
        'docs',
      );

      expect(result.blobs).toEqual(['docs/file1.pdf']);
      expect(result.directory).toBe('docs');
    });

    // Test para cubrir path sin directorio
    it('should list all blobs when no directory specified', async () => {
      const mockSasData = {
        sasToken: 'sv=...',
      };

      const mockBlobs = [{ name: 'file1.pdf' }];

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

      const result = await blobStorageService.listBlobsInDirectory('uploads');

      expect(result.directory).toBeUndefined();
    });

    // Test para cubrir manejo de errores
    it('should handle listing errors', async () => {
      const mockSasData = {
        sasToken: 'sv=...',
      };

      const mockContainerClient = {
        listBlobsFlat: jest.fn().mockImplementation(function* () {
          throw new Error('Network error');
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
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  // Test para cubrir buildFullBlobPath con directorio
  describe('buildFullBlobPath coverage', () => {
    it('should handle directory with trailing slash', async () => {
      const validBase64 = 'dGVzdA==';
      const mockSasData = {
        sasUrl:
          'https://test.blob.core.windows.net/container/docs/file.txt?sv=...',
      };
      const mockBlockBlobClient = { upload: jest.fn().mockResolvedValue({}) };

      (sasService.generateSasTokenWithParams as jest.Mock).mockResolvedValue(
        mockSasData,
      );
      (storageBlob.BlockBlobClient as unknown as jest.Mock).mockImplementation(
        () => mockBlockBlobClient,
      );

      const result = await blobStorageService.uploadBlobBase64(
        'container',
        'docs/',
        'file.txt',
        validBase64,
        'text/plain',
      );

      expect(result.fullPath).toBe('docs/file.txt');
    });
  });

  // Test para cubrir inicialización del servicio
  describe('Service initialization', () => {
    it('should initialize with connection string', () => {
      const mockConfigService = {
        get: jest.fn((key: string) => {
          if (key === 'azure.connectionString')
            return 'DefaultEndpointsProtocol=https;...';
          return undefined;
        }),
      };

      const fromConnectionStringSpy = jest
        .spyOn(storageBlob.BlobServiceClient, 'fromConnectionString')
        .mockReturnValue({} as any);

      expect(() => {
        new BlobStorageService(mockConfigService as any, sasService as any);
      }).not.toThrow();

      fromConnectionStringSpy.mockRestore();
    });

    it('should initialize with account name only', () => {
      const mockConfigService = {
        get: jest.fn((key: string) => {
          if (key === 'azure.storageAccountName') return 'testaccount';
          return undefined;
        }),
      };

      const constructorSpy = jest
        .spyOn(storageBlob, 'BlobServiceClient')
        .mockImplementation(() => ({}) as any);

      expect(() => {
        new BlobStorageService(mockConfigService as any, sasService as any);
      }).not.toThrow();

      constructorSpy.mockRestore();
    });

    it('should throw error when no config available', () => {
      const mockConfigService = {
        get: jest.fn(() => undefined),
      };

      expect(() => {
        new BlobStorageService(mockConfigService as any, sasService as any);
      }).toThrow(BadRequestException);
    });
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

      const result = await blobStorageService.moveBlob(
        'uploads',
        'temporal/file.pdf',
        'documentos/file.pdf',
      );

      expect(result.message).toBe('Blob moved successfully');
      expect(result.containerName).toBe('uploads');
      expect(result.sourcePath).toBe('temporal/file.pdf');
      expect(result.destinationPath).toBe('documentos/file.pdf');
      expect(result.requestId).toBe('123e4567-e89b-12d3-a456-426614174000');

      // Verificar que se llamaron los métodos esperados
      expect(mockBlockBlobClient.exists).toHaveBeenCalled();
      expect(mockBlockBlobClient.getProperties).toHaveBeenCalled();
      expect(mockBlockBlobClient.syncCopyFromURL).toHaveBeenCalled();
      expect(mockBlockBlobClient.setHTTPHeaders).toHaveBeenCalled();
      expect(mockBlockBlobClient.setMetadata).toHaveBeenCalled();
      expect(mockBlockBlobClient.deleteIfExists).toHaveBeenCalled();
    });

    it('should throw error when source and destination are the same', async () => {
      await expect(
        blobStorageService.moveBlob('uploads', 'file.pdf', 'file.pdf'),
      ).rejects.toThrow(BadRequestException);

      // No debería llamar al sasService si las rutas son iguales
      expect(sasService.generateSasTokenWithParams).not.toHaveBeenCalled();
    });

    it('should throw error when source blob does not exist', async () => {
      const mockSasData = {
        sasUrl:
          'https://teststorageaccount.blob.core.windows.net/uploads/test.pdf?sv=...',
      };

      const mockBlockBlobClient = {
        exists: jest.fn().mockResolvedValue(false), // Fuente no existe
      };

      (sasService.generateSasTokenWithParams as jest.Mock).mockResolvedValue(
        mockSasData,
      );
      (storageBlob.BlockBlobClient as unknown as jest.Mock).mockImplementation(
        () => mockBlockBlobClient,
      );

      await expect(
        blobStorageService.moveBlob('uploads', 'nonexistent.pdf', 'dest.pdf'),
      ).rejects.toThrow(BusinessErrorException);

      expect(mockBlockBlobClient.exists).toHaveBeenCalled();
    });

    it('should throw error when copy operation fails', async () => {
      const mockSasData = {
        sasUrl:
          'https://teststorageaccount.blob.core.windows.net/uploads/test.pdf?sv=...',
      };

      const mockBlockBlobClient = {
        exists: jest.fn().mockResolvedValue(true),
        getProperties: jest.fn().mockResolvedValue({
          contentType: 'application/pdf',
          metadata: {},
        }),
        syncCopyFromURL: jest.fn().mockResolvedValue({ copyStatus: 'failed' }), // Copia falló
      };

      (sasService.generateSasTokenWithParams as jest.Mock).mockResolvedValue(
        mockSasData,
      );
      (storageBlob.BlockBlobClient as unknown as jest.Mock).mockImplementation(
        () => mockBlockBlobClient,
      );

      await expect(
        blobStorageService.moveBlob('uploads', 'source.pdf', 'dest.pdf'),
      ).rejects.toThrow(InternalServerErrorException);

      expect(mockBlockBlobClient.syncCopyFromURL).toHaveBeenCalled();
    });

    it('should handle metadata preservation errors gracefully', async () => {
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
        setHTTPHeaders: jest
          .fn()
          .mockRejectedValue(new Error('Metadata error')),
        setMetadata: jest.fn().mockRejectedValue(new Error('Metadata error')),
        deleteIfExists: jest.fn().mockResolvedValue({ succeeded: true }),
      };

      (sasService.generateSasTokenWithParams as jest.Mock).mockResolvedValue(
        mockSasData,
      );
      (storageBlob.BlockBlobClient as unknown as jest.Mock).mockImplementation(
        () => mockBlockBlobClient,
      );

      // Debe completar exitosamente a pesar del error en metadatos
      const result = await blobStorageService.moveBlob(
        'uploads',
        'source.pdf',
        'dest.pdf',
      );

      expect(result.message).toBe('Blob moved successfully');
      expect(mockBlockBlobClient.setHTTPHeaders).toHaveBeenCalled();
      expect(mockBlockBlobClient.deleteIfExists).toHaveBeenCalled();
    });

    it('should handle source deletion failure gracefully', async () => {
      const mockSasData = {
        sasUrl:
          'https://teststorageaccount.blob.core.windows.net/uploads/test.pdf?sv=...',
      };

      const mockBlockBlobClient = {
        exists: jest.fn().mockResolvedValue(true),
        getProperties: jest.fn().mockResolvedValue({
          contentType: 'application/pdf',
          metadata: {},
        }),
        syncCopyFromURL: jest.fn().mockResolvedValue({ copyStatus: 'success' }),
        setHTTPHeaders: jest.fn().mockResolvedValue({}),
        setMetadata: jest.fn().mockResolvedValue({}),
        deleteIfExists: jest.fn().mockResolvedValue({ succeeded: false }), // Eliminación falló
      };

      (sasService.generateSasTokenWithParams as jest.Mock).mockResolvedValue(
        mockSasData,
      );
      (storageBlob.BlockBlobClient as unknown as jest.Mock).mockImplementation(
        () => mockBlockBlobClient,
      );

      // Debe completar exitosamente a pesar del error en eliminación
      const result = await blobStorageService.moveBlob(
        'uploads',
        'source.pdf',
        'dest.pdf',
      );

      expect(result.message).toBe('Blob moved successfully');
      expect(mockBlockBlobClient.deleteIfExists).toHaveBeenCalled();
    });

    it('should handle Azure permission errors', async () => {
      const mockSasData = {
        sasUrl:
          'https://teststorageaccount.blob.core.windows.net/uploads/test.pdf?sv=...',
      };

      const permissionError = new Error('Permission denied');
      (permissionError as any).statusCode = 403;

      const mockBlockBlobClient = {
        exists: jest.fn().mockResolvedValue(true),
        getProperties: jest.fn().mockResolvedValue({
          contentType: 'application/pdf',
          metadata: {},
        }),
        syncCopyFromURL: jest.fn().mockRejectedValue(permissionError),
      };

      (sasService.generateSasTokenWithParams as jest.Mock).mockResolvedValue(
        mockSasData,
      );
      (storageBlob.BlockBlobClient as unknown as jest.Mock).mockImplementation(
        () => mockBlockBlobClient,
      );

      await expect(
        blobStorageService.moveBlob('uploads', 'source.pdf', 'dest.pdf'),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('should handle network errors during move operation', async () => {
      const mockSasData = {
        sasUrl:
          'https://teststorageaccount.blob.core.windows.net/uploads/test.pdf?sv=...',
      };

      const networkError = new Error('Network timeout');

      const mockBlockBlobClient = {
        exists: jest.fn().mockRejectedValue(networkError),
      };

      (sasService.generateSasTokenWithParams as jest.Mock).mockResolvedValue(
        mockSasData,
      );
      (storageBlob.BlockBlobClient as unknown as jest.Mock).mockImplementation(
        () => mockBlockBlobClient,
      );

      await expect(
        blobStorageService.moveBlob('uploads', 'source.pdf', 'dest.pdf'),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('should handle move with complex directory paths', async () => {
      const mockSasData = {
        sasUrl:
          'https://teststorageaccount.blob.core.windows.net/uploads/deep/nested/file.pdf?sv=...',
      };

      const mockBlockBlobClient = {
        exists: jest.fn().mockResolvedValue(true),
        getProperties: jest.fn().mockResolvedValue({
          contentType: 'application/pdf',
          metadata: { category: 'important' },
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

      const result = await blobStorageService.moveBlob(
        'uploads',
        'documentos/2024/enero/archivo-temporal.pdf',
        'archivos/definitivos/2025/archivo-final.pdf',
      );

      expect(result.message).toBe('Blob moved successfully');
      expect(result.sourcePath).toBe(
        'documentos/2024/enero/archivo-temporal.pdf',
      );
      expect(result.destinationPath).toBe(
        'archivos/definitivos/2025/archivo-final.pdf',
      );

      // Verificar que se generaron SAS tokens para las rutas correctas
      expect(sasService.generateSasTokenWithParams).toHaveBeenCalledWith(
        'uploads',
        'documentos/2024/enero/archivo-temporal.pdf',
        expect.any(Array),
        30,
      );
      expect(sasService.generateSasTokenWithParams).toHaveBeenCalledWith(
        'uploads',
        'archivos/definitivos/2025/archivo-final.pdf',
        expect.any(Array),
        30,
      );
    });

    it('should preserve all metadata properties correctly', async () => {
      const mockSasData = {
        sasUrl:
          'https://teststorageaccount.blob.core.windows.net/uploads/test.pdf?sv=...',
      };

      const sourceProperties = {
        contentType: 'application/pdf',
        contentEncoding: 'gzip',
        contentLanguage: 'en-US',
        contentDisposition: 'attachment; filename="test.pdf"',
        cacheControl: 'max-age=3600',
        metadata: {
          author: 'John Doe',
          department: 'Finance',
          classification: 'confidential',
        },
      };

      const mockBlockBlobClient = {
        exists: jest.fn().mockResolvedValue(true),
        getProperties: jest.fn().mockResolvedValue(sourceProperties),
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

      await blobStorageService.moveBlob('uploads', 'source.pdf', 'dest.pdf');

      // Verificar que se preservaron las cabeceras HTTP
      expect(mockBlockBlobClient.setHTTPHeaders).toHaveBeenCalledWith({
        blobContentType: 'application/pdf',
        blobContentEncoding: 'gzip',
        blobContentLanguage: 'en-US',
        blobContentDisposition: 'attachment; filename="test.pdf"',
        blobCacheControl: 'max-age=3600',
      });

      // Verificar que se preservaron los metadatos
      expect(mockBlockBlobClient.setMetadata).toHaveBeenCalledWith({
        author: 'John Doe',
        department: 'Finance',
        classification: 'confidential',
      });
    });
  });
});
