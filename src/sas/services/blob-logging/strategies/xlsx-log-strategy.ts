import { BlockBlobClient } from '@azure/storage-blob';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { LogFileType } from '@src/shared/dto/blob-logging.dto';
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
 * Estrategia especializada para archivos Excel (.xlsx)
 */
@Injectable()
export class XlsxLogStrategy implements LogStrategy {
  private blockBlobClient: BlockBlobClient;
  private fileName: string;
  private config: LogFileConfig;
  private initialized = false;
  private contentBuffer: BulkLogEntry[] = []; // Buffer en memoria para acumular entradas
  private readonly EXCEL_HEADERS = [
    'Timestamp',
    'Level',
    'Request ID',
    'User ID',
    'Session ID',
    'Message',
    'Metadata',
  ];

  constructor(private readonly sasService: SasService) {}

  getFileType(): LogFileType {
    return LogFileType.XLSX;
  }

  async initialize(fileName: string, config: LogFileConfig): Promise<void> {
    this.fileName = this.generateLogFileName(fileName, config);
    this.config = config;
    this.blockBlobClient = await this.createBlockBlobClient();

    // Cargar contenido existente al buffer
    await this.loadExistingContent();

    this.initialized = true;
  }

  async appendLog(entry: LogEntry): Promise<void> {
    this.ensureInitialized();

    if (!this.validateEntry(entry)) {
      throw new Error(`Invalid log entry for ${this.getFileType()} format`);
    }

    // Verificar rotación antes de escribir
    if (await this.needsRotation()) {
      await this.handleXlsxRotation();
    }

    // Agregar al buffer en memoria (convertir LogEntry a BulkLogEntry)
    const bulkEntry: BulkLogEntry = {
      ...entry,
      timestamp: new Date(), // Agregar timestamp actual
    };
    this.contentBuffer.push(bulkEntry);

    // Escribir inmediatamente para entries individuales
    await this.flushBuffer();
  }

