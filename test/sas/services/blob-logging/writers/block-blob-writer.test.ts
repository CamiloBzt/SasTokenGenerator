import { InternalServerErrorException } from '@nestjs/common';
import { BlockBlobWriter } from '@src/sas/services/blob-logging/writers/block-blob-writer';
import { SasService } from '@src/sas/services/sas.service';
import { LogFileType } from '@src/shared/dto/blob-logging.dto';
import { SasPermission } from '@src/shared/enums/sas-permission.enum';
import { LogFileConfig } from '@src/shared/interfaces/services/blob-logging/blob-logging.interface';

const mockBlockBlobClient = {
  exists: jest.fn(),
  upload: jest.fn(),
  getProperties: jest.fn(),
  downloadToBuffer: jest.fn(),
};

jest.mock('@azure/storage-blob', () => ({
  BlockBlobClient: jest.fn().mockImplementation(() => mockBlockBlobClient),
}));

describe('BlockBlobWriter', () => {
  let writer: BlockBlobWriter;
  let mockSasService: jest.Mocked<SasService>;
  let config: LogFileConfig;

  beforeEach(() => {
    jest.clearAllMocks();

    mockSasService = {
      generateSasTokenWithParams: jest.fn(),
    } as any;

    mockSasService.generateSasTokenWithParams.mockResolvedValue({
      containerName: 'test-container',
      sasUrl:
        'https://test.blob.core.windows.net/container/file.xlsx?sas=token',
      sasToken: 'mock-sas-token',
      permissions: 'rwc',
      expiresOn: new Date('2024-12-31T23:59:59Z'),
      requestId: 'mock-request-id',
    });

    config = {
      containerName: 'test-logs',
      directory: 'test-dir',
      maxFileSize: 100,
      rotateDaily: true,
      fileType: LogFileType.XLSX,
    };

    writer = new BlockBlobWriter(mockSasService, LogFileType.XLSX);

    mockBlockBlobClient.exists.mockResolvedValue(false);
    mockBlockBlobClient.upload.mockResolvedValue(undefined);
    mockBlockBlobClient.getProperties.mockResolvedValue({
      contentLength: 1024,
      lastModified: new Date('2024-08-05T10:00:00Z'),
      metadata: { createdAt: '2024-08-05T09:00:00Z' },
    });
    mockBlockBlobClient.downloadToBuffer.mockResolvedValue(
      Buffer.from('{"data":"test"}'),
    );
  });

  describe('initialize', () => {
    it('should initialize successfully with new blob', async () => {
      mockBlockBlobClient.exists.mockResolvedValue(false);

      await writer.initialize('test-file.xlsx', config);

      expect(mockSasService.generateSasTokenWithParams).toHaveBeenCalledWith(
        'test-logs',
        'test-dir/test-file.xlsx',
        [SasPermission.READ, SasPermission.WRITE, SasPermission.CREATE],
        60,
      );

      expect(mockBlockBlobClient.exists).toHaveBeenCalled();
    });

    it('should load existing content when blob exists', async () => {
      const existingContent =
        '{"entry1":"data1"}\n{"entry2":"data2"}\n{"entry3":"data3"}';
      mockBlockBlobClient.exists.mockResolvedValue(true);
      mockBlockBlobClient.downloadToBuffer.mockResolvedValue(
        Buffer.from(existingContent, 'utf-8'),
      );

      await writer.initialize('existing-file.xlsx', config);

      expect(mockBlockBlobClient.downloadToBuffer).toHaveBeenCalled();
    });

    it('should handle directory with trailing slash', async () => {
      const configWithTrailingSlash = { ...config, directory: 'test-dir/' };
      mockBlockBlobClient.exists.mockResolvedValue(false);

      await writer.initialize('test-file.xlsx', configWithTrailingSlash);

      expect(mockSasService.generateSasTokenWithParams).toHaveBeenCalledWith(
        'test-logs',
        'test-dir/test-file.xlsx',
        expect.any(Array),
        60,
      );
    });

    it('should use default container and directory when not provided', async () => {
      const minimalConfig: LogFileConfig = {};
      mockBlockBlobClient.exists.mockResolvedValue(false);

      await writer.initialize('test-file.xlsx', minimalConfig);

      expect(mockSasService.generateSasTokenWithParams).toHaveBeenCalledWith(
        'logs',
        'application/test-file.xlsx',
        expect.any(Array),
        60,
      );
    });

    it('should handle download error during initialization', async () => {
      mockBlockBlobClient.exists.mockResolvedValue(true);
      mockBlockBlobClient.downloadToBuffer.mockRejectedValue(
        new Error('Download failed'),
      );

      await expect(
        writer.initialize('test-file.xlsx', config),
      ).resolves.not.toThrow();
    });

    it('should throw error when SAS token generation fails', async () => {
      const error = new Error('SAS generation failed');
      mockSasService.generateSasTokenWithParams.mockRejectedValue(error);

      await expect(writer.initialize('test-file.xlsx', config)).rejects.toThrow(
        InternalServerErrorException,
      );
      await expect(writer.initialize('test-file.xlsx', config)).rejects.toThrow(
        'Error accessing log file: SAS generation failed',
      );
    });
  });

  describe('writeEntry', () => {
    beforeEach(async () => {
      mockBlockBlobClient.exists.mockResolvedValue(false);
      await writer.initialize('test-file.xlsx', config);
    });

    it('should write single entry successfully', async () => {
      const content = '{"field1":"value1","field2":"value2"}';

      await writer.writeEntry(content);

      expect(mockBlockBlobClient.upload).toHaveBeenCalledWith(
        Buffer.from(content, 'utf-8'),
        Buffer.from(content, 'utf-8').length,
        {
          blobHTTPHeaders: {
            blobContentType:
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          },
          metadata: {
            createdBy: 'LoggingService',
            lastUpdated: expect.any(String),
            logType: 'application-log',
            fileType: LogFileType.XLSX,
            serviceVersion: '2.0',
            entriesCount: '1',
          },
        },
      );
    });

    it('should accumulate multiple entries before writing', async () => {
      const entry1 = '{"field1":"value1"}';
      const entry2 = '{"field1":"value2"}';

      await writer.writeEntry(entry1);
      await writer.writeEntry(entry2);

      expect(mockBlockBlobClient.upload).toHaveBeenCalledTimes(2);

      const lastCall = mockBlockBlobClient.upload.mock.calls[1];
      const uploadedContent = lastCall[0].toString('utf-8');
      expect(uploadedContent).toContain('value1');
      expect(uploadedContent).toContain('value2');
    });

    it('should set correct content type for different file types', async () => {
      const csvWriter = new BlockBlobWriter(mockSasService, LogFileType.CSV);
      await csvWriter.initialize('test-file.csv', {
        ...config,
        fileType: LogFileType.CSV,
      });

      await csvWriter.writeEntry('test,data,csv');

      expect(mockBlockBlobClient.upload).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.any(Number),
        expect.objectContaining({
          blobHTTPHeaders: {
            blobContentType: 'text/csv; charset=utf-8',
          },
        }),
      );
    });
  });
});
