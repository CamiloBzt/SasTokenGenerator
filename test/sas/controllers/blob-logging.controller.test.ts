import { Test, TestingModule } from '@nestjs/testing';
import { LoggingController } from '../../../src/sas/controllers/blob-logging.controller';
import { LoggingService } from '../../../src/sas/services/blob-logging.service';
import {
  AppendBulkLogsDto,
  AppendLogDto,
  GetLogStatsDto,
  LogLevel,
  ReadLogsDto,
} from '../../../src/shared/dto/blob-logging.dto';

describe('LoggingController', () => {
  let controller: LoggingController;
  let service: LoggingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LoggingController],
      providers: [
        {
          provide: LoggingService,
          useValue: {
            appendLog: jest.fn(),
            appendBulkLogs: jest.fn(),
            readLogs: jest.fn().mockResolvedValue('log-content'),
            getLogFileStats: jest.fn().mockResolvedValue({ exists: true }),
          },
        },
      ],
    }).compile();

    controller = module.get<LoggingController>(LoggingController);
    service = module.get<LoggingService>(LoggingService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('appendLog should return success', async () => {
    const dto: AppendLogDto = {
      fileName: 'file',
      entry: { level: LogLevel.INFO, message: 'msg', metadata: {} },
      config: {
        containerName: 'c',
        directory: 'd',
        maxFileSize: 1,
        rotateDaily: false,
      },
    };
    const res = await controller.appendLog(dto);
    expect(res.status.statusCode).toBe(200);
    expect(res.data.message).toBeDefined();
    expect(service.appendLog).toHaveBeenCalled();
  });

  it('appendBulkLogs should return success', async () => {
    const dto: AppendBulkLogsDto = {
      fileName: 'file',
      entries: [
        {
          level: LogLevel.INFO,
          message: 'msg',
          metadata: {},
          userId: 'u',
          timestamp: new Date().toISOString(),
        },
      ],
      config: {
        containerName: 'c',
        directory: 'd',
        maxFileSize: 1,
        rotateDaily: false,
      },
    };
    const res = await controller.appendBulkLogs(dto);
    expect(res.status.statusCode).toBe(200);
    expect(res.data.message).toBeDefined();
    expect(service.appendBulkLogs).toHaveBeenCalled();
  });

  it('readLogs should return content', async () => {
    const dto: ReadLogsDto = {
      fileName: 'file',
      config: { containerName: 'c', directory: 'd', rotateDaily: false },
    };
    const res = await controller.readLogs(dto);
    expect(res.status.statusCode).toBe(200);
    expect(res.data.content).toBe('log-content');
    expect(service.readLogs).toHaveBeenCalled();
  });

  it('getLogStats should return stats', async () => {
    const dto: GetLogStatsDto = {
      fileName: 'file',
      config: { containerName: 'c', directory: 'd' },
    };
    const res = await controller.getLogStats(dto);
    expect(res.status.statusCode).toBe(200);
    expect(res.data.exists).toBe(true);
    expect(service.getLogFileStats).toHaveBeenCalled();
  });
});
