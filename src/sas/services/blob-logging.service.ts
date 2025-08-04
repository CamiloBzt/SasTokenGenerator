import { AnonymousCredential, AppendBlobClient } from '@azure/storage-blob';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { LogFileType } from '@src/shared/dto/blob-logging.dto';
import { LogEntry } from '@src/shared/enums/blob-logging.enum';
import { SasPermission } from '@src/shared/enums/sas-permission.enum';
import {
  BulkLogEntry,
  LogFileConfig,
} from '@src/shared/interfaces/services/blob-logging/blob-logging.interface';
import { SasService } from './sas.service';

@Injectable()
export class LoggingService {
  private readonly DEFAULT_CONTAINER = 'logs';
  private readonly DEFAULT_DIRECTORY = 'application';
  private readonly MAX_APPEND_BLOCK_SIZE = 4 * 1024 * 1024; // 4MB Azure limit

  constructor(private readonly sasService: SasService) {}

  /**
   * Determina el tipo de archivo basado en la extensión o configuración
   */
  private determineFileType(
    fileName: string,
    config: LogFileConfig = {},
  ): LogFileType {
    // Si se especifica explícitamente en config, usar ese
    if (config.fileType) {
      return config.fileType;
    }

    // Detectar por extensión
    if (fileName.endsWith('.csv')) {
      return LogFileType.CSV;
    } else if (fileName.endsWith('.xlsx')) {
      return LogFileType.XLSX;
    }

    // Default a LOG
    return LogFileType.LOG;
  }

  /**
   * Limpia el nombre base del archivo removiendo extensiones
   */
  private cleanBaseFileName(fileName: string): string {
    return fileName.replace(/\.(log|csv|xlsx)$/, '');
  }

  /**
   * Genera nombre de archivo de log basado en configuración y tipo
   */
  private generateLogFileName(
    baseFileName: string,
    config: LogFileConfig = {},
  ): string {
    const now = new Date();

    // Limpiar nombre base
    const cleanName = this.cleanBaseFileName(baseFileName);

    // Determinar tipo de archivo ANTES de generar el nombre
    const fileType = this.determineFileType(baseFileName, config);

    let fileName = cleanName;

    // Si rotación diaria está habilitada, agregar fecha
    if (config.rotateDaily !== false) {
      const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
      fileName = `${cleanName}-${dateStr}`;
    }

    // Asegurar extensión correcta
    const extensions = {
      [LogFileType.LOG]: '.log',
      [LogFileType.CSV]: '.csv',
      [LogFileType.XLSX]: '.xlsx',
    };

    const extension = extensions[fileType];
    fileName += extension;

    return fileName;
  }

  /**
   * Construye la ruta completa del archivo de log
   */
  private buildLogFilePath(
    fileName: string,
    config: LogFileConfig = {},
  ): string {
    const directory = config.directory || this.DEFAULT_DIRECTORY;
    return directory.endsWith('/')
      ? `${directory}${fileName}`
      : `${directory}/${fileName}`;
  }

  /**
   * Formatea una entrada de log según el tipo de archivo
   */
  private formatLogEntry(entry: LogEntry, fileType: LogFileType): string {
    const timestamp = new Date().toISOString();

    switch (fileType) {
      case LogFileType.CSV:
        return this.formatAsCSV(entry, timestamp);
      case LogFileType.XLSX:
        // Para XLSX, formateamos como CSV y luego se convierte
        return this.formatAsCSV(entry, timestamp);
      case LogFileType.LOG:
      default:
        return this.formatAsLog(entry, timestamp);
    }
  }

  /**
   * Formatea entrada como texto de log tradicional
   */
  private formatAsLog(entry: LogEntry, timestamp: string): string {
    let logLine = `[${timestamp}] [${entry.level}]`;

    if (entry.requestId) {
      logLine += ` [${entry.requestId}]`;
    }

    if (entry.userId) {
      logLine += ` [User:${entry.userId}]`;
    }

    if (entry.sessionId) {
      logLine += ` [Session:${entry.sessionId}]`;
    }

    logLine += ` ${entry.message}`;

    if (entry.metadata && Object.keys(entry.metadata).length > 0) {
      logLine += ` | Metadata: ${JSON.stringify(entry.metadata)}`;
    }

    return logLine + '\n';
  }

  /**
   * Formatea entrada como CSV
   */
  private formatAsCSV(entry: LogEntry, timestamp: string): string {
    const escapeCsvField = (field: string): string => {
      if (field.includes(',') || field.includes('"') || field.includes('\n')) {
        return `"${field.replace(/"/g, '""')}"`;
      }
      return field;
    };

    const fields = [
      timestamp,
      entry.level,
      entry.requestId || '',
      entry.userId || '',
      entry.sessionId || '',
      escapeCsvField(entry.message),
      entry.metadata ? escapeCsvField(JSON.stringify(entry.metadata)) : '',
    ];

    return fields.join(',') + '\n';
  }

  /**
   * Genera header CSV
   */
  private generateCSVHeader(): string {
    return 'timestamp,level,requestId,userId,sessionId,message,metadata\n';
  }

