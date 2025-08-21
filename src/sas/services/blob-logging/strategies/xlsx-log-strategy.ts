import { BlockBlobClient } from '@azure/storage-blob';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { LogFileType, LogLevel } from '@src/shared/dto/blob-logging.dto';
import { LogEntry } from '@src/shared/enums/blob-logging.enum';
import { SasPermission } from '@src/shared/enums/sas-permission.enum';
import {
  BulkLogEntry,
  LogFileConfig,
} from '@src/shared/interfaces/services/blob-logging/blob-logging.interface';
import { LogStrategy } from '@src/shared/interfaces/services/blob-logging/log-strategy.interface';
import * as XLSX from 'xlsx';
import { SasService } from '../../sas.service';

/**
 * @fileoverview
 * Estrategia concreta para logs en **Excel (.xlsx)**.
 *
 * - Usa {@link BlockBlobClient} para escribir y leer blobs en Azure.
 * - Soporta **modo dinámico**: genera columnas a partir de `metadata`.
 * - Mantiene un **buffer en memoria** (`contentBuffer`) y lo sincroniza en `flushBuffer()`.
 * - Maneja **rotación automática** por tamaño o fecha.
 * - Serializa y parsea usando librería `xlsx`.
 *
 * @module sas/services/blob-logging/strategies/xlsx-log-strategy
 *
 * @example
 * const strategy = new XlsxLogStrategy(sasService);
 * await strategy.initialize('audit', { rotateDaily: true, maxFileSize: 50 });
 * await strategy.appendLog({ level: 'INFO', message: 'User login', userId: '42' });
 */
@Injectable()
export class XlsxLogStrategy implements LogStrategy {
  /** Cliente para interactuar con Azure Blob. */
  private blockBlobClient: BlockBlobClient;

  /** Nombre de archivo actual (incluye sufijo de fecha y extensión). */
  private fileName: string;

  /** Configuración de la estrategia (rotación, columnas dinámicas, etc.). */
  private config: LogFileConfig;

  /** Flag de inicialización. */
  private initialized = false;

  /** Buffer en memoria con entradas de log acumuladas. */
  private contentBuffer: BulkLogEntry[] = [];

  /** Flag para indicar si las cabeceras dinámicas ya se configuraron. */
  private dynamicHeaderConfigured = false;

  /** Cabeceras por defecto para Excel tradicional. */
  private readonly DEFAULT_EXCEL_HEADERS = [
    'Timestamp',
    'Level',
    'Request ID',
    'User ID',
    'Session ID',
    'Message',
    'Metadata',
  ];

  /** Cache de cabeceras dinámicas generadas a partir de `metadata`. */
  private cachedDynamicHeaders: string[] | null = null;

  constructor(private readonly sasService: SasService) {}

  /**
   * Retorna el tipo de archivo soportado.
   * @returns {LogFileType} `XLSX`
   */
  getFileType(): LogFileType {
    return LogFileType.XLSX;
  }

  /**
   * Inicializa la estrategia:
   * - Genera nombre de archivo.
   * - Crea cliente de blob.
   * - Carga contenido existente al buffer.
   *
   * @param {string} fileName - Nombre base de archivo.
   * @param {LogFileConfig} config - Configuración de logging.
   */
  async initialize(fileName: string, config: LogFileConfig): Promise<void> {
    this.fileName = this.generateLogFileName(fileName, config);
    this.config = config;

    this.blockBlobClient = await this.createBlockBlobClient();

    await this.loadExistingContent();

    this.initialized = true;
  }

  /**
   * Agrega una entrada de log.
   *
   * - Valida entrada.
   * - Configura cabeceras dinámicas si aplica.
   * - Maneja rotación por tamaño.
   * - Agrega entrada al buffer y sincroniza con `flushBuffer()`.
   *
   * @param {LogEntry} entry - Entrada de log.
   */
  async appendLog(entry: LogEntry): Promise<void> {
    this.ensureInitialized();

    if (!this.validateEntry(entry)) {
      throw new Error(`Invalid log entry for ${this.getFileType()} format`);
    }

    if (this.config.dynamicColumns && !this.dynamicHeaderConfigured) {
      this.setupDynamicMode(entry);
    }

    if (await this.needsRotation()) {
      await this.handleXlsxRotation();
    }

    const bulkEntry: BulkLogEntry = {
      ...entry,
      timestamp: new Date(),
    };
    this.contentBuffer.push(bulkEntry);

    await this.flushBuffer();
  }

