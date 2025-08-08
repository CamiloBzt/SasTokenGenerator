import { Injectable } from '@nestjs/common';
import { LogEntry } from '@src/shared/enums/blob-logging.enum';
import { BulkLogEntry } from '@src/shared/interfaces/services/blob-logging/blob-logging.interface';
import { LogFormatter } from '@src/shared/interfaces/services/blob-logging/log-formatter.interface';

/**
 * Formatter para archivos CSV (.csv) con soporte para columnas dinámicas
 */
@Injectable()
export class CsvLogFormatter implements LogFormatter {
  private readonly DEFAULT_CSV_HEADERS = [
    'timestamp',
    'level',
    'requestId',
    'userId',
    'sessionId',
    'message',
    'metadata',
  ];

  private cachedDynamicHeaders: string[] | null = null;
  private isDynamicMode = false;

  formatHeader(isDynamic?: boolean, sampleEntry?: LogEntry): string {
    this.isDynamicMode = isDynamic || false;

    if (this.isDynamicMode && sampleEntry?.metadata) {
      const metadataKeys = Object.keys(sampleEntry.metadata);
      this.cachedDynamicHeaders = [...metadataKeys];

      return this.cachedDynamicHeaders.join(',') + '\n';
    }

    return this.DEFAULT_CSV_HEADERS.join(',') + '\n';
  }

  formatEntry(entry: LogEntry, timestamp?: Date): string {
    const logTimestamp = timestamp
      ? timestamp.toISOString()
      : new Date().toISOString();

    if (this.isDynamicMode && this.cachedDynamicHeaders && entry.metadata) {
      const metadataValues = this.cachedDynamicHeaders.map((key) => {
        const value = entry.metadata?.[key];
        return value !== undefined ? this.escapeCsvField(String(value)) : '';
      });

      return metadataValues.join(',') + '\n';
    }

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

  resetDynamicMode(): void {
    this.cachedDynamicHeaders = null;
    this.isDynamicMode = false;
  }

  getCurrentHeaders(): string[] {
    return this.cachedDynamicHeaders || this.DEFAULT_CSV_HEADERS;
  }

  private escapeCsvField(field: string): string {
    if (!field) return '';

    if (
      field.includes(',') ||
      field.includes('"') ||
      field.includes('\n') ||
      field.includes('\r')
    ) {
      return `"${field.replace(/"/g, '""')}"`;
    }

    return field;
  }
}
