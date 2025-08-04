import { AnonymousCredential, AppendBlobClient } from '@azure/storage-blob';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { LogFileType } from '@src/shared/dto/blob-logging.dto';
import { SasPermission } from '@src/shared/enums/sas-permission.enum';
import { LogFileConfig } from '@src/shared/interfaces/services/blob-logging/blob-logging.interface';
import { LogWriter } from '@src/shared/interfaces/services/blob-logging/log-writer.interface';
import { SasService } from '../../sas.service';

/**
 * Writer para archivos que soportan append (LOG, CSV)
 */
@Injectable()
export class AppendBlobWriter implements LogWriter {
  private appendBlobClient: AppendBlobClient;
  private fileName: string;
  private config: LogFileConfig;
  private readonly MAX_APPEND_BLOCK_SIZE = 4 * 1024 * 1024; // 4MB Azure limit

  constructor(
    private readonly sasService: SasService,
    private readonly fileType: LogFileType,
  ) {}

  async initialize(fileName: string, config: LogFileConfig): Promise<void> {
    this.fileName = fileName;
    this.config = config;
    this.appendBlobClient = await this.createAppendBlobClient();
  }

  private async createAppendBlobClient(): Promise<AppendBlobClient> {
    const containerName = this.config.containerName || 'logs';
    const directory = this.config.directory || 'application';
    const fullPath = directory.endsWith('/')
      ? `${directory}${this.fileName}`
      : `${directory}/${this.fileName}`;

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

      const appendBlobClient = new AppendBlobClient(
        sasData.sasUrl,
        new AnonymousCredential(),
      );

      // Crear blob si no existe
      const exists = await appendBlobClient.exists();
      if (!exists) {
        await this.createNewAppendBlob(appendBlobClient);
      }

      return appendBlobClient;
    } catch (error: any) {
      console.error('Error creating append blob client:', error);

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

  private async createNewAppendBlob(
    appendBlobClient: AppendBlobClient,
  ): Promise<void> {
    const contentTypes = {
      [LogFileType.LOG]: 'text/plain; charset=utf-8',
      [LogFileType.CSV]: 'text/csv; charset=utf-8',
      [LogFileType.XLSX]:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };

    await appendBlobClient.create({
      blobHTTPHeaders: {
        blobContentType: contentTypes[this.fileType],
      },
      metadata: {
        createdBy: 'LoggingService',
        createdAt: new Date().toISOString(),
        logType: 'application-log',
        fileType: this.fileType,
        serviceVersion: '2.0',
      },
    });
  }

  async writeEntry(formattedContent: string): Promise<void> {
    await this.writeContent(formattedContent);
  }

  async writeBulk(formattedContent: string): Promise<void> {
    const contentBuffer = Buffer.from(formattedContent, 'utf-8');

    if (contentBuffer.length > this.MAX_APPEND_BLOCK_SIZE) {
      await this.writeInChunks(contentBuffer);
    } else {
      await this.appendBlobClient.appendBlock(
        contentBuffer,
        contentBuffer.length,
      );
    }
  }

  private async writeContent(content: string): Promise<void> {
    const contentBuffer = Buffer.from(content, 'utf-8');

    if (contentBuffer.length > this.MAX_APPEND_BLOCK_SIZE) {
      throw new Error(
        `Log entry too large: ${contentBuffer.length} bytes. Max: ${this.MAX_APPEND_BLOCK_SIZE} bytes`,
      );
    }

    await this.appendBlobClient.appendBlock(
      contentBuffer,
      contentBuffer.length,
    );
  }

  private async writeInChunks(contentBuffer: Buffer): Promise<void> {
    const chunkSize = this.MAX_APPEND_BLOCK_SIZE - 1024; // Safety margin
    let offset = 0;

    while (offset < contentBuffer.length) {
      const chunk = contentBuffer.subarray(offset, offset + chunkSize);
      await this.appendBlobClient.appendBlock(chunk, chunk.length);
      offset += chunkSize;
    }
  }

  async needsRotation(): Promise<boolean> {
    try {
      const properties = await this.appendBlobClient.getProperties();
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

    // Crear nuevo cliente para el archivo rotado
    const originalConfig = this.config;
    this.config = { ...originalConfig };
    this.fileName = rotatedFileName;
    this.appendBlobClient = await this.createAppendBlobClient();

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
      const exists = await this.appendBlobClient.exists();
      if (!exists) {
        return { exists: false };
      }

      const properties = await this.appendBlobClient.getProperties();

      return {
        exists: true,
        sizeBytes: properties.contentLength || 0,
        sizeMB: (properties.contentLength || 0) / (1024 * 1024),
        lastModified: properties.lastModified,
        createdAt: properties.metadata?.createdAt,
      };
    } catch (error: any) {
      console.error('Error getting append blob stats:', error);
      return { exists: false };
    }
  }

  async readContent(): Promise<string> {
    try {
      const exists = await this.appendBlobClient.exists();
      if (!exists) {
        throw new InternalServerErrorException(
          `Log file '${this.fileName}' does not exist`,
        );
      }

      const downloadResponse = await this.appendBlobClient.downloadToBuffer();
      const content = downloadResponse.toString('utf-8');

      if (!content || content.trim() === '') {
        return 'Log file exists but is empty';
      }

      return content;
    } catch (error: any) {
      console.error('Error reading append blob content:', error);
      throw new InternalServerErrorException(
        `Failed to read logs: ${error.message}`,
      );
    }
  }
}
