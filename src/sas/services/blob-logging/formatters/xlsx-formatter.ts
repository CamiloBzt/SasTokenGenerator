import { Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { LogEntry } from '@src/shared/enums/blob-logging.enum';
import { BulkLogEntry } from '@src/shared/interfaces/services/blob-logging/blob-logging.interface';
import { LogFormatter } from '@src/shared/interfaces/services/blob-logging/log-formatter.interface';

/**
 * Formatter para archivos Excel (.xlsx)
 */
@Injectable()
export class XlsxLogFormatter implements LogFormatter {
  private readonly EXCEL_HEADERS = [
    'Timestamp',
    'Level',
    'Request ID',
    'User ID',
    'Session ID',
    'Message',
    'Metadata',
  ];

  formatEntry(entry: LogEntry, timestamp?: Date): string {
    // Para XLSX, retornamos un objeto que luego se convertirá
    const logTimestamp = timestamp
      ? timestamp.toISOString()
      : new Date().toISOString();

    const rowData = {
      Timestamp: logTimestamp,
      Level: entry.level,
      'Request ID': entry.requestId || '',
      'User ID': entry.userId || '',
      'Session ID': entry.sessionId || '',
      Message: entry.message,
      Metadata: entry.metadata ? JSON.stringify(entry.metadata) : '',
    };

    // Retornamos JSON string que luego se parseará para crear el Excel
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
    // Parsear entradas existentes si las hay
    const allEntries: any[] = [];

    if (existingData) {
      const existingLines = existingData
        .trim()
        .split('\n')
        .filter((line) => line.trim());
      allEntries.push(...existingLines.map((line) => JSON.parse(line)));
    }

    // Agregar nuevas entradas
    const newLines = formattedEntries
      .trim()
      .split('\n')
      .filter((line) => line.trim());
    allEntries.push(...newLines.map((line) => JSON.parse(line)));

    // Crear workbook
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(allEntries, {
      header: this.EXCEL_HEADERS,
    });

    // Configurar ancho de columnas
    const columnWidths = [
      { wch: 25 }, // Timestamp
      { wch: 8 }, // Level
      { wch: 15 }, // Request ID
      { wch: 12 }, // User ID
      { wch: 15 }, // Session ID
      { wch: 50 }, // Message
      { wch: 30 }, // Metadata
    ];
    worksheet['!cols'] = columnWidths;

    // Agregar worksheet al workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Logs');

    // Convertir a buffer
    return XLSX.write(workbook, {
      type: 'buffer',
      bookType: 'xlsx',
      compression: true,
    }) as Buffer;
  }

  supportsAppend(): boolean {
    return false; // Excel requiere regeneración completa
  }

  validateEntry(entry: LogEntry): boolean {
    return !!(entry.level && entry.message);
  }
}