  /**
   * Obtiene o crea un AppendBlobClient
   */
  private async getOrCreateAppendBlob(
    fileName: string,
    config: LogFileConfig = {},
  ): Promise<AppendBlobClient> {
    const containerName = config.containerName || this.DEFAULT_CONTAINER;
    const fullPath = this.buildLogFilePath(fileName, config);

    try {
      // Generar SAS token con permisos necesarios
      const sasData = await this.sasService.generateSasTokenWithParams(
        containerName,
        fullPath,
        [
          SasPermission.READ,
          SasPermission.WRITE,
          SasPermission.CREATE,
          SasPermission.ADD,
        ],
        60, // 60 minutos de expiración
      );

      // Usar directamente la sasUrl que ya viene construida del SasService
      const appendBlobClient = new AppendBlobClient(
        sasData.sasUrl,
        new AnonymousCredential(),
      );

      // Verificar si el blob existe, si no, crearlo
      const exists = await appendBlobClient.exists();
      if (!exists) {
        const fileType = this.determineFileType(fileName, config);

        // Determinar content type basado en el tipo de archivo
        const contentTypes = {
          [LogFileType.LOG]: 'text/plain; charset=utf-8',
          [LogFileType.CSV]: 'text/csv; charset=utf-8',
          [LogFileType.XLSX]:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        };

        await appendBlobClient.create({
          blobHTTPHeaders: {
            blobContentType: contentTypes[fileType],
          },
          metadata: {
            createdBy: 'LoggingService',
            createdAt: new Date().toISOString(),
            logType: 'application-log',
            fileType: fileType,
            serviceVersion: '2.0',
          },
        });

        // Para CSV, agregar header si es nuevo archivo
        if (fileType === LogFileType.CSV) {
          const header = this.generateCSVHeader();
          const headerBuffer = Buffer.from(header, 'utf-8');
          await appendBlobClient.appendBlock(headerBuffer, headerBuffer.length);
        }
      }

      return appendBlobClient;
    } catch (error: any) {
      console.error('Error creating/accessing append blob:', error);

      // Si es error 404, el contenedor no existe - informar al cliente
      if (error.statusCode === 404) {
        throw new InternalServerErrorException(
          `Container '${containerName}' does not exist. Please ensure the container exists before logging.`,
        );
      }

      throw new InternalServerErrorException(
        `Error accessing log file: ${error.message}`,
      );
    }
  }

  /**
   * Verifica si el archivo de log necesita rotación
   */
  private async checkAndRotateIfNeeded(
    appendBlobClient: AppendBlobClient,
    config: LogFileConfig = {},
  ): Promise<boolean> {
    try {
      const properties = await appendBlobClient.getProperties();
      const currentSizeMB = (properties.contentLength || 0) / (1024 * 1024);
      const maxSizeMB = config.maxFileSize || 100; // Default 100MB

      return currentSizeMB >= maxSizeMB;
    } catch (error) {
      // Si hay error obteniendo propiedades, asumir que no necesita rotación
      return false;
    }
  }

  /**
   * Rota el archivo de log creando uno nuevo
   */
  private async rotateLogFile(
    baseFileName: string,
    config: LogFileConfig = {},
  ): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const cleanName = this.cleanBaseFileName(baseFileName);
    const fileType = this.determineFileType(baseFileName, config);

    // Crear nombre con sufijo de rotación
    const extensions = {
      [LogFileType.LOG]: '.log',
      [LogFileType.CSV]: '.csv',
      [LogFileType.XLSX]: '.xlsx',
    };

    const extension = extensions[fileType];
    const rotatedFileName = `${cleanName}-rotated-${timestamp}${extension}`;

