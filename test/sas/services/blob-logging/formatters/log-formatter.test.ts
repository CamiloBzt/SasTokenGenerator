import { TraditionalLogFormatter } from '@src/sas/services/blob-logging/formatters/log-formatter';
import { LogLevel } from '@src/shared/dto/blob-logging.dto';
import { LogEntry } from '@src/shared/enums/blob-logging.enum';
import { BulkLogEntry } from '@src/shared/interfaces/services/blob-logging/blob-logging.interface';

describe('TraditionalLogFormatter', () => {
  let formatter: TraditionalLogFormatter;
  let mockDate: Date;

  beforeEach(() => {
    formatter = new TraditionalLogFormatter();
    mockDate = new Date('2024-08-05T10:00:00.000Z');

    jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('formatEntry', () => {
    it('should format basic log entry with all fields', () => {
      const entry: LogEntry = {
        level: LogLevel.INFO,
        message: 'Test message',
        requestId: 'req-123',
        userId: 'user-456',
        sessionId: 'session-789',
        metadata: { key1: 'value1', key2: 'value2' },
      };

      const result = formatter.formatEntry(entry);

      expect(result).toBe(
        '[2024-08-05T10:00:00.000Z] [INFO] [req-123] [User:user-456] [Session:session-789] Test message | Metadata: {"key1":"value1","key2":"value2"}\n',
      );
    });

    it('should format minimal log entry with only required fields', () => {
      const entry: LogEntry = {
        level: LogLevel.ERROR,
        message: 'Error occurred',
      };

      const result = formatter.formatEntry(entry);

      expect(result).toBe(
        '[2024-08-05T10:00:00.000Z] [ERROR] Error occurred\n',
      );
    });

    it('should handle entry with some optional fields', () => {
      const entry: LogEntry = {
        level: LogLevel.WARN,
        message: 'Warning message',
        userId: 'user-789',
      };

      const result = formatter.formatEntry(entry);

      expect(result).toBe(
        '[2024-08-05T10:00:00.000Z] [WARN] [User:user-789] Warning message\n',
      );
    });

    it('should handle empty metadata object', () => {
      const entry: LogEntry = {
        level: LogLevel.INFO,
        message: 'Test message',
        metadata: {},
      };

      const result = formatter.formatEntry(entry);

      expect(result).toBe('[2024-08-05T10:00:00.000Z] [INFO] Test message\n');
    });

    it('should handle complex metadata', () => {
      const entry: LogEntry = {
        level: LogLevel.INFO,
        message: 'Complex metadata test',
        metadata: {
          nested: { prop: 'value' },
          array: [1, 2, 3],
          boolean: true,
          number: 42,
        },
      };

      const result = formatter.formatEntry(entry);

      expect(result).toContain('Complex metadata test | Metadata:');
      expect(result).toContain('"nested":{"prop":"value"}');
      expect(result).toContain('"array":[1,2,3]');
      expect(result).toContain('"boolean":true');
      expect(result).toContain('"number":42');
    });
  });

  describe('formatBulkEntries', () => {
    it('should format multiple entries correctly', () => {
      const entries: BulkLogEntry[] = [
        {
          level: LogLevel.INFO,
          message: 'First entry',
          timestamp: new Date('2024-01-01T10:00:00.000Z'),
        },
        {
          level: LogLevel.ERROR,
          message: 'Second entry',
          userId: 'user-123',
          timestamp: new Date('2024-01-01T10:01:00.000Z'),
        },
        {
          level: LogLevel.DEBUG,
          message: 'Third entry',
          metadata: { debug: true },
          timestamp: new Date('2024-01-01T10:02:00.000Z'),
        },
      ];

      const result = formatter.formatBulkEntries(entries);

      const lines = result.split('\n').filter((line) => line.length > 0);
      expect(lines).toHaveLength(3);
    });

    it('should handle empty bulk entries array', () => {
      const entries: BulkLogEntry[] = [];

      const result = formatter.formatBulkEntries(entries);

      expect(result).toBe('');
    });
  });

  describe('supportsAppend', () => {
    it('should return true', () => {
      expect(formatter.supportsAppend()).toBe(true);
    });
  });

  describe('validateEntry', () => {
    it('should return true for valid entries', () => {
      const validEntry: LogEntry = {
        level: LogLevel.INFO,
        message: 'Valid message',
      };

      expect(formatter.validateEntry(validEntry)).toBe(true);
    });

    it('should return false for entry without level', () => {
      const invalidEntry = {
        message: 'Message without level',
      } as LogEntry;

      expect(formatter.validateEntry(invalidEntry)).toBe(false);
    });

    it('should return false for entry without message', () => {
      const invalidEntry = {
        level: LogLevel.INFO,
      } as LogEntry;

      expect(formatter.validateEntry(invalidEntry)).toBe(false);
    });

    it('should return false for entry with empty message', () => {
      const invalidEntry: LogEntry = {
        level: LogLevel.INFO,
        message: '',
      };

      expect(formatter.validateEntry(invalidEntry)).toBe(false);
    });

    it('should return true for entry with extra fields', () => {
      const validEntry: LogEntry = {
        level: LogLevel.WARN,
        message: 'Valid message',
        userId: 'user-123',
        requestId: 'req-456',
        sessionId: 'session-789',
        metadata: { extra: 'data' },
      };

      expect(formatter.validateEntry(validEntry)).toBe(true);
    });
  });
});
