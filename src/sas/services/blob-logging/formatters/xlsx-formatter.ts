import { Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { LogEntry } from '@src/shared/enums/blob-logging.enum';
import { BulkLogEntry } from '@src/shared/interfaces/services/blob-logging/blob-logging.interface';
import { LogFormatter } from '@src/shared/interfaces/services/blob-logging/log-formatter.interface';

/**
 * Formatter para archivos Excel (.xlsx) con soporte para columnas dinámicas
 */
@Injectable()
export class XlsxLogFormatter implements LogFormatter {
  private readonly DEFAULT_EXCEL_HEADERS = [
    'Timestamp',
    'Level',
    'Request ID',
    'User ID',
    'Session ID',
    'Message',
    'Metadata',
  ];

  private cachedDynamicHeaders: string[] | null = null;
  private isDynamicMode = false;

  formatHeader(isDynamic?: boolean, sampleEntry?: LogEntry): string {
    this.isDynamicMode = isDynamic || false;

    if (this.isDynamicMode && sampleEntry?.metadata) {
      const metadataKeys = Object.keys(sampleEntry.metadata);
      this.cachedDynamicHeaders = metadataKeys.map((key) =>
        this.capitalizeHeader(key),
      );
    }

    return '';
  }

  formatEntry(entry: LogEntry, timestamp?: Date): string {
    const logTimestamp = timestamp
      ? timestamp.toISOString()
      : new Date().toISOString();

    if (this.isDynamicMode && this.cachedDynamicHeaders && entry.metadata) {
      const rowData: Record<string, any> = {};

      const metadataKeys = Object.keys(entry.metadata);
      metadataKeys.forEach((key) => {
        const headerKey = this.capitalizeHeader(key);
        rowData[headerKey] = entry.metadata![key];
      });

      return JSON.stringify(rowData) + '\n';
    }

    const rowData = {
      Timestamp: logTimestamp,
      Level: entry.level,
      'Request ID': entry.requestId || '',
      'User ID': entry.userId || '',
      'Session ID': entry.sessionId || '',
      Message: entry.message,
      Metadata: entry.metadata ? JSON.stringify(entry.metadata) : '',
    };

    return JSON.stringify(rowData) + '\n';
  }

  formatBulkEntries(entries: BulkLogEntry[]): string {
    return entries
      .map((entry) => this.formatEntry(entry, entry.timestamp))
      .join('');
  }

  /**
   * Convierte las entradas formateadas a un buffer de Excel real
   */
  createExcelBuffer(formattedEntries: string, existingData?: string): Buffer {
    const allEntries: any[] = [];

    if (existingData) {
      const existingLines = existingData
        .trim()
        .split('\n')
        .filter((line) => line.trim());
      allEntries.push(...existingLines.map((line) => JSON.parse(line)));
    }

    const newLines = formattedEntries
      .trim()
      .split('\n')
      .filter((line) => line.trim());
    allEntries.push(...newLines.map((line) => JSON.parse(line)));

    const headersToUse =
      this.cachedDynamicHeaders || this.DEFAULT_EXCEL_HEADERS;

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(allEntries, {
      header: headersToUse,
    });

    const columnWidths = this.generateColumnWidths(headersToUse);
    worksheet['!cols'] = columnWidths;

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Logs');

    return XLSX.write(workbook, {
      type: 'buffer',
      bookType: 'xlsx',
      compression: true,
    }) as Buffer;
  }

  supportsAppend(): boolean {
    return false;
  }

  validateEntry(entry: LogEntry): boolean {
    return !!(entry.level && entry.message);
  }

  resetDynamicMode(): void {
    this.cachedDynamicHeaders = null;
    this.isDynamicMode = false;
  }

  getCurrentHeaders(): string[] {
    return this.cachedDynamicHeaders || this.DEFAULT_EXCEL_HEADERS;
  }

  private capitalizeHeader(key: string): string {
    return key
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  private generateColumnWidths(headers: string[]): Array<{ wch: number }> {
    return headers.map((header) => {
      const baseWidth = Math.max(header.length + 5, 12);

      if (
        header.toLowerCase().includes('fecha') ||
        header.toLowerCase().includes('timestamp')
      ) {
        return { wch: 25 };
      }
      if (
        header.toLowerCase().includes('descripcion') ||
        header.toLowerCase().includes('detalle')
      ) {
        return { wch: 40 };
      }
      if (
        header.toLowerCase().includes('observacion') ||
        header.toLowerCase().includes('comentario')
      ) {
        return { wch: 35 };
      }

      return { wch: baseWidth };
    });
  }
}