  /**
   * Agrega múltiples entradas de log en lote.
   *
   * @param {BulkLogEntry[]} entries - Entradas de log.
   */
  async appendBulkLogs(entries: BulkLogEntry[]): Promise<void> {
    this.ensureInitialized();

    for (const entry of entries) {
      if (!this.validateEntry(entry)) {
        throw new Error(`Invalid log entry for ${this.getFileType()} format`);
      }
    }

    if (
      this.config.dynamicColumns &&
      !this.dynamicHeaderConfigured &&
      entries.length > 0
    ) {
      this.setupDynamicMode(entries[0]);
    }

    if (await this.needsRotation()) {
      await this.handleXlsxRotation();
    }

    this.contentBuffer.push(...entries);

    await this.flushBuffer();
  }

  /**
   * Retorna un resumen en texto del archivo Excel (no su contenido en sí).
   *
   * Incluye:
   * - Tamaño en MB.
   * - Número de entradas.
   * - Fecha de última modificación.
   * - Modo usado (dinámico o tradicional).
   */
  async readLogs(): Promise<string> {
    this.ensureInitialized();

    try {
      const exists = await this.blockBlobClient.exists();
      if (!exists) {
        return 'Excel log file does not exist';
      }

      const stats = await this.getLogFileStats();

      return (
        `Excel log file exists. Size: ${stats.sizeMB?.toFixed(2)}MB. ` +
        `Entries: ${this.contentBuffer.length}. ` +
        `Last modified: ${stats.lastModified?.toISOString()}. ` +
        `Mode: ${this.config.dynamicColumns ? 'Dynamic' : 'Traditional'}. ` +
        `Use Excel application or download to view formatted content.`
      );
    } catch (error: any) {
      console.error('Error reading Excel logs:', error);
      throw new InternalServerErrorException(
        `Failed to read Excel logs: ${error.message}`,
      );
    }
  }

  /**
   * Obtiene estadísticas del archivo actual en Azure Blob.
   *
   * @returns {Promise<{ exists: boolean; fileType: LogFileType; sizeBytes?: number; sizeMB?: number; lastModified?: Date; createdAt?: string; }>}
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

    try {
      const exists = await this.blockBlobClient.exists();
      if (!exists) {
        return {
          exists: false,
          fileType: LogFileType.XLSX,
        };
      }

      const properties = await this.blockBlobClient.getProperties();

      return {
        exists: true,
        fileType: LogFileType.XLSX,
        sizeBytes: properties.contentLength || 0,
        sizeMB: (properties.contentLength || 0) / (1024 * 1024),
        lastModified: properties.lastModified,
        createdAt: properties.metadata?.createdAt,
      };
    } catch (error: any) {
      console.error('Error getting Excel blob stats:', error);
      return {
        exists: false,
        fileType: LogFileType.XLSX,
      };
    }
  }

  /**
   * Configura cabeceras dinámicas en base a una entrada de ejemplo.
   * @param {LogEntry} sampleEntry - Entrada con `metadata`.
   */
  private setupDynamicMode(sampleEntry: LogEntry): void {
    if (sampleEntry.metadata) {
      const metadataKeys = Object.keys(sampleEntry.metadata);
      this.cachedDynamicHeaders = metadataKeys.map((key) =>
        this.capitalizeHeader(key),
      );

      this.dynamicHeaderConfigured = true;
    }
  }

