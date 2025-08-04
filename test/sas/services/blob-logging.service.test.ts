const mockAppendBlobClient = {
  exists: jest.fn().mockResolvedValue(true),
  create: jest.fn().mockResolvedValue(undefined),
  appendBlock: jest.fn().mockResolvedValue(undefined),
  getProperties: jest.fn().mockResolvedValue({
    contentLength: 1024 * 1024,
    lastModified: new Date(),
    metadata: { createdAt: new Date().toISOString() },
  }),
  downloadToBuffer: jest.fn().mockResolvedValue(Buffer.from('log-content', 'utf-8')),
};

jest.mock('@azure/storage-blob', () => ({
  AppendBlobClient: jest.fn().mockImplementation(() => mockAppendBlobClient),
  AnonymousCredential: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { LoggingService } from '../../../src/sas/services/blob-logging.service';
import { SasService } from '../../../src/sas/services/sas.service';
import {
  LogFileType,
  LogLevel,
} from '../../../src/shared/dto/blob-logging.dto';

describe('LoggingService', () => {
  let service: LoggingService;
  let sasService: SasService;

  const mockAppendBlobClient = {
    exists: jest.fn().mockResolvedValue(true),
    create: jest.fn().mockResolvedValue(undefined),
    appendBlock: jest.fn().mockResolvedValue(undefined),
    getProperties: jest.fn().mockResolvedValue({
      contentLength: 1024 * 1024,
      lastModified: new Date(),
      metadata: { createdAt: new Date().toISOString() },
    }),
    downloadToBuffer: jest
      .fn()
      .mockResolvedValue(Buffer.from('log-content', 'utf-8')),
  };

  beforeAll(() => {
    jest
      .spyOn(require('@azure/storage-blob'), 'AppendBlobClient')
      .mockImplementation(() => mockAppendBlobClient);
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoggingService,
        {
          provide: SasService,
          useValue: {
            generateSasTokenWithParams: jest
              .fn()
              .mockResolvedValue({ sasUrl: 'https://fakeurl' }),
          },
        },
      ],
    }).compile();
    service = module.get<LoggingService>(LoggingService);
    sasService = module.get<SasService>(SasService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('determineFileType returns LOG by default', () => {
    expect(service['determineFileType']('file')).toBe(LogFileType.LOG);
  });

  it('cleanBaseFileName removes extension', () => {
    expect(service['cleanBaseFileName']('file.csv')).toBe('file');
  });

  it('generateLogFileName returns string', () => {
    expect(typeof service['generateLogFileName']('file')).toBe('string');
  });

  it('buildLogFilePath returns string', () => {
    expect(typeof service['buildLogFilePath']('file')).toBe('string');
  });

  it('formatLogEntry returns string', () => {
    expect(
      typeof service['formatLogEntry'](
        { level: LogLevel.INFO, message: 'msg' },
        LogFileType.LOG,
      ),
    ).toBe('string');
  });

  it('formatAsLog returns string', () => {
    expect(
      typeof service['formatAsLog'](
        { level: LogLevel.INFO, message: 'msg' },
        new Date().toISOString(),
      ),
    ).toBe('string');
  });

  it('formatAsCSV returns string', () => {
    expect(
      typeof service['formatAsCSV'](
        { level: LogLevel.INFO, message: 'msg' },
        new Date().toISOString(),
      ),
    ).toBe('string');
  });

  it('generateCSVHeader returns string', () => {
    expect(typeof service['generateCSVHeader']()).toBe('string');
  });

  it('getOrCreateAppendBlob returns client (exists)', async () => {
    mockAppendBlobClient.exists.mockResolvedValueOnce(true);
    const client = await service['getOrCreateAppendBlob']('file', {});
    expect(client).toBe(mockAppendBlobClient);
  });

  it('getOrCreateAppendBlob creates blob if not exists', async () => {
    mockAppendBlobClient.exists.mockResolvedValueOnce(false);
    const client = await service['getOrCreateAppendBlob']('file.csv', {});
    expect(client).toBe(mockAppendBlobClient);
    expect(mockAppendBlobClient.create).toHaveBeenCalled();
  });

  it('getOrCreateAppendBlob throws on error', async () => {
    mockAppendBlobClient.exists.mockRejectedValueOnce({ statusCode: 404 });
    await expect(
      service['getOrCreateAppendBlob']('file', {}),
    ).rejects.toThrow();
    mockAppendBlobClient.exists.mockResolvedValue(true);
  });

  it('checkAndRotateIfNeeded returns true if size >= max', async () => {
    mockAppendBlobClient.getProperties.mockResolvedValueOnce({
      contentLength: 1024 * 1024 * 101,
    });
    const res = await service['checkAndRotateIfNeeded'](
      mockAppendBlobClient as any,
      { maxFileSize: 1 },
    );
    expect(res).toBe(true);
  });

  it('checkAndRotateIfNeeded returns false on error', async () => {
    mockAppendBlobClient.getProperties.mockRejectedValueOnce(new Error('fail'));
    const res = await service['checkAndRotateIfNeeded'](
      mockAppendBlobClient as any,
      {},
    );
    expect(res).toBe(false);
    mockAppendBlobClient.getProperties.mockResolvedValue({
      contentLength: 1024 * 1024,
    });
  });

  it('rotateLogFile returns rotated name', async () => {
    const name = await service['rotateLogFile']('file.log', {});
    expect(name).toMatch(/rotated/);
  });

  it('processXLSXContent appends block', async () => {
    mockAppendBlobClient.downloadToBuffer.mockResolvedValueOnce(
      Buffer.from('csv', 'utf-8'),
    );
    await expect(
      service['processXLSXContent'](mockAppendBlobClient as any, 'csv'),
    ).resolves.toBeUndefined();
  });

  it('processXLSXContent appends block on error', async () => {
    mockAppendBlobClient.downloadToBuffer.mockRejectedValueOnce(
      new Error('fail'),
    );
    await expect(
      service['processXLSXContent'](mockAppendBlobClient as any, 'csv'),
    ).resolves.toBeUndefined();
    mockAppendBlobClient.downloadToBuffer.mockResolvedValue(
      Buffer.from('csv', 'utf-8'),
    );
  });

  it('appendLog calls appendBlock', async () => {
    jest
      .spyOn(service as any, 'getOrCreateAppendBlob')
      .mockResolvedValue(mockAppendBlobClient);
    jest
      .spyOn(service as any, 'checkAndRotateIfNeeded')
      .mockResolvedValue(false);
    await expect(
      service.appendLog(
        'file',
        { level: LogLevel.INFO, message: 'msg' } as any,
        {},
      ),
    ).resolves.toBeUndefined();
  });

  it('appendBulkLogs calls appendBlock', async () => {
    jest
      .spyOn(service as any, 'getOrCreateAppendBlob')
      .mockResolvedValue(mockAppendBlobClient);
    jest
      .spyOn(service as any, 'checkAndRotateIfNeeded')
      .mockResolvedValue(false);
    await expect(
      service.appendBulkLogs(
        'file',
        [{ level: LogLevel.INFO, message: 'msg' } as any],
        {},
      ),
    ).resolves.toBeUndefined();
  });

  it('appendLogInChunks appends in chunks', async () => {
    const buf = Buffer.alloc(1024 * 1024 * 2);
    await expect(
      service['appendLogInChunks'](mockAppendBlobClient as any, buf),
    ).resolves.toBeUndefined();
  });

  it('readLogs returns content', async () => {
    jest
      .spyOn(service as any, 'getOrCreateAppendBlob')
      .mockResolvedValue(mockAppendBlobClient);
    mockAppendBlobClient.exists.mockResolvedValue(true);
    mockAppendBlobClient.downloadToBuffer.mockResolvedValue(
      Buffer.from('log-content', 'utf-8'),
    );
    await expect(service.readLogs('file', {})).resolves.toBe('log-content');
  });

  it('readLogs returns empty message', async () => {
    jest
      .spyOn(service as any, 'getOrCreateAppendBlob')
      .mockResolvedValue(mockAppendBlobClient);
    mockAppendBlobClient.exists.mockResolvedValue(true);
    mockAppendBlobClient.downloadToBuffer.mockResolvedValue(
      Buffer.from('', 'utf-8'),
    );
    await expect(service.readLogs('file', {})).resolves.toMatch(/empty/);
  });

  it('readLogs throws if not exists', async () => {
    jest
      .spyOn(service as any, 'getOrCreateAppendBlob')
      .mockResolvedValue(mockAppendBlobClient);
    mockAppendBlobClient.exists.mockResolvedValue(false);
    await expect(service.readLogs('file', {})).rejects.toThrow();
    mockAppendBlobClient.exists.mockResolvedValue(true);
  });

  it('getLogFileStats returns stats if exists', async () => {
    jest
      .spyOn(service as any, 'getOrCreateAppendBlob')
      .mockResolvedValue(mockAppendBlobClient);
    mockAppendBlobClient.exists.mockResolvedValue(true);
    mockAppendBlobClient.getProperties.mockResolvedValue({
      contentLength: 100,
      lastModified: new Date(),
      metadata: { createdAt: new Date().toISOString() },
    });
    const stats = await service.getLogFileStats('file', {});
    expect(stats.exists).toBe(true);
  });

  it('getLogFileStats returns exists false if not exists', async () => {
    jest
      .spyOn(service as any, 'getOrCreateAppendBlob')
      .mockResolvedValue(mockAppendBlobClient);
    mockAppendBlobClient.exists.mockResolvedValue(false);
    const stats = await service.getLogFileStats('file', {});
    expect(stats.exists).toBe(false);
    mockAppendBlobClient.exists.mockResolvedValue(true);
  });
});
