import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { LogFileType } from '@src/shared/dto/blob-logging.dto';
import { LogEntry } from '@src/shared/enums/blob-logging.enum';
import {
  BulkLogEntry,
  LogFileConfig,
} from '@src/shared/interfaces/services/blob-logging/blob-logging.interface';
import { LogStrategy } from '@src/shared/interfaces/services/blob-logging/log-strategy.interface';
import { LogStrategyFactory } from './factories/log-strategy-factory';

/**
 * Servicio de logging refactorizado usando Strategy Pattern
 */
@Injectable()
export class BlobLoggingService {
  private readonly strategyCache = new Map<string, LogStrategy>();

  constructor(private readonly logStrategyFactory: LogStrategyFactory) {}

  /**
   * Agregar una sola entrada de log
   */
  async appendLog(
    fileName: string,
    entry: LogEntry,
    config: LogFileConfig = {},
  ): Promise<void> {
    try {
      const strategy = await this.getStrategy(fileName, config);
      await strategy.appendLog(entry);
    } catch (error: any) {
      console.error('Error appending log:', error);
      throw new InternalServerErrorException(
        `Failed to append log: ${error.message}`,
      );
    }
  }

  /**
   * Agregar múltiples entradas de log de una vez
   */
  async appendBulkLogs(
    fileName: string,
    entries: BulkLogEntry[],
    config: LogFileConfig = {},
  ): Promise<void> {
    try {
      const strategy = await this.getStrategy(fileName, config);
      await strategy.appendBulkLogs(entries);
    } catch (error: any) {
      console.error('Error appending bulk logs:', error);
      throw new InternalServerErrorException(
        `Failed to append bulk logs: ${error.message}`,
      );
    }
  }

  /**
   * Leer logs completos (para debugging o consulta)
   */
  async readLogs(
    fileName: string,
    config: LogFileConfig = {},
  ): Promise<string> {
    try {
      const strategy = await this.getStrategy(fileName, config);
      return await strategy.readLogs();
    } catch (error: any) {
      console.error('Error reading logs:', error);
      throw new InternalServerErrorException(
        `Failed to read logs: ${error.message}`,
      );
    }
  }

  /**
   * Obtener estadísticas del archivo de log
   */
  async getLogFileStats(
    fileName: string,
    config: LogFileConfig = {},
  ): Promise<{
    exists: boolean;
    fileType: LogFileType;
    sizeBytes?: number;
    sizeMB?: number;
    lastModified?: Date;
    createdAt?: string;
  }> {
    try {
      const strategy = await this.getStrategy(fileName, config);
      return await strategy.getLogFileStats();
    } catch (error: any) {
      console.error('Error getting log file stats:', error);
      return {
        exists: false,
        fileType: this.logStrategyFactory['determineFileType'](
          fileName,
          config,
        ),
      };
    }
  }

  /**
   * Limpia la caché de estrategias (útil para testing o cambios de configuración)
   */
  clearStrategyCache(): void {
    this.strategyCache.clear();
  }

  /**
   * Obtiene información sobre los tipos de archivo soportados
   */
  getSupportedFormats(): {
    fileType: LogFileType;
    extension: string;
    supportsAppend: boolean;
    description: string;
  }[] {
    return [
      {
        fileType: LogFileType.LOG,
        extension: '.log',
        supportsAppend: true,
        description: 'Traditional log format with structured text entries',
      },
      {
        fileType: LogFileType.CSV,
        extension: '.csv',
        supportsAppend: true,
        description: 'Comma-separated values format for data analysis',
      },
      {
        fileType: LogFileType.XLSX,
        extension: '.xlsx',
        supportsAppend: false,
        description: 'Excel spreadsheet format for rich data presentation',
      },
    ];
  }

  /**
   * Valida la configuración de logging
   */
  validateLoggingConfig(config: LogFileConfig): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Validar container name
    if (
      config.containerName &&
      !/^[a-z0-9]([a-z0-9\-]*[a-z0-9])?$/.test(config.containerName)
    ) {
      errors.push('Container name must be lowercase alphanumeric with hyphens');
    }

    // Validar directory path
    if (config.directory && config.directory.includes('..')) {
      errors.push('Directory path cannot contain ".." for security reasons');
    }

    // Validar max file size
    if (
      config.maxFileSize &&
      (config.maxFileSize <= 0 || config.maxFileSize > 1024)
    ) {
      errors.push('Max file size must be between 1MB and 1024MB');
    }

    // Validar file type
    if (
      config.fileType &&
      !this.logStrategyFactory.isFileTypeSupported(config.fileType)
    ) {
      errors.push(`File type ${config.fileType} is not supported`);
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Obtiene o crea una estrategia para el archivo y configuración dados
   */
  private async getStrategy(
    fileName: string,
    config: LogFileConfig,
  ): Promise<LogStrategy> {
    const cacheKey = this.generateCacheKey(fileName, config);

    let strategy = this.strategyCache.get(cacheKey);

    if (!strategy) {
      // Validar configuración antes de crear estrategia
      const validation = this.validateLoggingConfig(config);
      if (!validation.isValid) {
        throw new Error(
          `Invalid logging configuration: ${validation.errors.join(', ')}`,
        );
      }

      strategy = this.logStrategyFactory.createStrategy(fileName, config);
      await strategy.initialize(fileName, config);

      // Cachear la estrategia inicializada
      this.strategyCache.set(cacheKey, strategy);
    }

    return strategy;
  }

  /**
   * Genera una clave única para el caché basada en fileName y config
   */
  private generateCacheKey(fileName: string, config: LogFileConfig): string {
    const configKey = [
      config.containerName || 'default',
      config.directory || 'default',
      config.fileType || 'auto',
      config.rotateDaily !== false ? 'daily' : 'no-rotation',
      config.maxFileSize || 100,
    ].join('|');

    return `${fileName}::${configKey}`;
  }
}
