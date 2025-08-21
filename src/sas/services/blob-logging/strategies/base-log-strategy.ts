import { Injectable } from '@nestjs/common';
import { LogFileType } from '@src/shared/dto/blob-logging.dto';
import { LogEntry } from '@src/shared/enums/blob-logging.enum';
import {
  BulkLogEntry,
  LogFileConfig,
} from '@src/shared/interfaces/services/blob-logging/blob-logging.interface';
import { LogFormatter } from '@src/shared/interfaces/services/blob-logging/log-formatter.interface';
import { LogStrategy } from '@src/shared/interfaces/services/blob-logging/log-strategy.interface';
import { LogWriter } from '@src/shared/interfaces/services/blob-logging/log-writer.interface';

/**
 * @fileoverview
 * Clase base abstracta para implementar estrategias de logging sobre Azure Blob.
 *
 * - Aplica el patrón **Template Method**: define el flujo genérico y delega
 *   en subclases el detalle de extensión y tipo de archivo.
 * - Combina {@link LogFormatter} y {@link LogWriter} para formatear y escribir.
 * - Maneja:
 *   - Inicialización de archivos.
 *   - Cabeceras dinámicas (modo dinámico en CSV).
 *   - Validación de entradas.
 *   - Rotación de archivos de log (por tamaño o por fecha).
 *
 * Las estrategias concretas (CSV, LOG, XLSX) deben extender esta clase
 * e implementar los métodos abstractos `getFileType()` y `getFileExtension()`.
 *
 * @module sas/services/blob-logging/strategies/base-log-strategy
 */
@Injectable()
export abstract class BaseLogStrategy implements LogStrategy {
  /** Nombre del archivo de log actual (con extensión y sufijo de fecha si aplica). */
  protected fileName: string;

  /** Configuración asociada al archivo de log. */
  protected config: LogFileConfig;

  /** Flag para marcar si la estrategia ya fue inicializada. */
  protected initialized = false;

  /** Indica si las cabeceras dinámicas ya fueron configuradas. */
  private dynamicHeaderConfigured = false;

  constructor(
    protected readonly formatter: LogFormatter,
    protected readonly writer: LogWriter,
  ) {}

  /**
   * Retorna el tipo de archivo que maneja la estrategia concreta.
   * Debe implementarse en cada subclase (CSV, LOG, XLSX).
   */
  abstract getFileType(): LogFileType;

  /**
   * Inicializa la estrategia:
   * - Genera el nombre de archivo con sufijo de fecha si aplica.
   * - Inicializa el `writer`.
   * - Escribe cabeceras si corresponde (según tipo y configuración).
   *
   * @param {string} fileName - Nombre base del archivo.
   * @param {LogFileConfig} config - Configuración de logging (rotación, columnas dinámicas, etc.).
   */
  async initialize(fileName: string, config: LogFileConfig): Promise<void> {
    this.fileName = this.generateLogFileName(fileName, config);
    this.config = config;

    await this.writer.initialize(this.fileName, config);

    if (await this.isNewFile()) {
      const fileType = this.getFileType();

      if (fileType === LogFileType.CSV && this.formatter.formatHeader) {
        let header: string;

        if (config.dynamicColumns) {
          this.dynamicHeaderConfigured = false;
        } else {
          header = this.formatter.formatHeader(false);
          await this.writer.writeEntry(header);
        }
      } else if (
        fileType !== LogFileType.CSV &&
        !config.dynamicColumns &&
        this.formatter.formatHeader
      ) {
        const header = this.formatter.formatHeader();
        await this.writer.writeEntry(header);
      }
    }

    this.initialized = true;
  }

  /**
   * Agrega una entrada de log al archivo.
   * - Valida que la estrategia esté inicializada.
   * - Valida la entrada con el `formatter`.
   * - Configura cabeceras dinámicas si aplica.
   * - Maneja rotación si es necesario.
   * - Escribe la entrada formateada.
   *
   * @param {LogEntry} entry - Entrada de log.
   * @throws {Error} Si la entrada no es válida.
   */
  async appendLog(entry: LogEntry): Promise<void> {
    this.ensureInitialized();

    if (!this.formatter.validateEntry(entry)) {
      throw new Error(`Invalid log entry for ${this.getFileType()} format`);
    }

    if (this.config.dynamicColumns && !this.dynamicHeaderConfigured) {
      await this.setupDynamicMode(entry);
    }

    if (await this.writer.needsRotation()) {
      await this.handleRotation();
    }

    const formattedContent = this.formatter.formatEntry(entry);
    await this.writer.writeEntry(formattedContent);
  }

  /**
   * Agrega múltiples entradas de log en lote.
   *
   * @param {BulkLogEntry[]} entries - Entradas de log.
   * @throws {Error} Si alguna entrada es inválida.
   */
  async appendBulkLogs(entries: BulkLogEntry[]): Promise<void> {
    this.ensureInitialized();

    for (const entry of entries) {
      if (!this.formatter.validateEntry(entry)) {
        throw new Error(`Invalid log entry for ${this.getFileType()} format`);
      }
    }

    if (
      this.config.dynamicColumns &&
      !this.dynamicHeaderConfigured &&
      entries.length > 0
    ) {
      await this.setupDynamicMode(entries[0]);
    }

    if (await this.writer.needsRotation()) {
      await this.handleRotation();
    }

    const formattedContent = this.formatter.formatBulkEntries(entries);
    await this.writer.writeBulk(formattedContent);
  }

