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
   * @param isDynamic - Si debe usar columnas dinámicas basadas en metadata
   * @param sampleEntry - Entrada de muestra para extraer metadata keys (solo si isDynamic=true)
   */
  formatHeader?(isDynamic?: boolean, sampleEntry?: LogEntry): string;

  /**
   * Indica si este formato soporta operaciones de append
   */
  supportsAppend(): boolean;

  /**
   * Valida que la entrada sea compatible con el formato
   */
  validateEntry(entry: LogEntry): boolean;

  /**
   * Resetea el estado interno del formatter (útil para rotación de archivos)
   */
  resetDynamicMode?(): void;

  /**
   * Obtiene los headers actuales que está usando el formatter
   */
  getCurrentHeaders?(): string[];
}
