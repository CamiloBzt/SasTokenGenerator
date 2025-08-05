import { Test, TestingModule } from '@nestjs/testing';
import { BlobLoggingService } from '@src/sas/services/blob-logging/blob-logging.service';
import { LogStrategyFactory } from '@src/sas/services/blob-logging/factories/log-strategy-factory';
import { LogFileType, LogLevel } from '@src/shared/dto/blob-logging.dto';
import { LogStrategy } from '@src/shared/interfaces/services/blob-logging/log-strategy.interface';

describe('BlobLoggingService', () => {
  let service: BlobLoggingService;
  let strategyFactory: LogStrategyFactory;

  const mockStrategy: jest.Mocked<LogStrategy> = {
    getFileType: jest.fn().mockReturnValue(LogFileType.LOG),
    initialize: jest.fn().mockResolvedValue(undefined),
    appendLog: jest.fn().mockResolvedValue(undefined),
    appendBulkLogs: jest.fn().mockResolvedValue(undefined),
    readLogs: jest.fn().mockResolvedValue('log-content'),
    getLogFileStats: jest.fn().mockResolvedValue({
      exists: true,
      fileType: LogFileType.LOG,
      sizeBytes: 1024,
      sizeMB: 0.001,
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BlobLoggingService,
        {
          provide: LogStrategyFactory,
          useValue: {
            createStrategy: jest.fn().mockReturnValue(mockStrategy),
            getSupportedFileTypes: jest
              .fn()
              .mockReturnValue([
                LogFileType.LOG,
                LogFileType.CSV,
                LogFileType.XLSX,
              ]),
            isFileTypeSupported: jest.fn().mockReturnValue(true),
          },
        },
      ],
    }).compile();

    service = module.get<BlobLoggingService>(BlobLoggingService);
    strategyFactory = module.get<LogStrategyFactory>(LogStrategyFactory);
  });

  afterEach(() => {
    service.clearStrategyCache();
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('appendLog', () => {
    it('should append log using appropriate strategy', async () => {
      const entry = {
        level: LogLevel.INFO,
        message: 'Test message',
        metadata: { test: 'data' },
      };

      await service.appendLog('test-file', entry, {
        containerName: 'test-container',
        fileType: LogFileType.LOG,
      });

      expect(strategyFactory.createStrategy).toHaveBeenCalledWith('test-file', {
        containerName: 'test-container',
        fileType: LogFileType.LOG,
      });
      expect(mockStrategy.initialize).toHaveBeenCalledWith('test-file', {
        containerName: 'test-container',
        fileType: LogFileType.LOG,
      });
      expect(mockStrategy.appendLog).toHaveBeenCalledWith(entry);
    });

    it('should handle errors gracefully', async () => {
      mockStrategy.appendLog.mockRejectedValueOnce(new Error('Test error'));

      await expect(
        service.appendLog('test-file', {
          level: LogLevel.ERROR,
          message: 'Error message',
        }),
      ).rejects.toThrow('Failed to append log: Test error');
    });
  });

  describe('appendBulkLogs', () => {
    it('should append bulk logs using appropriate strategy', async () => {
      const entries = [
        {
          level: LogLevel.INFO,
          message: 'Message 1',
          timestamp: new Date(),
        },
        {
          level: LogLevel.WARN,
          message: 'Message 2',
          timestamp: new Date(),
        },
      ];

      await service.appendBulkLogs('test-file', entries, {
        containerName: 'test-container',
        fileType: LogFileType.CSV,
      });

      expect(strategyFactory.createStrategy).toHaveBeenCalledWith('test-file', {
        containerName: 'test-container',
        fileType: LogFileType.CSV,
      });
      expect(mockStrategy.appendBulkLogs).toHaveBeenCalledWith(entries);
    });

    it('should handle bulk errors gracefully', async () => {
      mockStrategy.appendBulkLogs.mockRejectedValueOnce(
        new Error('Bulk error'),
      );

      await expect(
        service.appendBulkLogs('test-file', [
          { level: LogLevel.INFO, message: 'Test' },
        ]),
      ).rejects.toThrow('Failed to append bulk logs: Bulk error');
    });
  });

  describe('readLogs', () => {
    it('should read logs using appropriate strategy', async () => {
      const result = await service.readLogs('test-file', {
        containerName: 'test-container',
        fileType: LogFileType.LOG,
      });

      expect(result).toBe('log-content');
      expect(mockStrategy.readLogs).toHaveBeenCalled();
    });

    it('should handle read errors gracefully', async () => {
      mockStrategy.readLogs.mockRejectedValueOnce(new Error('Read error'));

      await expect(
        service.readLogs('test-file', { fileType: LogFileType.LOG }),
      ).rejects.toThrow('Failed to read logs: Read error');
    });
  });

  describe('getLogFileStats', () => {
    it('should get stats using appropriate strategy', async () => {
      const result = await service.getLogFileStats('test-file', {
        containerName: 'test-container',
        fileType: LogFileType.LOG,
      });

      expect(result).toEqual({
        exists: true,
        fileType: LogFileType.LOG,
        sizeBytes: 1024,
        sizeMB: 0.001,
      });
      expect(mockStrategy.getLogFileStats).toHaveBeenCalled();
    });
  });

  describe('getSupportedFormats', () => {
    it('should return supported formats with details', () => {
      const formats = service.getSupportedFormats();

      expect(formats).toHaveLength(3);
      expect(formats[0]).toEqual({
        fileType: LogFileType.LOG,
        extension: '.log',
        supportsAppend: true,
        description: 'Traditional log format with structured text entries',
      });
      expect(formats[1]).toEqual({
        fileType: LogFileType.CSV,
        extension: '.csv',
        supportsAppend: true,
        description: 'Comma-separated values format for data analysis',
      });
      expect(formats[2]).toEqual({
        fileType: LogFileType.XLSX,
        extension: '.xlsx',
        supportsAppend: false,
        description: 'Excel spreadsheet format for rich data presentation',
      });
    });
  });

  describe('validateLoggingConfig', () => {
    it('should reject invalid container name', () => {
      const result = service.validateLoggingConfig({
        containerName: 'Invalid-Container-Name',
      });

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        'Container name must be lowercase alphanumeric with hyphens',
      );
    });

    it('should reject unsafe directory path', () => {
      const result = service.validateLoggingConfig({
        directory: '../unsafe/path',
      });

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        'Directory path cannot contain ".." for security reasons',
      );
    });

    it('should reject unsupported file type', () => {
      (strategyFactory.isFileTypeSupported as jest.Mock).mockReturnValueOnce(
        false,
      );

      const result = service.validateLoggingConfig({
        fileType: 'unsupported' as LogFileType,
      });

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('File type unsupported is not supported');
    });
  });

  describe('strategy caching', () => {
    it('should cache strategies and reuse them', async () => {
      const config = {
        containerName: 'test-container',
        fileType: LogFileType.LOG,
      };

      // First call
      await service.appendLog(
        'test-file',
        {
          level: LogLevel.INFO,
          message: 'Test 1',
        },
        config,
      );

      // Second call with same config
      await service.appendLog(
        'test-file',
        {
          level: LogLevel.INFO,
          message: 'Test 2',
        },
        config,
      );

      // Should create strategy only once
      expect(strategyFactory.createStrategy).toHaveBeenCalledTimes(1);
      expect(mockStrategy.initialize).toHaveBeenCalledTimes(1);
    });

    it('should clear cache when requested', async () => {
      await service.appendLog('test-file', {
        level: LogLevel.INFO,
        message: 'Test',
      });

      service.clearStrategyCache();

      await service.appendLog('test-file', {
        level: LogLevel.INFO,
        message: 'Test',
      });

      // Should create strategy twice due to cache clear
      expect(strategyFactory.createStrategy).toHaveBeenCalledTimes(2);
    });
  });
});
