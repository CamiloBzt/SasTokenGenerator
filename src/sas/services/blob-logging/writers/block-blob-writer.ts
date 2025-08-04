import { BlockBlobClient } from '@azure/storage-blob';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { LogFileType } from '@src/shared/dto/blob-logging.dto';
import { SasPermission } from '@src/shared/enums/sas-permission.enum';
import { LogFileConfig } from '@src/shared/interfaces/services/blob-logging/blob-logging.interface';
import { LogWriter } from '@src/shared/interfaces/services/blob-logging/log-writer.interface';
import { SasService } from '../../sas.service';

/**
 * Writer para archivos que requieren regeneración completa (XLSX)
 */
@Injectable()
export class BlockBlobWriter implements LogWriter {
  private blockBlobClient: BlockBlobClient;
  private fileName: string;
  private config: LogFileConfig;
  private contentBuffer: string[] = []; // Buffer en memoria para acumular entradas

  constructor(
    private readonly sasService: SasService,
    private readonly fileType: LogFileType,
  ) {}

  async initialize(fileName: string, config: LogFileConfig): Promise<void> {
    this.fileName = fileName;
    this.config = config;
    this.blockBlobClient = await this.createBlockBlobClient();

    // Cargar contenido existente al buffer
    await this.loadExistingContent();
  }

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
        `Error accessing log file: ${error.message}`,
      );
    }
  }

  private async loadExistingContent(): Promise<void> {
    try {
      const exists = await this.blockBlobClient.exists();
      if (exists) {
        const downloadResponse = await this.blockBlobClient.downloadToBuffer();
        const content = downloadResponse.toString('utf-8');

        // Para archivos XLSX que manejamos como JSON lines en buffer
        if (content.trim()) {
          this.contentBuffer = content
            .trim()
            .split('\n')
            .filter((line) => line.trim());
        }
      }
    } catch (error) {
      // Si hay error cargando contenido existente, empezar desde cero
      this.contentBuffer = [];
    }
  }

  async writeEntry(formattedContent: string): Promise<void> {
    // Agregar al buffer en memoria
    this.contentBuffer.push(formattedContent.trim());

    // Escribir inmediatamente para entries individuales
    await this.flushBuffer();
  }

  async writeBulk(formattedContent: string): Promise<void> {
    // Agregar todas las entradas al buffer
    const newEntries = formattedContent
      .trim()
      .split('\n')
      .filter((line) => line.trim());
    this.contentBuffer.push(...newEntries);

    // Escribir todo el contenido
    await this.flushBuffer();
  }

  private async flushBuffer(): Promise<void> {
    if (this.contentBuffer.length === 0) return;

    try {
      const contentToWrite = this.contentBuffer.join('\n');
      const contentBuffer = Buffer.from(contentToWrite, 'utf-8');

      const contentTypes = {
        [LogFileType.LOG]: 'text/plain; charset=utf-8',
        [LogFileType.CSV]: 'text/csv; charset=utf-8',
        [LogFileType.XLSX]:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };

      await this.blockBlobClient.upload(contentBuffer, contentBuffer.length, {
        blobHTTPHeaders: {
          blobContentType: contentTypes[this.fileType],
        },
        metadata: {
          createdBy: 'LoggingService',
          lastUpdated: new Date().toISOString(),
          logType: 'application-log',
          fileType: this.fileType,
          serviceVersion: '2.0',
          entriesCount: this.contentBuffer.length.toString(),
        },
      });
    } catch (error: any) {
      console.error('Error flushing buffer to block blob:', error);
      throw new InternalServerErrorException(
        `Failed to write log content: ${error.message}`,
      );
    }
  }

  async needsRotation(): Promise<boolean> {
    try {
      const properties = await this.blockBlobClient.getProperties();
      const currentSizeMB = (properties.contentLength || 0) / (1024 * 1024);
      const maxSizeMB = this.config.maxFileSize || 100;

      return currentSizeMB >= maxSizeMB;
    } catch (error) {
      return false;
    }
  }

  async rotate(): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const [baseName, extension] = this.fileName.split('.');
    const rotatedFileName = `${baseName}-rotated-${timestamp}.${extension}`;

    // Limpiar buffer y crear nuevo cliente
    this.contentBuffer = [];
    const originalConfig = this.config;
    this.config = { ...originalConfig };
    this.fileName = rotatedFileName;
    this.blockBlobClient = await this.createBlockBlobClient();

    return rotatedFileName;
  }

  async getStats(): Promise<{
    exists: boolean;
    sizeBytes?: number;
    sizeMB?: number;
    lastModified?: Date;
    createdAt?: string;
  }> {
    try {
      const exists = await this.blockBlobClient.exists();
      if (!exists) {
        return { exists: false };
      }

      const properties = await this.blockBlobClient.getProperties();

      return {
        exists: true,
        sizeBytes: properties.contentLength || 0,
        sizeMB: (properties.contentLength || 0) / (1024 * 1024),
        lastModified: properties.lastModified,
        createdAt: properties.metadata?.createdAt,
      };
    } catch (error: any) {
      console.error('Error getting block blob stats:', error);
      return { exists: false };
    }
  }

  async readContent(): Promise<string> {
    // Para block blobs, retornamos el contenido del buffer actual
    return this.contentBuffer.join('\n');
  }

  async cleanup(): Promise<void> {
    // Asegurar que todo se escriba antes de limpiar
    await this.flushBuffer();
    this.contentBuffer = [];
  }
}
