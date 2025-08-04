import { Test, TestingModule } from '@nestjs/testing';
import { BlobLoggingController } from '@src/sas/controllers/blob-logging.controller';
import { BlobLoggingService } from '@src/sas/services/blob-logging/blob-logging.service';
import {
  LogFileType,
  LogLevel,
} from '../../../src/shared/dto/blob-logging.dto';

describe('BlobLoggingController', () => {
  let controller: BlobLoggingController;
  let service: BlobLoggingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BlobLoggingController],
      providers: [
        {
          provide: BlobLoggingService,
          useValue: {
            appendLog: jest.fn().mockResolvedValue(undefined),
            appendBulkLogs: jest.fn().mockResolvedValue(undefined),
            readLogs: jest.fn().mockResolvedValue('log-content'),
            getLogFileStats: jest.fn().mockResolvedValue({
              exists: true,
              fileType: LogFileType.LOG,
              sizeBytes: 1024,
              sizeMB: 0.001,
            }),
            getSupportedFormats: jest.fn().mockReturnValue([
              {
                fileType: LogFileType.LOG,
                extension: '.log',
                supportsAppend: true,
                description: 'Traditional log format',
              },
              {
                fileType: LogFileType.CSV,
                extension: '.csv',
                supportsAppend: true,
                description: 'CSV format',
              },
              {
                fileType: LogFileType.XLSX,
                extension: '.xlsx',
                supportsAppend: false,
                description: 'Excel format',
              },
            ]),
          },
        },
      ],
    }).compile();

    controller = module.get<BlobLoggingController>(BlobLoggingController);
    service = module.get<BlobLoggingService>(BlobLoggingService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('appendLog', () => {
    it('should append log and return success response', async () => {
      const dto = {
        fileName: 'test-file',
        entry: {
          level: LogLevel.INFO,
          message: 'Test message',
          metadata: { test: 'data' },
          userId: 'user123',
          requestId: 'req123',
        },
        config: {
          containerName: 'test-container',
          directory: 'test-dir',
          fileType: LogFileType.LOG,
          rotateDaily: true,
          maxFileSize: 100,
        },
      };

      const result = await controller.appendLog(dto);

      expect(service.appendLog).toHaveBeenCalledWith(
        'test-file',
        dto.entry,
        dto.config,
      );
      expect(result.status.statusCode).toBe(200);
      expect(result.status.statusDescription).toBe(
        'Operación completada con éxito.',
      );
      expect(result.data.message).toBe('Log entry added successfully');
      expect(result.data.fileName).toBe('test-file');
      expect(result.data.fileType).toBe('log');
      expect(result.data.strategy).toBe('TraditionalLogStrategy');
      expect(result.data.requestId).toBeDefined();
    });
  });

  describe('appendBulkLogs', () => {
    it('should append bulk logs and return success response', async () => {
      const dto = {
        fileName: 'test-file',
        entries: [
          {
            level: LogLevel.INFO,
            message: 'Message 1',
            userId: 'user123',
            timestamp: '2024-01-01T00:00:00.000Z',
          },
          {
            level: LogLevel.WARN,
            message: 'Message 2',
            userId: 'user123',
            timestamp: '2024-01-01T00:01:00.000Z',
          },
        ],
        config: {
          containerName: 'test-container',
          fileType: LogFileType.CSV,
        },
      };

      const result = await controller.appendBulkLogs(dto);

      expect(service.appendBulkLogs).toHaveBeenCalledWith(
        'test-file',
        [
          {
            level: LogLevel.INFO,
            message: 'Message 1',
            userId: 'user123',
            timestamp: new Date('2024-01-01T00:00:00.000Z'),
          },
          {
            level: LogLevel.WARN,
            message: 'Message 2',
            userId: 'user123',
            timestamp: new Date('2024-01-01T00:01:00.000Z'),
          },
        ],
        dto.config,
      );
      expect(result.status.statusCode).toBe(200);
      expect(result.data.message).toBe('Bulk log entries added successfully');
      expect(result.data.entriesCount).toBe(2);
      expect(result.data.fileType).toBe('csv');
      expect(result.data.strategy).toBe('CsvLogStrategy');
      expect(result.data.optimizationUsed).toBe('append_blob_chunking');
    });
  });

  describe('readLogs', () => {
    it('should read logs and return content', async () => {
      const dto = {
        fileName: 'test-file',
        config: {
          containerName: 'test-container',
          fileType: LogFileType.LOG,
        },
      };

      const result = await controller.readLogs(dto);

      expect(service.readLogs).toHaveBeenCalledWith('test-file', dto.config);
      expect(result.status.statusCode).toBe(200);
      expect(result.data.content).toBe('log-content');
      expect(result.data.fileName).toBe('test-file');
      expect(result.data.fileType).toBe('log');
      expect(result.data.contentType).toBe('text/plain');
      expect(result.data.isReadable).toBe(true);
    });

    it('should handle XLSX files differently', async () => {
      const dto = {
        fileName: 'test-file',
        config: {
          containerName: 'test-container',
          fileType: LogFileType.XLSX,
        },
      };

      const result = await controller.readLogs(dto);

      expect(result.data.fileType).toBe('xlsx');
      expect(result.data.contentType).toBe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(result.data.isReadable).toBe(false);
    });
  });

  describe('getLogStats', () => {
    it('should get log stats and return detailed information', async () => {
      const dto = {
        fileName: 'test-file',
        config: {
          containerName: 'test-container',
          fileType: LogFileType.LOG,
        },
      };

      const result = await controller.getLogStats(dto);

      expect(service.getLogFileStats).toHaveBeenCalledWith(
        'test-file',
        dto.config,
      );
      expect(result.status.statusCode).toBe(200);
      expect(result.data.exists).toBe(true);
      expect(result.data.fileType).toBe('log');
      expect(result.data.strategy).toBe('TraditionalLogStrategy');
      expect(result.data.supportsAppend).toBe(true);
      expect(result.data.sizeBytes).toBe(1024);
      expect(result.data.sizeMB).toBe(0.001);
    });
  });

  describe('getSupportedFormats', () => {
    it('should return supported formats with detailed information', async () => {
      const result = await controller.getSupportedFormats();

      expect(service.getSupportedFormats).toHaveBeenCalled();
      expect(result.status.statusCode).toBe(200);
      expect(result.data.supportedFormats).toHaveLength(3);
      expect(result.data.architecture).toBe('Strategy Pattern with Factory');
      expect(result.data.version).toBe('2.0');

      const logFormat = result.data.supportedFormats.find(
        (f) => f.fileType === 'log',
      );
      expect(logFormat.strategy).toBe('TraditionalLogStrategy');
      expect(logFormat.useCases).toContain('System logs');

      const xlsxFormat = result.data.supportedFormats.find(
        (f) => f.fileType === 'xlsx',
      );
      expect(xlsxFormat.strategy).toBe('XlsxLogStrategy');
      expect(xlsxFormat.supportsAppend).toBe(false);
    });
  });

  describe('helper methods', () => {
    it('should determine file type from name correctly', () => {
      expect(controller['determineFileTypeFromName']('file.log')).toBe('log');
      expect(controller['determineFileTypeFromName']('file.csv')).toBe('csv');
      expect(controller['determineFileTypeFromName']('file.xlsx')).toBe('xlsx');
      expect(controller['determineFileTypeFromName']('file')).toBe('log');
    });

    it('should get correct strategy names', () => {
      expect(controller['getStrategyName']('log')).toBe(
        'TraditionalLogStrategy',
      );
      expect(controller['getStrategyName']('csv')).toBe('CsvLogStrategy');
      expect(controller['getStrategyName']('xlsx')).toBe('XlsxLogStrategy');
    });

    it('should get correct optimization methods', () => {
      expect(controller['getOptimizationMethod']('log')).toBe(
        'append_blob_streaming',
      );
      expect(controller['getOptimizationMethod']('csv')).toBe(
        'append_blob_chunking',
      );
      expect(controller['getOptimizationMethod']('xlsx')).toBe(
        'block_blob_regeneration',
      );
    });

    it('should determine content readability correctly', () => {
      expect(controller['isContentReadable']('log')).toBe(true);
      expect(controller['isContentReadable']('csv')).toBe(true);
      expect(controller['isContentReadable']('xlsx')).toBe(false);
    });

    it('should determine append support correctly', () => {
      expect(controller['supportsAppend']('log')).toBe(true);
      expect(controller['supportsAppend']('csv')).toBe(true);
      expect(controller['supportsAppend']('xlsx')).toBe(false);
    });
  });
});
