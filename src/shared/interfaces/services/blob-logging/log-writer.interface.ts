import { LogFileConfig } from './blob-logging.interface';

/**
 * Interface para escribir logs a Azure Blob Storage
 */
export interface LogWriter {
  /**
   * Inicializa el writer con la configuración
   */
  initialize(fileName: string, config: LogFileConfig): Promise<void>;

  /**
   * Escribe una sola entrada formateada
   */
  writeEntry(formattedContent: string): Promise<void>;

  /**
   * Escribe múltiples entradas de forma bulk
   */
  writeBulk(formattedContent: string): Promise<void>;

  /**
   * Verifica si el archivo necesita rotación
   */
  needsRotation(): Promise<boolean>;

  /**
   * Ejecuta la rotación del archivo
   */
  rotate(): Promise<string>;

  /**
   * Obtiene estadísticas del archivo actual
   */
  getStats(): Promise<{
    exists: boolean;
    sizeBytes?: number;
    sizeMB?: number;
    lastModified?: Date;
    createdAt?: string;
  }>;

  /**
   * Lee el contenido completo del archivo
   */
  readContent(): Promise<string>;

  /**
   * Limpia recursos si es necesario
   */
  cleanup?(): Promise<void>;
}