  async appendBulkLogs(entries: BulkLogEntry[]): Promise<void> {
    this.ensureInitialized();

    // Validar todas las entradas
    for (const entry of entries) {
      if (!this.validateEntry(entry)) {
        throw new Error(`Invalid log entry for ${this.getFileType()} format`);
      }
    }

    // Verificar rotación antes de escribir
    if (await this.needsRotation()) {
      await this.handleXlsxRotation();
    }

    // Agregar todas las entradas al buffer
    this.contentBuffer.push(...entries);

    // Escribir todo el contenido de una vez (más eficiente para bulk)
    await this.flushBuffer();
  }

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
        `Use Excel application or download to view formatted content.`
      );
    } catch (error: any) {
      console.error('Error reading Excel logs:', error);
      throw new InternalServerErrorException(
        `Failed to read Excel logs: ${error.message}`,
      );
    }
  }

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
   * Crea el cliente de Block Blob para Azure Storage
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
        60, // 60 minutos de expiración
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
   * Carga el contenido existente del archivo Excel al buffer
   */
  private async loadExistingContent(): Promise<void> {
    try {
      const exists = await this.blockBlobClient.exists();
      if (!exists) {
        this.contentBuffer = [];
        return;
      }

      const downloadResponse = await this.blockBlobClient.downloadToBuffer();

      // Parsear el archivo Excel existente
      const workbook = XLSX.read(downloadResponse, {
        type: 'buffer',
        cellDates: true,
        cellStyles: false,
      });

      // Obtener la primera hoja (assumimos que los logs están en la primera hoja)
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        this.contentBuffer = [];
        return;
      }

      const worksheet = workbook.Sheets[firstSheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, {
        header: this.EXCEL_HEADERS,
        range: 1, // Saltar header row
      });

      // Convertir los datos de Excel de vuelta a BulkLogEntry format
      this.contentBuffer = jsonData
        .map((row: any) => ({
          level: row['Level'] || 'INFO',
          message: row['Message'] || '',
          metadata: row['Metadata']
            ? this.safeParseJSON(row['Metadata'])
            : undefined,
          userId: row['User ID'] || undefined,
          sessionId: row['Session ID'] || undefined,
          requestId: row['Request ID'] || undefined,
          timestamp: row['Timestamp'] ? new Date(row['Timestamp']) : undefined,
        }))
        .filter((entry) => entry.message); // Filtrar entradas vacías
    } catch (error: any) {
      console.warn(
        'Could not load existing Excel content, starting fresh:',
        error.message,
      );
      this.contentBuffer = [];
    }
  }

  /**
   * Escribe el buffer completo como archivo Excel a Azure Storage
   */
  private async flushBuffer(): Promise<void> {
    if (this.contentBuffer.length === 0) {
      return;
    }

    try {
      // Crear workbook nuevo
      const workbook = XLSX.utils.book_new();

      // Convertir entradas del buffer a formato para Excel
      const excelData = this.contentBuffer.map((entry) => ({
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

      // Crear worksheet con los datos
      const worksheet = XLSX.utils.json_to_sheet(excelData, {
        header: this.EXCEL_HEADERS,
      });

      // Configurar ancho de columnas para mejor visualización
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

      // Aplicar formato a headers
      const headerRange = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:G1');
      for (let col = headerRange.s.c; col <= headerRange.e.c; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
        if (!worksheet[cellAddress]) continue;

        worksheet[cellAddress].s = {
          font: { bold: true },
          fill: { fgColor: { rgb: 'DDDDDD' } },
          alignment: { horizontal: 'center' },
        };
      }

      // Agregar worksheet al workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Logs');

      // Convertir a buffer
      const excelBuffer = XLSX.write(workbook, {
        type: 'buffer',
        bookType: 'xlsx',
        compression: true,
      }) as Buffer;

      // Subir a Azure Storage
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
        },
      });
    } catch (error: any) {
      console.error('Error flushing Excel buffer:', error);
      throw new InternalServerErrorException(
        `Failed to write Excel content: ${error.message}`,
      );
    }
  }

  /**
   * Verifica si el archivo necesita rotación basado en tamaño
   */
  private async needsRotation(): Promise<boolean> {
    try {
      const properties = await this.blockBlobClient.getProperties();
      const currentSizeMB = (properties.contentLength || 0) / (1024 * 1024);
      const maxSizeMB = this.config.maxFileSize || 100;

      return currentSizeMB >= maxSizeMB;
    } catch (error) {
      return false;
    }
  }

  /**
   * Maneja la rotación específica para archivos Excel
   */
  private async handleXlsxRotation(): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const [baseName] = this.fileName.split('.');
    const rotatedFileName = `${baseName}-rotated-${timestamp}.xlsx`;

    console.log(
      `Excel log file rotated from ${this.fileName} to ${rotatedFileName}`,
    );

    // Limpiar buffer y crear nuevo cliente
    this.contentBuffer = [];
    this.fileName = rotatedFileName;
    this.blockBlobClient = await this.createBlockBlobClient();
  }

  /**
   * Genera el nombre del archivo con fecha si rotación diaria está habilitada
   */
  private generateLogFileName(
    baseFileName: string,
    config: LogFileConfig,
  ): string {
    const now = new Date();
    const cleanName = baseFileName.replace(/\.(log|csv|xlsx)$/, '');

    let fileName = cleanName;

    // Agregar fecha si rotación diaria está habilitada
    if (config.rotateDaily !== false) {
      const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
      fileName = `${cleanName}-${dateStr}`;
    }

    return `${fileName}.xlsx`;
  }

  /**
   * Valida que la entrada de log sea válida
   */
  private validateEntry(entry: LogEntry | BulkLogEntry): boolean {
    return !!(entry.level && entry.message);
  }

  /**
   * Verifica que la estrategia esté inicializada
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error(
        'XLSX Strategy not initialized. Call initialize() first.',
      );
    }
  }

  /**
   * Parsea JSON de forma segura, retornando undefined si falla
   */
  private safeParseJSON(jsonString: string): any {
    try {
      return JSON.parse(jsonString);
    } catch {
      return undefined;
    }
  }

  /**
   * Limpia recursos si es necesario (para cleanup explícito)
   */
  async cleanup(): Promise<void> {
    if (this.contentBuffer.length > 0) {
      await this.flushBuffer();
    }
    this.contentBuffer = [];
  }
}