  /** Capitaliza nombres de cabecera (`user_id` -> `User Id`). */
  private capitalizeHeader(key: string): string {
    return key
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Crea el cliente de BlockBlob con permisos limitados (READ, WRITE, CREATE).
   */
  private async createBlockBlobClient(): Promise<BlockBlobClient> {
    const containerName = this.config.containerName || 'logs';
    const directory = this.config.directory || 'application';
    const fullPath = directory.endsWith('/')
      ? `${directory}${this.fileName}`
      : `${directory}/${this.fileName}`;

    try {
      const sasData = await this.sasService.generateSasTokenWithParams(
        containerName,
        fullPath,
        [SasPermission.READ, SasPermission.WRITE, SasPermission.CREATE],
        60,
      );

      return new BlockBlobClient(sasData.sasUrl);
    } catch (error: any) {
      console.error('Error creating block blob client:', error);
      throw new InternalServerErrorException(
        `Error accessing Excel log file: ${error.message}`,
      );
    }
  }

  /**
   * Carga contenido existente del Excel a buffer (si ya existe en Azure).
   * - Detecta cabeceras tradicionales o dinámicas.
   * - Reconstruye el buffer como lista de `BulkLogEntry`.
   */
  private async loadExistingContent(): Promise<void> {
    try {
      const exists = await this.blockBlobClient.exists();
      if (!exists) {
        this.contentBuffer = [];
        return;
      }

      const downloadResponse = await this.blockBlobClient.downloadToBuffer();

      const workbook = XLSX.read(downloadResponse, {
        type: 'buffer',
        cellDates: true,
        cellStyles: false,
      });

      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        this.contentBuffer = [];
        return;
      }

      const worksheet = workbook.Sheets[firstSheetName];

      // Verificación de headers
      const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
      const firstRowCells: string[] = [];
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
        const cell = worksheet[cellAddress];
        if (cell && cell.v) firstRowCells.push(String(cell.v));
      }

      const hasTraditionalHeaders = firstRowCells.some((header) =>
        this.DEFAULT_EXCEL_HEADERS.includes(header),
      );

      let headersToUse: string[];
      if (!hasTraditionalHeaders && firstRowCells.length > 0) {
        headersToUse = firstRowCells;
        this.cachedDynamicHeaders = firstRowCells;
      } else {
        headersToUse = this.DEFAULT_EXCEL_HEADERS;
      }

      const jsonData = XLSX.utils.sheet_to_json(worksheet, {
        header: headersToUse,
        range: 1,
      });

      this.contentBuffer = jsonData
        .map((row: any): BulkLogEntry => {
          if (this.cachedDynamicHeaders) {
            const metadata: Record<string, any> = {};
            this.cachedDynamicHeaders.forEach((header) => {
              const originalKey = header.toLowerCase().replace(/ /g, '_');
              metadata[originalKey] = row[header];
            });
            return {
              level: LogLevel.INFO,
              message: 'Data entry',
              metadata,
              timestamp: new Date(),
            };
          } else {
            return {
              level: this.parseLogLevel(row['Level']) || LogLevel.INFO,
              message: row['Message'] || '',
              metadata: row['Metadata']
                ? this.safeParseJSON(row['Metadata'])
                : undefined,
              userId: row['User ID'] || undefined,
              sessionId: row['Session ID'] || undefined,
              requestId: row['Request ID'] || undefined,
              timestamp: row['Timestamp']
                ? new Date(row['Timestamp'])
                : new Date(),
            };
          }
        })
        .filter((entry) => entry.message);
    } catch (error: any) {
      console.warn(
        'Could not load existing Excel content, starting fresh:',
        error.message,
      );
      this.contentBuffer = [];
    }
  }

  /**
   * Escribe el buffer completo como archivo Excel a Azure Storage.
   */
  private async flushBuffer(): Promise<void> {
    if (this.contentBuffer.length === 0) return;

    try {
      const workbook = XLSX.utils.book_new();

      let excelData: any[];
      let headersToUse: string[];

      if (this.config.dynamicColumns && this.cachedDynamicHeaders) {
        headersToUse = this.cachedDynamicHeaders;
        excelData = this.contentBuffer.map((entry) => {
          const rowData: Record<string, any> = {};
          if (entry.metadata) {
            Object.keys(entry.metadata).forEach((key) => {
              const headerKey = this.capitalizeHeader(key);
              rowData[headerKey] = entry.metadata![key];
            });
          }
          return rowData;
        });
      } else {
        headersToUse = this.DEFAULT_EXCEL_HEADERS;
        excelData = this.contentBuffer.map((entry) => ({
          Timestamp: entry.timestamp
            ? entry.timestamp.toISOString()
            : new Date().toISOString(),
          Level: entry.level,
          'Request ID': entry.requestId || '',
          'User ID': entry.userId || '',
          'Session ID': entry.sessionId || '',
          Message: entry.message,
          Metadata: entry.metadata ? JSON.stringify(entry.metadata) : '',
        }));
      }

      const worksheet = XLSX.utils.json_to_sheet(excelData, {
        header: headersToUse,
      });
      worksheet['!cols'] = this.generateColumnWidths(headersToUse);

      // Estilizar cabecera
      const headerRange = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:A1');
      for (let col = headerRange.s.c; col <= headerRange.e.c; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
        if (!worksheet[cellAddress]) continue;
        worksheet[cellAddress].s = {
          font: { bold: true },
          fill: { fgColor: { rgb: 'DDDDDD' } },
          alignment: { horizontal: 'center' },
        };
      }

      XLSX.utils.book_append_sheet(workbook, worksheet, 'Logs');

      const excelBuffer = XLSX.write(workbook, {
        type: 'buffer',
        bookType: 'xlsx',
        compression: true,
      }) as Buffer;

      await this.blockBlobClient.upload(excelBuffer, excelBuffer.length, {
        blobHTTPHeaders: {
          blobContentType:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
        metadata: {
          createdBy: 'LoggingService',
          lastUpdated: new Date().toISOString(),
          logType: 'application-log',
          fileType: LogFileType.XLSX,
          serviceVersion: '2.0',
          entriesCount: this.contentBuffer.length.toString(),
          isExcelFile: 'true',
          mode: this.config.dynamicColumns ? 'dynamic' : 'traditional',
        },
      });
    } catch (error: any) {
      console.error('Error flushing Excel buffer:', error);
      throw new InternalServerErrorException(
        `Failed to write Excel content: ${error.message}`,
      );
    }
  }

  /** Genera anchos de columna según cabecera (fechas, descripciones, etc.). */
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

  /** Verifica si el archivo necesita rotación por tamaño. */
  private async needsRotation(): Promise<boolean> {
    try {
      const properties = await this.blockBlobClient.getProperties();
      const currentSizeMB = (properties.contentLength || 0) / (1024 * 1024);
      const maxSizeMB = this.config.maxFileSize || 100;
      return currentSizeMB >= maxSizeMB;
    } catch {
      return false;
    }
  }

  /** Maneja rotación: genera nuevo archivo y resetea buffer/cabeceras. */
  private async handleXlsxRotation(): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const [baseName] = this.fileName.split('.');
    const rotatedFileName = `${baseName}-rotated-${timestamp}.xlsx`;

    this.contentBuffer = [];
    this.dynamicHeaderConfigured = false;
    this.cachedDynamicHeaders = null;
    this.fileName = rotatedFileName;
    this.blockBlobClient = await this.createBlockBlobClient();
  }

  /** Genera nombre de archivo con fecha si rotación diaria está activa. */
  private generateLogFileName(
    baseFileName: string,
    config: LogFileConfig,
  ): string {
    const now = new Date();
    const cleanName = baseFileName.replace(/\.(log|csv|xlsx)$/, '');
    let fileName = cleanName;
    if (config.rotateDaily !== false) {
      const dateStr = now.toISOString().split('T')[0];
      fileName = `${cleanName}-${dateStr}`;
    }
    return `${fileName}.xlsx`;
  }

  /** Valida entrada mínima (`level` y `message`). */
  private validateEntry(entry: LogEntry | BulkLogEntry): boolean {
    return !!(entry.level && entry.message);
  }

  /** Asegura que la estrategia esté inicializada. */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error(
        'XLSX Strategy not initialized. Call initialize() first.',
      );
    }
  }

  /** Parseo seguro de JSON (retorna `undefined` si falla). */
  private safeParseJSON(jsonString: string): any {
    try {
      return JSON.parse(jsonString);
    } catch {
      return undefined;
    }
  }

  /** Convierte string en LogLevel (fallback a INFO). */
  private parseLogLevel(levelString: string): LogLevel | undefined {
    if (!levelString) return undefined;
    const upperLevel = levelString.toUpperCase();
    return Object.values(LogLevel).includes(upperLevel as LogLevel)
      ? (upperLevel as LogLevel)
      : LogLevel.INFO;
  }

  /**
   * Libera recursos y sincroniza buffer pendiente.
   */
  async cleanup(): Promise<void> {
    if (this.contentBuffer.length > 0) {
      await this.flushBuffer();
    }
    this.contentBuffer = [];
  }
}
