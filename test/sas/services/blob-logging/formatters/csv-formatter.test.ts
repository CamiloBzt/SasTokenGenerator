import { CsvLogFormatter } from '@src/sas/services/blob-logging/formatters/csv-formatter';
import { LogLevel } from '@src/shared/dto/blob-logging.dto';
import { LogEntry } from '@src/shared/enums/blob-logging.enum';
import { BulkLogEntry } from '@src/shared/interfaces/services/blob-logging/blob-logging.interface';

describe('CsvLogFormatter', () => {
  let formatter: CsvLogFormatter;
  let mockDate: Date;

  beforeEach(() => {
    formatter = new CsvLogFormatter();
    mockDate = new Date('2024-08-05T10:00:00.000Z');

    jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('formatHeader - Traditional Mode', () => {
    it('should return default CSV headers when not in dynamic mode', () => {
      const result = formatter.formatHeader();

      expect(result).toBe(
        'timestamp,level,requestId,userId,sessionId,message,metadata\n',
      );
    });

    it('should return default headers when isDynamic is false', () => {
      const entry: LogEntry = {
        level: LogLevel.INFO,
        message: 'Test',
        metadata: { key: 'value' },
      };

      const result = formatter.formatHeader(false, entry);

      expect(result).toBe(
        'timestamp,level,requestId,userId,sessionId,message,metadata\n',
      );
    });
  });

  describe('formatHeader - Dynamic Mode', () => {
    it('should return dynamic headers based on metadata keys', () => {
      const entry: LogEntry = {
        level: LogLevel.INFO,
        message: 'Test',
        metadata: {
          fechaDeposito: '06/01/2015',
          noDeposito: '123456',
          valorDeposito: 1000000,
        },
      };

      const result = formatter.formatHeader(true, entry);

      expect(result).toBe('fechaDeposito,noDeposito,valorDeposito\n');
    });

    it('should handle empty metadata in dynamic mode', () => {
      const entry: LogEntry = {
        level: LogLevel.INFO,
        message: 'Test',
        metadata: {},
      };

      const result = formatter.formatHeader(true, entry);

      expect(result).toBe('\n');
    });

    it('should fallback to default headers when no sample entry provided', () => {
      const result = formatter.formatHeader(true);

      expect(result).toBe(
        'timestamp,level,requestId,userId,sessionId,message,metadata\n',
      );
    });

    it('should fallback to default headers when no metadata in sample entry', () => {
      const entry: LogEntry = {
        level: LogLevel.INFO,
        message: 'Test without metadata',
      };

      const result = formatter.formatHeader(true, entry);

      expect(result).toBe(
        'timestamp,level,requestId,userId,sessionId,message,metadata\n',
      );
    });
  });

  describe('formatEntry - Traditional Mode', () => {
    it('should format entry with all fields in traditional mode', () => {
      const entry: LogEntry = {
        level: LogLevel.INFO,
        message: 'Test message',
        requestId: 'req-123',
        userId: 'user-456',
        sessionId: 'session-789',
        metadata: { key: 'value' },
      };

      const result = formatter.formatEntry(entry);

      expect(result).toBe(
        '2024-08-05T10:00:00.000Z,INFO,req-123,user-456,session-789,Test message,"{""key"":""value""}"\n',
      );
    });

    it('should format minimal entry in traditional mode', () => {
      const entry: LogEntry = {
        level: LogLevel.ERROR,
        message: 'Error message',
      };

      const result = formatter.formatEntry(entry);

      expect(result).toBe('2024-08-05T10:00:00.000Z,ERROR,,,,Error message,\n');
    });

    it('should escape CSV fields with commas', () => {
      const entry: LogEntry = {
        level: LogLevel.INFO,
        message: 'Message with, comma',
      };

      const result = formatter.formatEntry(entry);

      expect(result).toBe(
        '2024-08-05T10:00:00.000Z,INFO,,,,"Message with, comma",\n',
      );
    });

    it('should escape CSV fields with quotes', () => {
      const entry: LogEntry = {
        level: LogLevel.INFO,
        message: 'Message with "quotes"',
      };

      const result = formatter.formatEntry(entry);

      expect(result).toBe(
        '2024-08-05T10:00:00.000Z,INFO,,,,"Message with ""quotes""",\n',
      );
    });
  });

  describe('formatEntry - Dynamic Mode', () => {
    beforeEach(() => {
      const sampleEntry: LogEntry = {
        level: LogLevel.INFO,
        message: 'Sample',
        metadata: {
          fechaDeposito: '06/01/2015',
          noDeposito: '123456',
          valorDeposito: 1000000,
        },
      };
      formatter.formatHeader(true, sampleEntry);
    });

    it('should format entry with only metadata values in dynamic mode', () => {
      const entry: LogEntry = {
        level: LogLevel.INFO,
        message: 'Test message',
        userId: 'user-123',
        metadata: {
          fechaDeposito: '07/01/2015',
          noDeposito: '789012',
          valorDeposito: 2000000,
        },
      };

      const result = formatter.formatEntry(entry);

      expect(result).toBe('07/01/2015,789012,2000000\n');
    });

    it('should handle missing metadata keys in dynamic mode', () => {
      const entry: LogEntry = {
        level: LogLevel.INFO,
        message: 'Test message',
        metadata: {
          fechaDeposito: '08/01/2015',
        },
      };

      const result = formatter.formatEntry(entry);

      expect(result).toBe('08/01/2015,,\n');
    });

    it('should handle entry without metadata in dynamic mode', () => {
      const entry: LogEntry = {
        level: LogLevel.INFO,
        message: 'Test message without metadata',
      };

      const result = formatter.formatEntry(entry);

      expect(result).toBe(
        '2024-08-05T10:00:00.000Z,INFO,,,,Test message without metadata,\n',
      );
    });
  });

  describe('formatBulkEntries', () => {
    it('should format multiple entries in traditional mode', () => {
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
      ];

      const result = formatter.formatBulkEntries(entries);

      const lines = result.split('\n').filter((line) => line.length > 0);
      expect(lines).toHaveLength(2);
    });

    it('should format multiple entries in dynamic mode', () => {
      const sampleEntry: LogEntry = {
        level: LogLevel.INFO,
        message: 'Sample',
        metadata: { field1: 'value1', field2: 'value2' },
      };
      formatter.formatHeader(true, sampleEntry);

      const entries: BulkLogEntry[] = [
        {
          level: LogLevel.INFO,
          message: 'First entry',
          metadata: { field1: 'data1', field2: 'data2' },
          timestamp: new Date('2024-01-01T10:00:00.000Z'),
        },
        {
          level: LogLevel.ERROR,
          message: 'Second entry',
          metadata: { field1: 'data3', field2: 'data4' },
          timestamp: new Date('2024-01-01T10:01:00.000Z'),
        },
      ];

      const result = formatter.formatBulkEntries(entries);

      const lines = result.split('\n').filter((line) => line.length > 0);
      expect(lines).toHaveLength(2);
      expect(lines[0]).toBe('data1,data2');
      expect(lines[1]).toBe('data3,data4');
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
  });

  describe('resetDynamicMode', () => {
    it('should reset dynamic mode state', () => {
      const sampleEntry: LogEntry = {
        level: LogLevel.INFO,
        message: 'Sample',
        metadata: { field1: 'value1' },
      };
      formatter.formatHeader(true, sampleEntry);

      expect(formatter.getCurrentHeaders()).toEqual(['field1']);

      formatter.resetDynamicMode();

      expect(formatter.getCurrentHeaders()).toEqual([
        'timestamp',
        'level',
        'requestId',
        'userId',
        'sessionId',
        'message',
        'metadata',
      ]);
    });
  });

  describe('getCurrentHeaders', () => {
    it('should return default headers initially', () => {
      const headers = formatter.getCurrentHeaders();

      expect(headers).toEqual([
        'timestamp',
        'level',
        'requestId',
        'userId',
        'sessionId',
        'message',
        'metadata',
      ]);
    });

    it('should return dynamic headers when in dynamic mode', () => {
      const sampleEntry: LogEntry = {
        level: LogLevel.INFO,
        message: 'Sample',
        metadata: { customField1: 'value1', customField2: 'value2' },
      };
      formatter.formatHeader(true, sampleEntry);

      const headers = formatter.getCurrentHeaders();

      expect(headers).toEqual(['customField1', 'customField2']);
    });
  });

  describe('CSV Field Escaping', () => {
    it('should escape fields with newlines', () => {
      const entry: LogEntry = {
        level: LogLevel.INFO,
        message: 'Message with\nnewline',
      };

      const result = formatter.formatEntry(entry);

      expect(result).toContain('"Message with\nnewline"');
    });

    it('should escape fields with carriage returns', () => {
      const entry: LogEntry = {
        level: LogLevel.INFO,
        message: 'Message with\rcarriage return',
      };

      const result = formatter.formatEntry(entry);

      expect(result).toContain('"Message with\rcarriage return"');
    });

    it('should not escape simple text', () => {
      const entry: LogEntry = {
        level: LogLevel.INFO,
        message: 'Simple message',
      };

      const result = formatter.formatEntry(entry);

      expect(result).toContain('Simple message');
      expect(result).not.toContain('"Simple message"');
    });

    it('should handle empty strings', () => {
      const entry: LogEntry = {
        level: LogLevel.INFO,
        message: 'Test',
        userId: '',
        requestId: '',
      };

      const result = formatter.formatEntry(entry);

      expect(result).toBe('2024-08-05T10:00:00.000Z,INFO,,,,Test,\n');
    });
  });
});
