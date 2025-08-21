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
 * @fileoverview
 * Servicio de logging sobre Azure Blob Storage basado en **Strategy Pattern**.
 *
 * - Selección automática de estrategia según extensión o `config.fileType`.
 * - Cachea estrategias inicializadas por combinación `fileName + config`.
 * - Expone operaciones de alto nivel: agregar 1..N entradas, leer y consultar stats.
 * - Valida configuración (nombres de contenedor, límite de tamaño, etc.).
 *
 * Estratégias soportadas (vía {@link LogStrategyFactory}):
 * - `LOG`  → texto plano con append (Append Blobs).
 * - `CSV`  → CSV con append (Append Blobs).
 * - `XLSX` → Excel regenerado (Block Blobs).
 *
 * @module sas/services/blob-logging/blob-logging.service
 */
@Injectable()
export class BlobLoggingService {
  /** Caché de estrategias por clave única (fileName + config). */
  private readonly strategyCache = new Map<string, LogStrategy>();

  constructor(private readonly logStrategyFactory: LogStrategyFactory) {}

  /**
   * Agrega **una** entrada de log al archivo indicado.
   *
   * - Crea/recupera la estrategia adecuada.
   * - Valida la entrada a través del formatter subyacente.
   *
   * @param {string} fileName - Nombre base del archivo (con/sin extensión).
   * @param {LogEntry} entry - Entrada de log.
   * @param {LogFileConfig} [config={}] - Configuración (contenedor, directorio, fileType, rotateDaily, etc.).
   * @throws {InternalServerErrorException} Si falla la operación de escritura.
   *
   * @example
   * await blobLoggingService.appendLog(
   *   'audit',
   *   { level: 'INFO', message: 'User login', userId: '42' },
   *   { containerName: 'logs', directory: 'auth', rotateDaily: true }
   * );
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
   * Agrega **múltiples** entradas de log en una sola operación.
   *
   * @param {string} fileName - Nombre base del archivo.
   * @param {BulkLogEntry[]} entries - Entradas con `timestamp` opcional por cada una.
   * @param {LogFileConfig} [config={}] - Configuración de logging.
   * @throws {InternalServerErrorException} Si falla la operación de escritura.
   *
   * @example
   * await blobLoggingService.appendBulkLogs('audit.csv', [
   *   { level: 'INFO', message: 'A', timestamp: new Date() },
   *   { level: 'ERROR', message: 'B' }
   * ], { fileType: LogFileType.CSV });
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
   * Lee los logs (útil para debugging/inspección).
   *
   * - Para `.log`/`.csv`: retorna el contenido como texto.
   * - Para `.xlsx`: retorna un **resumen** (tamaño, entradas, última modificación, modo).
   *
   * @param {string} fileName - Nombre base del archivo.
   * @param {LogFileConfig} [config={}] - Configuración de logging.
   * @returns {Promise<string>} Contenido o resumen, según estrategia.
   * @throws {InternalServerErrorException} Si falla la lectura.
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
   * Obtiene estadísticas del archivo de log:
   * - Existencia, tipo, tamaño (bytes/MB), `lastModified`, `createdAt`.
   *
   * @param {string} fileName - Nombre base del archivo.
   * @param {LogFileConfig} [config={}]
   * @returns {Promise<{exists:boolean; fileType:LogFileType; sizeBytes?:number; sizeMB?:number; lastModified?:Date; createdAt?:string;}>}
   *
   * @example
   * const stats = await blobLoggingService.getLogFileStats('audit', { fileType: LogFileType.LOG });
   * if (stats.exists) console.log(stats.sizeMB);
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
      // Fallback: deducir tipo de archivo de forma interna (usa método de la factory)
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
   * Limpia la caché de estrategias (útil para **tests** o cuando cambian variables de configuración).
   *
   * @example
   * afterEach(() => blobLoggingService.clearStrategyCache());
   */
  clearStrategyCache(): void {
    this.strategyCache.clear();
  }

  /**
   * Retorna información de los formatos soportados por el sistema.
   *
   * @returns {{fileType:LogFileType; extension:string; supportsAppend:boolean; description:string;}[]}
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
   * (Interno) Devuelve el límite superior permitido para `maxFileSize` según el tipo.
   * - LOG/CSV (Append Blobs): 50 GB
   * - XLSX (Block Blobs): 2 GB
   * - Default: 1 GB
   *
   * @param {LogFileConfig} config
   * @returns {number} Límite superior en MB.
   */
  private getMaxFileSizeLimit(config: LogFileConfig): number {
    const fileType = this.logStrategyFactory['determineFileType']('', config);

    switch (fileType) {
      case LogFileType.LOG:
      case LogFileType.CSV:
        return 50000; // 50GB para logs y CSV (Append Blobs)

      case LogFileType.XLSX:
        return 2048; // 2GB para Excel (Block Blobs)

      default:
        return 1024; // 1GB por defecto
    }
  }

  /**
   * Valida una configuración de logging.
   * - `containerName`: minúsculas, números y guiones (estándar Azure).
   * - `directory`: no debe contener `..`.
   * - `maxFileSize`: 1..máximo permitido por tipo.
   * - `fileType`: debe estar soportado por la factory.
   *
   * @param {LogFileConfig} config
   * @returns {{ isValid:boolean; errors:string[] }}
   *
   * @example
   * const { isValid, errors } = blobLoggingService.validateLoggingConfig({ containerName: 'Mi-Container' });
   * // => isValid:false, errors:['Container name must be lowercase alphanumeric with hyphens']
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
    if (config.maxFileSize) {
      const maxAllowed = this.getMaxFileSizeLimit(config);

      if (config.maxFileSize <= 0 || config.maxFileSize > maxAllowed) {
        const fileType = this.logStrategyFactory['determineFileType'](
          '',
          config,
        );
        errors.push(
          `Max file size for ${fileType} files must be between 1MB and ${maxAllowed}MB`,
        );
      }
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
   * (Interno) Obtiene/crea una estrategia para la pareja `fileName` + `config`.
   *
   * - Valida la configuración previa.
   * - Inicializa la estrategia si no existe en caché.
   * - Cachea la instancia para reuso.
   *
   * @param {string} fileName - Nombre base del archivo.
   * @param {LogFileConfig} config - Configuración de logging.
   * @returns {Promise<LogStrategy>} Estrategia inicializada.
   * @throws {Error} Si la configuración es inválida.
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
   * (Interno) Genera una clave única de caché para una combinación `fileName + config`.
   *
   * Clave: `${fileName}::${container|directory|fileType|rotation|maxFileSize}`
   *
   * @param {string} fileName
   * @param {LogFileConfig} config
   * @returns {string} Clave única determinística.
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
