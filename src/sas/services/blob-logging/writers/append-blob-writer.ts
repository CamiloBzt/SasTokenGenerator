import { AnonymousCredential, AppendBlobClient } from '@azure/storage-blob';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { LogFileType } from '@src/shared/dto/blob-logging.dto';
import { SasPermission } from '@src/shared/enums/sas-permission.enum';
import { LogFileConfig } from '@src/shared/interfaces/services/blob-logging/blob-logging.interface';
import { LogWriter } from '@src/shared/interfaces/services/blob-logging/log-writer.interface';
import { SasService } from '../../sas.service';

/**
 * @fileoverview
 * Implementación de {@link LogWriter} que escribe en **Azure Append Blobs**,
 * ideal para formatos lineales como `.log` y `.csv`.
 *
 * Características:
 * - Crea el blob si no existe (con `content-type` y `metadata` adecuados).
 * - Escribe por **append** (bloques secuenciales, sin sobrescribir).
 * - Gestiona límites de Azure (máx. 4 MB por append block).
 * - Soporta escritura en **chunks** y **rotación** por tamaño.
 * - Permite leer contenido y consultar estadísticas del blob.
 *
 * @module sas/services/blob-logging/writers/append-blob-writer
 */
@Injectable()
export class AppendBlobWriter implements LogWriter {
  /** Cliente de Azure para operar sobre el Append Blob. */
  private appendBlobClient: AppendBlobClient;

  /** Nombre de archivo de log (incluye extensión). */
  private fileName: string;

  /** Configuración del archivo de log (contenedor, directorio, límites, etc.). */
  private config: LogFileConfig;

  /** Límite de Azure para un bloque de append: 4 MB. */
  private readonly MAX_APPEND_BLOCK_SIZE = 4 * 1024 * 1024; // 4MB Azure limit

  /**
   * @param {SasService} sasService - Servicio para generar SAS con permisos mínimos requeridos.
   * @param {LogFileType} fileType  - Tipo de archivo (LOG | CSV | XLSX) para elegir `content-type`.
   */
  constructor(
    private readonly sasService: SasService,
    private readonly fileType: LogFileType,
  ) {}

  /**
   * Inicializa el writer:
   * - Guarda nombre y configuración.
   * - Construye el `AppendBlobClient` (crea el blob si no existe).
   *
   * @param {string} fileName - Nombre de archivo (con extensión).
   * @param {LogFileConfig} config - Configuración (container, directory, maxFileSize, etc.).
   */
  async initialize(fileName: string, config: LogFileConfig): Promise<void> {
    this.fileName = fileName;
    this.config = config;
    this.appendBlobClient = await this.createAppendBlobClient();
  }

  /**
   * Crea un `AppendBlobClient` con SAS y asegura la existencia del blob.
   * Permisos SAS: READ, WRITE, CREATE, ADD.
   *
   * @returns {Promise<AppendBlobClient>} Cliente listo para append.
   * @throws {InternalServerErrorException} Si el contenedor no existe o hay error de acceso.
   */
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

  /**
   * Crea un nuevo Append Blob con `content-type` y `metadata` inicial.
   *
   * @param {AppendBlobClient} appendBlobClient - Cliente ya apuntando al path final.
   */
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

  /**
   * Escribe **una** entrada ya formateada (línea CSV/LOG).
   *
   * @param {string} formattedContent - Contenido a anexar (UTF-8).
   * @returns {Promise<void>}
   */
  async writeEntry(formattedContent: string): Promise<void> {
    await this.writeContent(formattedContent);
  }

  /**
   * Escribe múltiples entradas (formateadas) de una sola vez.
   * Si supera 4MB, divide en **chunks** seguros.
   *
   * @param {string} formattedContent - Bloque de texto con varias líneas.
   * @returns {Promise<void>}
   */
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

  /**
   * Escribe una entrada validando el límite de 4MB.
   *
   * @param {string} content - Contenido de una sola entrada.
   * @throws {Error} Si la entrada excede el límite de 4MB.
   */
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

  /**
   * Divide el contenido en chunks (< 4MB) y los agrega secuencialmente.
   *
   * @param {Buffer} contentBuffer - Contenido a dividir.
   */
  private async writeInChunks(contentBuffer: Buffer): Promise<void> {
    const chunkSize = this.MAX_APPEND_BLOCK_SIZE - 1024; // Safety margin
    let offset = 0;

    while (offset < contentBuffer.length) {
      const chunk = contentBuffer.subarray(offset, offset + chunkSize);
      await this.appendBlobClient.appendBlock(chunk, chunk.length);
      offset += chunkSize;
    }
  }

  /**
   * Indica si el archivo debe **rotarse** por tamaño.
   *
   * @returns {Promise<boolean>} `true` si supera `maxFileSize` (MB); `false` en error o si no supera.
   */
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

  /**
   * Rota el archivo actual:
   * - Genera nombre con sufijo de timestamp.
   * - Crea un nuevo Append Blob y lo deja activo.
   *
   * @returns {Promise<string>} Nombre del archivo rotado.
   */
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

  /**
   * Obtiene estadísticas del blob (existencia, tamaño, fechas).
   *
   * @returns {Promise<{ exists: boolean; sizeBytes?: number; sizeMB?: number; lastModified?: Date; createdAt?: string; }>}
   */
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

  /**
   * Lee el contenido **completo** del Append Blob como texto UTF-8.
   *
   * @returns {Promise<string>} Contenido del log o mensaje si está vacío.
   * @throws {InternalServerErrorException} Si el blob no existe o falla la lectura.
   */
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
