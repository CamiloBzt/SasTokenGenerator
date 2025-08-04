import { LogEntry } from '@src/shared/enums/blob-logging.enum';
import { BulkLogEntry } from './blob-logging.interface';

/**
 * Interface para formatear entradas de log según el tipo de archivo
 */
export interface LogFormatter {
  /**
   * Formatea una sola entrada de log
   */
  formatEntry(entry: LogEntry, timestamp?: Date): string;

  /**
   * Formatea múltiples entradas de log
   */
  formatBulkEntries(entries: BulkLogEntry[]): string;

  /**
   * Genera el header del archivo si es necesario (ej: CSV headers)
   */
  formatHeader?(): string;

  /**
   * Indica si este formato soporta operaciones de append
   */
  supportsAppend(): boolean;

  /**
   * Valida que la entrada sea compatible con el formato
   */
  validateEntry(entry: LogEntry): boolean;
}
