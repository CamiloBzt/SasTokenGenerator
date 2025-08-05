import { InternalServerErrorException } from '@nestjs/common';
import { AppendBlobWriter } from '@src/sas/services/blob-logging/writers/append-blob-writer';
import { SasService } from '@src/sas/services/sas.service';
import { LogFileType } from '@src/shared/dto/blob-logging.dto';
import { SasPermission } from '@src/shared/enums/sas-permission.enum';
import { LogFileConfig } from '@src/shared/interfaces/services/blob-logging/blob-logging.interface';

const mockAppendBlobClient = {
  exists: jest.fn(),
  create: jest.fn(),
  appendBlock: jest.fn(),
  getProperties: jest.fn(),
  downloadToBuffer: jest.fn(),
};

jest.mock('@azure/storage-blob', () => ({
  AppendBlobClient: jest.fn().mockImplementation(() => mockAppendBlobClient),
  AnonymousCredential: jest.fn(),
}));

describe('AppendBlobWriter', () => {
  let writer: AppendBlobWriter;
  let mockSasService: jest.Mocked<SasService>;
  let config: LogFileConfig;

  beforeEach(() => {
    jest.clearAllMocks();

    mockSasService = {
      generateSasTokenWithParams: jest.fn(),
    } as any;

    mockSasService.generateSasTokenWithParams.mockResolvedValue({
      containerName: 'test-container',
      sasUrl: 'https://test.blob.core.windows.net/container/file.log?sas=token',
      sasToken: 'mock-sas-token',
      permissions: 'rwac',
      expiresOn: new Date('2024-12-31T23:59:59Z'),
      requestId: 'mock-request-id',
    });

    config = {
      containerName: 'test-logs',
      directory: 'test-dir',
      maxFileSize: 100,
      rotateDaily: true,
      fileType: LogFileType.LOG,
    };

    writer = new AppendBlobWriter(mockSasService, LogFileType.LOG);

    mockAppendBlobClient.exists.mockResolvedValue(false);
    mockAppendBlobClient.create.mockResolvedValue(undefined);
    mockAppendBlobClient.appendBlock.mockResolvedValue(undefined);
    mockAppendBlobClient.getProperties.mockResolvedValue({
      contentLength: 1024,
      lastModified: new Date('2024-08-05T10:00:00Z'),
      metadata: { createdAt: '2024-08-05T09:00:00Z' },
    });
    mockAppendBlobClient.downloadToBuffer.mockResolvedValue(
      Buffer.from('test log content'),
    );
  });

  describe('initialize', () => {
    it('should initialize successfully with new blob', async () => {
      mockAppendBlobClient.exists.mockResolvedValue(false);

      await writer.initialize('test-file.log', config);

      expect(mockSasService.generateSasTokenWithParams).toHaveBeenCalledWith(
        'test-logs',
        'test-dir/test-file.log',
        [
          SasPermission.READ,
          SasPermission.WRITE,
          SasPermission.CREATE,
          SasPermission.ADD,
        ],
        60,
      );

      expect(mockAppendBlobClient.create).toHaveBeenCalledWith({
        blobHTTPHeaders: {
          blobContentType: 'text/plain; charset=utf-8',
        },
        metadata: {
          createdBy: 'LoggingService',
          createdAt: expect.any(String),
          logType: 'application-log',
          fileType: LogFileType.LOG,
          serviceVersion: '2.0',
        },
      });
    });

    it('should initialize successfully with existing blob', async () => {
      mockAppendBlobClient.exists.mockResolvedValue(true);

      await writer.initialize('existing-file.log', config);

      expect(mockAppendBlobClient.create).not.toHaveBeenCalled();
    });

    it('should handle directory with trailing slash', async () => {
      const configWithTrailingSlash = { ...config, directory: 'test-dir/' };
      mockAppendBlobClient.exists.mockResolvedValue(false);

      await writer.initialize('test-file.log', configWithTrailingSlash);

      expect(mockSasService.generateSasTokenWithParams).toHaveBeenCalledWith(
        'test-logs',
        'test-dir/test-file.log',
        expect.any(Array),
        60,
      );
    });

    it('should use default container and directory when not provided', async () => {
      const minimalConfig: LogFileConfig = {};
      mockAppendBlobClient.exists.mockResolvedValue(false);

      await writer.initialize('test-file.log', minimalConfig);

      expect(mockSasService.generateSasTokenWithParams).toHaveBeenCalledWith(
        'logs',
        'application/test-file.log',
        expect.any(Array),
        60,
      );
    });

    it('should set correct content type for CSV files', async () => {
      const csvWriter = new AppendBlobWriter(mockSasService, LogFileType.CSV);
      mockAppendBlobClient.exists.mockResolvedValue(false);

      await csvWriter.initialize('test-file.csv', config);

      expect(mockAppendBlobClient.create).toHaveBeenCalledWith({
        blobHTTPHeaders: {
          blobContentType: 'text/csv; charset=utf-8',
        },
        metadata: expect.any(Object),
      });
    });

    it('should throw error when container does not exist', async () => {
      const error = new Error('Container not found');
      (error as any).statusCode = 404;
      mockSasService.generateSasTokenWithParams.mockRejectedValue(error);

      await expect(writer.initialize('test-file.log', config)).rejects.toThrow(
        InternalServerErrorException,
      );
      await expect(writer.initialize('test-file.log', config)).rejects.toThrow(
        "Container 'test-logs' does not exist",
      );
    });

    it('should throw error for other initialization errors', async () => {
      const error = new Error('Network error');
      mockSasService.generateSasTokenWithParams.mockRejectedValue(error);

      await expect(writer.initialize('test-file.log', config)).rejects.toThrow(
        InternalServerErrorException,
      );
      await expect(writer.initialize('test-file.log', config)).rejects.toThrow(
        'Error accessing log file: Network error',
      );
    });
  });

  describe('writeEntry', () => {
    beforeEach(async () => {
      mockAppendBlobClient.exists.mockResolvedValue(true);
      await writer.initialize('test-file.log', config);
    });

    it('should write single entry successfully', async () => {
      const content = 'Test log entry\n';

      await writer.writeEntry(content);

      expect(mockAppendBlobClient.appendBlock).toHaveBeenCalledWith(
        Buffer.from(content, 'utf-8'),
        Buffer.from(content, 'utf-8').length,
      );
    });

    it('should throw error for oversized entry', async () => {
      const largeContent = 'x'.repeat(4 * 1024 * 1024 + 1);

      await expect(writer.writeEntry(largeContent)).rejects.toThrow(
        'Log entry too large',
      );

      expect(mockAppendBlobClient.appendBlock).not.toHaveBeenCalled();
    });

    it('should handle empty content', async () => {
      const content = '';

      await writer.writeEntry(content);

      expect(mockAppendBlobClient.appendBlock).toHaveBeenCalledWith(
        Buffer.from(content, 'utf-8'),
        0,
      );
    });

    it('should handle content with special characters', async () => {
      const content = 'Test with émojis 🚀 and special chars: ñáéíóú\n';

      await writer.writeEntry(content);

      expect(mockAppendBlobClient.appendBlock).toHaveBeenCalledWith(
        Buffer.from(content, 'utf-8'),
        Buffer.from(content, 'utf-8').length,
      );
    });
  });

  describe('writeBulk', () => {
    beforeEach(async () => {
      mockAppendBlobClient.exists.mockResolvedValue(true);
      await writer.initialize('test-file.log', config);
    });

    it('should write bulk content successfully', async () => {
      const bulkContent = 'Entry 1\nEntry 2\nEntry 3\n';

      await writer.writeBulk(bulkContent);

      expect(mockAppendBlobClient.appendBlock).toHaveBeenCalledWith(
        Buffer.from(bulkContent, 'utf-8'),
        Buffer.from(bulkContent, 'utf-8').length,
      );
    });

    it('should write bulk content in chunks when exceeding size limit', async () => {
      const chunkSize = 4 * 1024 * 1024 - 1024;
      const largeContent = 'x'.repeat(4 * 1024 * 1024 + 1000);

      await writer.writeBulk(largeContent);

      expect(mockAppendBlobClient.appendBlock).toHaveBeenCalledTimes(2);

      const firstCall = mockAppendBlobClient.appendBlock.mock.calls[0];
      expect(firstCall[1]).toBe(chunkSize);

      const secondCall = mockAppendBlobClient.appendBlock.mock.calls[1];
      expect(secondCall[1]).toBe(largeContent.length - chunkSize);
    });

    it('should handle empty bulk content', async () => {
      const content = '';

      await writer.writeBulk(content);

      expect(mockAppendBlobClient.appendBlock).toHaveBeenCalledWith(
        Buffer.from(content, 'utf-8'),
        0,
      );
    });
  });

  describe('needsRotation', () => {
    beforeEach(async () => {
      mockAppendBlobClient.exists.mockResolvedValue(true);
      await writer.initialize('test-file.log', config);
    });

    it('should return true when file size exceeds limit', async () => {
      const largeSizeBytes = 150 * 1024 * 1024;
      mockAppendBlobClient.getProperties.mockResolvedValue({
        contentLength: largeSizeBytes,
        lastModified: new Date(),
      });

      const needsRotation = await writer.needsRotation();

      expect(needsRotation).toBe(true);
    });

    it('should return false when file size is within limit', async () => {
      const smallSizeBytes = 50 * 1024 * 1024;
      mockAppendBlobClient.getProperties.mockResolvedValue({
        contentLength: smallSizeBytes,
        lastModified: new Date(),
      });

      const needsRotation = await writer.needsRotation();

      expect(needsRotation).toBe(false);
    });

    it('should return false when getProperties fails', async () => {
      mockAppendBlobClient.getProperties.mockRejectedValue(
        new Error('Network error'),
      );

      const needsRotation = await writer.needsRotation();

      expect(needsRotation).toBe(false);
    });

    it('should use default maxFileSize when not configured', async () => {
      const configWithoutMaxSize = { ...config };
      delete configWithoutMaxSize.maxFileSize;

      await writer.initialize('test-file.log', configWithoutMaxSize);

      const largeSizeBytes = 150 * 1024 * 1024;
      mockAppendBlobClient.getProperties.mockResolvedValue({
        contentLength: largeSizeBytes,
        lastModified: new Date(),
      });

      const needsRotation = await writer.needsRotation();

      expect(needsRotation).toBe(true);
    });
  });

  describe('rotate', () => {
    beforeEach(async () => {
      mockAppendBlobClient.exists.mockResolvedValue(true);
      await writer.initialize('test-file.log', config);
    });

    it('should rotate file successfully', async () => {
      jest
        .spyOn(Date.prototype, 'toISOString')
        .mockReturnValue('2024-08-05T10-30-45-123Z');

      const rotatedFileName = await writer.rotate();

      expect(rotatedFileName).toBe(
        'test-file-rotated-2024-08-05T10-30-45-123Z.log',
      );

      expect(mockSasService.generateSasTokenWithParams).toHaveBeenCalledWith(
        'test-logs',
        'test-dir/test-file-rotated-2024-08-05T10-30-45-123Z.log',
        expect.any(Array),
        60,
      );
    });
  });

  describe('getStats', () => {
    beforeEach(async () => {
      mockAppendBlobClient.exists.mockResolvedValue(true);
      await writer.initialize('test-file.log', config);
    });

    it('should return stats for existing file', async () => {
      const mockProperties = {
        contentLength: 2048,
        lastModified: new Date('2024-08-05T10:00:00Z'),
        metadata: { createdAt: '2024-08-05T09:00:00Z' },
      };
      mockAppendBlobClient.exists.mockResolvedValue(true);
      mockAppendBlobClient.getProperties.mockResolvedValue(mockProperties);

      const stats = await writer.getStats();

      expect(stats).toEqual({
        exists: true,
        sizeBytes: 2048,
        sizeMB: 2048 / (1024 * 1024),
        lastModified: mockProperties.lastModified,
        createdAt: '2024-08-05T09:00:00Z',
      });
    });

    it('should return stats for non-existing file', async () => {
      mockAppendBlobClient.exists.mockResolvedValue(false);

      const stats = await writer.getStats();

      expect(stats).toEqual({ exists: false });
    });

    it('should handle missing properties gracefully', async () => {
      mockAppendBlobClient.exists.mockResolvedValue(true);
      mockAppendBlobClient.getProperties.mockResolvedValue({});

      const stats = await writer.getStats();

      expect(stats).toEqual({
        exists: true,
        sizeBytes: 0,
        sizeMB: 0,
        lastModified: undefined,
        createdAt: undefined,
      });
    });

    it('should return exists false when getProperties fails', async () => {
      mockAppendBlobClient.exists.mockResolvedValue(true);
      mockAppendBlobClient.getProperties.mockRejectedValue(
        new Error('Access denied'),
      );

      const stats = await writer.getStats();

      expect(stats).toEqual({ exists: false });
    });
  });

  describe('readContent', () => {
    beforeEach(async () => {
      mockAppendBlobClient.exists.mockResolvedValue(true);
      await writer.initialize('test-file.log', config);
    });

    it('should read content successfully', async () => {
      const mockContent = 'Log entry 1\nLog entry 2\nLog entry 3\n';
      mockAppendBlobClient.exists.mockResolvedValue(true);
      mockAppendBlobClient.downloadToBuffer.mockResolvedValue(
        Buffer.from(mockContent, 'utf-8'),
      );

      const content = await writer.readContent();

      expect(content).toBe(mockContent);
    });

    it('should throw error when file does not exist', async () => {
      mockAppendBlobClient.exists.mockResolvedValue(false);

      await expect(writer.readContent()).rejects.toThrow(
        InternalServerErrorException,
      );
      await expect(writer.readContent()).rejects.toThrow(
        "Log file 'test-file.log' does not exist",
      );
    });

    it('should return message for empty file', async () => {
      mockAppendBlobClient.exists.mockResolvedValue(true);
      mockAppendBlobClient.downloadToBuffer.mockResolvedValue(
        Buffer.from('', 'utf-8'),
      );

      const content = await writer.readContent();

      expect(content).toBe('Log file exists but is empty');
    });

    it('should return message for whitespace-only file', async () => {
      mockAppendBlobClient.exists.mockResolvedValue(true);
      mockAppendBlobClient.downloadToBuffer.mockResolvedValue(
        Buffer.from('   \n\t  \n  ', 'utf-8'),
      );

      const content = await writer.readContent();

      expect(content).toBe('Log file exists but is empty');
    });

    it('should throw error when download fails', async () => {
      mockAppendBlobClient.exists.mockResolvedValue(true);
      mockAppendBlobClient.downloadToBuffer.mockRejectedValue(
        new Error('Download failed'),
      );

      await expect(writer.readContent()).rejects.toThrow(
        InternalServerErrorException,
      );
      await expect(writer.readContent()).rejects.toThrow(
        'Failed to read logs: Download failed',
      );
    });

    it('should handle content with special characters', async () => {
      const specialContent = 'Content with émojis 🚀 and ñáéíóú\n';
      mockAppendBlobClient.exists.mockResolvedValue(true);
      mockAppendBlobClient.downloadToBuffer.mockResolvedValue(
        Buffer.from(specialContent, 'utf-8'),
      );

      const content = await writer.readContent();

      expect(content).toBe(specialContent);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle Azure SDK errors gracefully', async () => {
      const azureError = new Error('Azure SDK Error');
      (azureError as any).code = 'BlobNotFound';
      (azureError as any).statusCode = 404;

      mockAppendBlobClient.appendBlock.mockRejectedValue(azureError);
      mockAppendBlobClient.exists.mockResolvedValue(true);
      await writer.initialize('test-file.log', config);

      await expect(writer.writeEntry('test content')).rejects.toThrow(
        azureError,
      );
    });

    it('should handle network timeouts', async () => {
      const timeoutError = new Error('Request timeout');
      (timeoutError as any).code = 'ETIMEDOUT';

      mockAppendBlobClient.appendBlock.mockRejectedValue(timeoutError);
      mockAppendBlobClient.exists.mockResolvedValue(true);
      await writer.initialize('test-file.log', config);

      await expect(writer.writeEntry('test content')).rejects.toThrow(
        timeoutError,
      );
    });

    it('should handle concurrent write operations', async () => {
      mockAppendBlobClient.exists.mockResolvedValue(true);
      await writer.initialize('test-file.log', config);

      const writePromises = Array.from({ length: 10 }, (_, i) =>
        writer.writeEntry(`Concurrent entry ${i}\n`),
      );

      await expect(Promise.all(writePromises)).resolves.not.toThrow();
      expect(mockAppendBlobClient.appendBlock).toHaveBeenCalledTimes(10);
    });
  });
});