  /**
   * Lee todo el contenido del archivo de logs.
   * @returns {Promise<string>} Contenido en texto/JSON serializado.
   */
  async readLogs(): Promise<string> {
    this.ensureInitialized();
    return await this.writer.readContent();
  }

  /**
   * Obtiene estadísticas del archivo de log actual.
   * Incluye si existe, tamaño en bytes/MB y fechas.
   *
   * @returns {Promise<{
   *   exists: boolean;
   *   fileType: LogFileType;
   *   sizeBytes?: number;
   *   sizeMB?: number;
   *   lastModified?: Date;
   *   createdAt?: string;
   * }>}
   */
  async getLogFileStats(): Promise<{
    exists: boolean;
    fileType: LogFileType;
    sizeBytes?: number;
    sizeMB?: number;
    lastModified?: Date;
    createdAt?: string;
  }> {
    this.ensureInitialized();
    const stats = await this.writer.getStats();

    return {
      ...stats,
      fileType: this.getFileType(),
    };
  }

  /**
   * Configura cabeceras dinámicas (solo para CSV).
   * Usa la primera entrada como muestra (`sampleEntry`).
   *
   * @param {LogEntry} sampleEntry - Entrada de ejemplo con `metadata`.
   */
  private async setupDynamicMode(sampleEntry: LogEntry): Promise<void> {
    const fileType = this.getFileType();

    if (
      fileType === LogFileType.CSV &&
      this.formatter.formatHeader &&
      sampleEntry.metadata
    ) {
      const dynamicHeader = this.formatter.formatHeader(true, sampleEntry);

      if (dynamicHeader) {
        await this.writer.writeEntry(dynamicHeader);
      }

      this.dynamicHeaderConfigured = true;
    }
  }

  /**
   * Verifica que la estrategia esté inicializada antes de operar.
   * @throws {Error} Si no ha sido inicializada.
   */
  protected ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('Strategy not initialized. Call initialize() first.');
    }
  }

  /**
   * Determina si el archivo de log es nuevo (no existe todavía).
   * @returns {Promise<boolean>} `true` si no existe aún.
   */
  private async isNewFile(): Promise<boolean> {
    const stats = await this.writer.getStats();
    return !stats.exists;
  }

  /**
   * Maneja la rotación de logs:
   * - Genera nuevo archivo con fecha.
   * - Reinicia modo dinámico.
   * - Escribe cabecera inicial si aplica.
   */
  protected async handleRotation(): Promise<void> {
    const newFileName = await this.writer.rotate();

    this.dynamicHeaderConfigured = false;

    if (this.formatter.resetDynamicMode) {
      this.formatter.resetDynamicMode();
    }

    const fileType = this.getFileType();

    if (fileType === LogFileType.CSV && this.formatter.formatHeader) {
      if (!this.config.dynamicColumns) {
        const header = this.formatter.formatHeader(false);
        await this.writer.writeEntry(header);
      }
    } else if (this.formatter.formatHeader && !this.config.dynamicColumns) {
      const header = this.formatter.formatHeader();
      await this.writer.writeEntry(header);
    }
  }

  /**
   * Genera un nombre de archivo con base en:
   * - Nombre base limpio (`.log`, `.csv`, `.xlsx` removidos).
   * - Sufijo de fecha si `rotateDaily` no está deshabilitado.
   * - Extensión según la estrategia concreta.
   *
   * @param {string} baseFileName - Nombre base.
   * @param {LogFileConfig} config - Configuración de logging.
   * @returns {string} Nombre completo con extensión y sufijo.
   */
  protected generateLogFileName(
    baseFileName: string,
    config: LogFileConfig,
  ): string {
    const now = new Date();
    const cleanName = this.cleanBaseFileName(baseFileName);

    let fileName = cleanName;

    if (config.rotateDaily !== false) {
      const dateStr = now.toISOString().split('T')[0];
      fileName = `${cleanName}-${dateStr}`;
    }

    const extension = this.getFileExtension();
    fileName += extension;

    return fileName;
  }

  /**
   * Limpia un nombre base de extensiones conocidas (`.log`, `.csv`, `.xlsx`).
   *
   * @param {string} fileName - Nombre de archivo.
   * @returns {string} Nombre limpio sin extensión.
   */
  private cleanBaseFileName(fileName: string): string {
    return fileName.replace(/\.(log|csv|xlsx)$/, '');
  }

  /**
   * Cada subclase debe implementar cómo obtener la extensión de archivo.
   * Ejemplo:
   * - CSV -> `.csv`
   * - LOG -> `.log`
   * - XLSX -> `.xlsx`
   */
  protected abstract getFileExtension(): string;
}
