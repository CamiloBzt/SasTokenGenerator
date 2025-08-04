import { LogFileType } from '@src/shared/dto/blob-logging.dto';
import { LogEntry } from '@src/shared/enums/blob-logging.enum';
import { BulkLogEntry, LogFileConfig } from './blob-logging.interface';

/**
 * Strategy interface que combina formatter y writer
 */
export interface LogStrategy {
  /**
   * Tipo de archivo que maneja esta estrategia
   */
  getFileType(): LogFileType;

  /**
   * Inicializa la estrategia
   */
  initialize(fileName: string, config: LogFileConfig): Promise<void>;

  /**
   * Procesa una sola entrada de log
   */
  appendLog(entry: LogEntry): Promise<void>;

  /**
   * Procesa múltiples entradas de log
   */
  appendBulkLogs(entries: BulkLogEntry[]): Promise<void>;

  /**
   * Lee el contenido del log
   */
  readLogs(): Promise<string>;

  /**
   * Obtiene estadísticas del archivo
   */
  getLogFileStats(): Promise<{
    exists: boolean;
    fileType: LogFileType;
    sizeBytes?: number;
    sizeMB?: number;
    lastModified?: Date;
    createdAt?: string;
  }>;
}