    return rotatedFileName;
  }

  /**
   * Procesa contenido para archivos XLSX
   */
  private async processXLSXContent(
    appendBlobClient: AppendBlobClient,
    csvContent: string,
  ): Promise<void> {
    try {
      const currentContent = await appendBlobClient.downloadToBuffer();
      const currentCSV = currentContent.toString('utf-8');

      const logBuffer = Buffer.from(csvContent, 'utf-8');
      await appendBlobClient.appendBlock(logBuffer, logBuffer.length);
    } catch (error) {
      const logBuffer = Buffer.from(csvContent, 'utf-8');
      await appendBlobClient.appendBlock(logBuffer, logBuffer.length);
    }
  }

  /**
   * Agregar una sola entrada de log
   */
  async appendLog(
    fileName: string,
    entry: LogEntry,
    config: LogFileConfig = {},
  ): Promise<void> {
    try {
      const logFileName = this.generateLogFileName(fileName, config);
      const appendBlobClient = await this.getOrCreateAppendBlob(
        logFileName,
        config,
      );

      // Verificar si necesita rotación
      const needsRotation = await this.checkAndRotateIfNeeded(
        appendBlobClient,
        config,
      );
      let finalAppendBlobClient = appendBlobClient;

      if (needsRotation) {
        const newFileName = await this.rotateLogFile(logFileName, config);
        finalAppendBlobClient = await this.getOrCreateAppendBlob(
          newFileName,
          config,
        );
      }

      // Determinar tipo de archivo y formatear
      const fileType = this.determineFileType(fileName, config);
      const formattedLog = this.formatLogEntry(entry, fileType);

      if (fileType === LogFileType.XLSX) {
        await this.processXLSXContent(finalAppendBlobClient, formattedLog);
      } else {
        const logBuffer = Buffer.from(formattedLog, 'utf-8');

        // Verificar límite de tamaño de bloque
        if (logBuffer.length > this.MAX_APPEND_BLOCK_SIZE) {
          throw new Error(
            `Log entry too large: ${logBuffer.length} bytes. Max: ${this.MAX_APPEND_BLOCK_SIZE} bytes`,
          );
        }

        // Agregar al append blob
        await finalAppendBlobClient.appendBlock(logBuffer, logBuffer.length);
      }
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
      const logFileName = this.generateLogFileName(fileName, config);
      const appendBlobClient = await this.getOrCreateAppendBlob(
        logFileName,
        config,
      );

      // Verificar rotación
      const needsRotation = await this.checkAndRotateIfNeeded(
        appendBlobClient,
        config,
      );
      let finalAppendBlobClient = appendBlobClient;

      if (needsRotation) {
        const newFileName = await this.rotateLogFile(logFileName, config);
        finalAppendBlobClient = await this.getOrCreateAppendBlob(
          newFileName,
          config,
        );
      }

      // Determinar tipo de archivo
      const fileType = this.determineFileType(fileName, config);

      // Formatear todas las entradas
      let bulkLogContent = '';
      for (const entry of entries) {
        if (entry.timestamp) {
          // Usar timestamp personalizado
          if (fileType === LogFileType.LOG) {
            const formattedEntry = this.formatLogEntry(entry, fileType);
            const timestampedEntry = formattedEntry.replace(
              /^\[([^\]]+)\]/,
              `[${entry.timestamp.toISOString()}]`,
            );
            bulkLogContent += timestampedEntry;
          } else {
            // Para CSV/XLSX, usar timestamp personalizado directamente
            const customTimestamp = entry.timestamp.toISOString();
            const formattedEntry = this.formatAsCSV(entry, customTimestamp);
            bulkLogContent += formattedEntry;
          }
        } else {
          bulkLogContent += this.formatLogEntry(entry, fileType);
        }
      }

      if (fileType === LogFileType.XLSX) {
        await this.processXLSXContent(finalAppendBlobClient, bulkLogContent);
      } else {
        const logBuffer = Buffer.from(bulkLogContent, 'utf-8');

        // Verificar límite de tamaño
        if (logBuffer.length > this.MAX_APPEND_BLOCK_SIZE) {
          // Si es muy grande, dividir en chunks
          await this.appendLogInChunks(finalAppendBlobClient, logBuffer);
        } else {
          await finalAppendBlobClient.appendBlock(logBuffer, logBuffer.length);
        }
      }
    } catch (error: any) {
      console.error('Error appending bulk logs:', error);
      throw new InternalServerErrorException(
        `Failed to append bulk logs: ${error.message}`,
      );
    }
  }

  /**
   * Divide y envía logs en chunks si son muy grandes
   */
  private async appendLogInChunks(
    appendBlobClient: AppendBlobClient,
    logBuffer: Buffer,
  ): Promise<void> {
    const chunkSize = this.MAX_APPEND_BLOCK_SIZE - 1024; // Un poco menos para safety
    let offset = 0;

    while (offset < logBuffer.length) {
      const chunk = logBuffer.subarray(offset, offset + chunkSize);
      await appendBlobClient.appendBlock(chunk, chunk.length);
      offset += chunkSize;
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
      const logFileName = this.generateLogFileName(fileName, config);
      const appendBlobClient = await this.getOrCreateAppendBlob(
        logFileName,
        config,
      );

      // Verificar que el archivo existe antes de intentar leerlo
      const exists = await appendBlobClient.exists();
      if (!exists) {
        throw new InternalServerErrorException(
          `Log file '${logFileName}' does not exist`,
        );
      }

      const downloadResponse = await appendBlobClient.downloadToBuffer();
      const content = downloadResponse.toString('utf-8');

      // Verificar que el contenido no esté vacío
      if (!content || content.trim() === '') {
        return 'Log file exists but is empty';
      }

      return content;
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
    fileType?: LogFileType;
    sizeBytes?: number;
    sizeMB?: number;
    lastModified?: Date;
    createdAt?: string;
  }> {
    try {
      const logFileName = this.generateLogFileName(fileName, config);
      const appendBlobClient = await this.getOrCreateAppendBlob(
        logFileName,
        config,
      );

      const exists = await appendBlobClient.exists();
      if (!exists) {
        return { exists: false };
      }

      const properties = await appendBlobClient.getProperties();
      const fileType = this.determineFileType(fileName, config);

      return {
        exists: true,
        fileType,
        sizeBytes: properties.contentLength || 0,
        sizeMB: (properties.contentLength || 0) / (1024 * 1024),
        lastModified: properties.lastModified,
        createdAt: properties.metadata?.createdAt,
      };
    } catch (error: any) {
      console.error('Error getting log file stats:', error);
      return { exists: false };
    }
  }
}
