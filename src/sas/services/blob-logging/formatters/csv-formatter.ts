import { Injectable } from '@nestjs/common';
import { LogEntry } from '@src/shared/enums/blob-logging.enum';
import { BulkLogEntry } from '@src/shared/interfaces/services/blob-logging/blob-logging.interface';
import { LogFormatter } from '@src/shared/interfaces/services/blob-logging/log-formatter.interface';

/**
 * Formatter para archivos CSV (.csv)
 */
@Injectable()
export class CsvLogFormatter implements LogFormatter {
  private readonly CSV_HEADERS = [
    'timestamp',
    'level',
    'requestId',
    'userId',
    'sessionId',
    'message',
    'metadata',
  ];

  formatHeader(): string {
    return this.CSV_HEADERS.join(',') + '\n';
  }

  formatEntry(entry: LogEntry, timestamp?: Date): string {
    const logTimestamp = timestamp
      ? timestamp.toISOString()
      : new Date().toISOString();

    const fields = [
      logTimestamp,
      entry.level,
      entry.requestId || '',
      entry.userId || '',
      entry.sessionId || '',
      this.escapeCsvField(entry.message),
      entry.metadata ? this.escapeCsvField(JSON.stringify(entry.metadata)) : '',
    ];

    return fields.join(',') + '\n';
  }

  formatBulkEntries(entries: BulkLogEntry[]): string {
    return entries
      .map((entry) => this.formatEntry(entry, entry.timestamp))
      .join('');
  }

  supportsAppend(): boolean {
    return true;
  }

  validateEntry(entry: LogEntry): boolean {
    return !!(entry.level && entry.message);
  }

  private escapeCsvField(field: string): string {
    if (!field) return '';

    // Si el campo contiene comas, comillas dobles o saltos de línea, escaparlo
    if (
      field.includes(',') ||
      field.includes('"') ||
      field.includes('\n') ||
      field.includes('\r')
    ) {
      // Escapar comillas dobles duplicándolas y envolver en comillas
      return `"${field.replace(/"/g, '""')}"`;
    }

    return field;
  }
}
