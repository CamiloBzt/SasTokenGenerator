import { XlsxLogFormatter } from '@src/sas/services/blob-logging/formatters/xlsx-formatter';
import { LogLevel } from '@src/shared/dto/blob-logging.dto';
import { LogEntry } from '@src/shared/enums/blob-logging.enum';

// Mock XLSX
jest.mock('xlsx', () => ({
  utils: {
    book_new: jest.fn(() => ({ SheetNames: [], Sheets: {} })),
    json_to_sheet: jest.fn(() => ({ '!ref': 'A1:G10', '!cols': [] })),
    book_append_sheet: jest.fn(),
  },
  write: jest.fn(() => Buffer.from('mock excel data')),
}));

describe('XlsxLogFormatter', () => {
  let formatter: XlsxLogFormatter;
  let mockDate: Date;

  beforeEach(() => {
    formatter = new XlsxLogFormatter();
    mockDate = new Date('2024-08-05T10:00:00.000Z');

    jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('formatHeader - Traditional Mode', () => {
    it('should return empty string and not configure dynamic mode', () => {
      const result = formatter.formatHeader();

      expect(result).toBe('');
      expect(formatter.getCurrentHeaders()).toEqual([
        'Timestamp',
        'Level',
        'Request ID',
        'User ID',
        'Session ID',
        'Message',
        'Metadata',
      ]);
    });

    it('should return empty string when isDynamic is false', () => {
      const entry: LogEntry = {
        level: LogLevel.INFO,
        message: 'Test',
        metadata: { key: 'value' },
      };

      const result = formatter.formatHeader(false, entry);

      expect(result).toBe('');
      expect(formatter.getCurrentHeaders()).toEqual([
        'Timestamp',
        'Level',
        'Request ID',
        'User ID',
        'Session ID',
        'Message',
        'Metadata',
      ]);
    });
  });

  describe('formatHeader - Dynamic Mode', () => {
    it('should configure dynamic mode with capitalized headers', () => {
      const entry: LogEntry = {
        level: LogLevel.INFO,
        message: 'Test',
        metadata: {
          fecha_deposito: '06/01/2015',
          no_deposito: '123456',
          valor_deposito: 1000000,
        },
      };

      const result = formatter.formatHeader(true, entry);

      expect(result).toBe('');
      expect(formatter.getCurrentHeaders()).toEqual([
        'Fecha Deposito',
        'No Deposito',
        'Valor Deposito',
      ]);
    });

    it('should handle empty metadata in dynamic mode', () => {
      const entry: LogEntry = {
        level: LogLevel.INFO,
        message: 'Test',
        metadata: {},
      };

      formatter.formatHeader(true, entry);

      expect(formatter.getCurrentHeaders()).toEqual([]);
    });

    it('should fallback to default headers when no sample entry provided', () => {
      formatter.formatHeader(true);

      expect(formatter.getCurrentHeaders()).toEqual([
        'Timestamp',
        'Level',
        'Request ID',
        'User ID',
        'Session ID',
        'Message',
        'Metadata',
      ]);
    });
  });

  describe('formatEntry - Traditional Mode', () => {
    it('should format entry as JSON string in traditional mode', () => {
      const entry: LogEntry = {
        level: LogLevel.INFO,
        message: 'Test message',
        requestId: 'req-123',
        userId: 'user-456',
        sessionId: 'session-789',
        metadata: { key: 'value' },
      };

      const result = formatter.formatEntry(entry);

      const parsedResult = JSON.parse(result.trim());
      expect(parsedResult).toEqual({
        Timestamp: '2024-08-05T10:00:00.000Z',
        Level: 'INFO',
        'Request ID': 'req-123',
        'User ID': 'user-456',
        'Session ID': 'session-789',
        Message: 'Test message',
        Metadata: '{"key":"value"}',
      });
    });

    it('should format minimal entry in traditional mode', () => {
      const entry: LogEntry = {
        level: LogLevel.ERROR,
        message: 'Error message',
      };

      const result = formatter.formatEntry(entry);

      const parsedResult = JSON.parse(result.trim());
      expect(parsedResult).toEqual({
        Timestamp: '2024-08-05T10:00:00.000Z',
        Level: 'ERROR',
        'Request ID': '',
        'User ID': '',
        'Session ID': '',
        Message: 'Error message',
        Metadata: '',
      });
    });
  });

  describe('formatEntry - Dynamic Mode', () => {
    beforeEach(() => {
      // Setup dynamic mode
      const sampleEntry: LogEntry = {
        level: LogLevel.INFO,
        message: 'Sample',
        metadata: {
          fecha_deposito: '06/01/2015',
          no_deposito: '123456',
          valor_deposito: 1000000,
        },
      };
      formatter.formatHeader(true, sampleEntry);
    });

    it('should format entry with only metadata in dynamic mode', () => {
      const entry: LogEntry = {
        level: LogLevel.INFO,
        message: 'Test message',
        userId: 'user-123',
        metadata: {
          fecha_deposito: '07/01/2015',
          no_deposito: '789012',
          valor_deposito: 2000000,
        },
      };

      const result = formatter.formatEntry(entry);

      const parsedResult = JSON.parse(result.trim());
      expect(parsedResult).toEqual({
        'Fecha Deposito': '07/01/2015',
        'No Deposito': '789012',
        'Valor Deposito': 2000000,
      });
    });

    it('should handle missing metadata keys in dynamic mode', () => {
      const entry: LogEntry = {
        level: LogLevel.INFO,
        message: 'Test message',
        metadata: {
          fecha_deposito: '08/01/2015',
          // Missing no_deposito and valor_deposito
        },
      };

      const result = formatter.formatEntry(entry);

      const parsedResult = JSON.parse(result.trim());
      expect(parsedResult).toEqual({
        'Fecha Deposito': '08/01/2015',
        // Missing keys are not included in the output
      });
    });

    it('should fallback to traditional mode when no metadata', () => {
      const entry: LogEntry = {
        level: LogLevel.INFO,
        message: 'Test message without metadata',
      };

      const result = formatter.formatEntry(entry);

      const parsedResult = JSON.parse(result.trim());
      expect(parsedResult).toHaveProperty('Timestamp');
      expect(parsedResult).toHaveProperty('Level');
      expect(parsedResult).toHaveProperty('Message');
    });
  });
});
