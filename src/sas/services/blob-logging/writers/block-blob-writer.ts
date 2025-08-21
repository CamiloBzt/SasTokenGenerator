import { BlockBlobClient } from '@azure/storage-blob';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { LogFileType } from '@src/shared/dto/blob-logging.dto';
import { SasPermission } from '@src/shared/enums/sas-permission.enum';
import { LogFileConfig } from '@src/shared/interfaces/services/blob-logging/blob-logging.interface';
import { LogWriter } from '@src/shared/interfaces/services/blob-logging/log-writer.interface';
import { SasService } from '../../sas.service';

/**
 * @fileoverview
 * Implementación de {@link LogWriter} que escribe en **Azure Block Blobs**.
 *
 * Ideal para formatos que requieren **regenerar el archivo completo** en cada escritura
 * (p. ej., `.xlsx`), pero funciona también con contenidos serializados como “JSON lines”.
 *
 * Características:
 * - Mantiene un **buffer en memoria** y sobrescribe el blob completo en `flushBuffer()`.
 * - Genera SAS con permisos mínimos necesarios (READ, WRITE, CREATE).
 * - Expone utilidades de rotación, lectura y estadísticas del blob.
 *
 * @module sas/services/blob-logging/writers/block-blob-writer
 */
@Injectable()
export class BlockBlobWriter implements LogWriter {
  /** Cliente de Azure para operar sobre el Block Blob. */
  private blockBlobClient: BlockBlobClient;

  /** Nombre de archivo actual (con extensión). */
  private fileName: string;

  /** Configuración del archivo (contenedor, directorio, límites, etc.). */
  private config: LogFileConfig;

  /** Buffer en memoria para acumular entradas (serializadas por línea). */
  private contentBuffer: string[] = []; // Buffer en memoria para acumular entradas

  /**
   * @param {SasService} sasService - Servicio para generar SAS firmados.
   * @param {LogFileType} fileType - Tipo de archivo para asignar `content-type` adecuado.
   */
  constructor(
    private readonly sasService: SasService,
    private readonly fileType: LogFileType,
  ) {}

  /**
   * Inicializa el writer:
   * - Construye el `BlockBlobClient`.
   * - Carga contenido existente en memoria (si lo hay) a `contentBuffer`.
   *
   * @param {string} fileName - Nombre de archivo (con extensión).
   * @param {LogFileConfig} config - Configuración (container, directory, maxFileSize, etc.).
   *
   * @example
   * await writer.initialize('logs-2025.xlsx', { containerName: 'logs', directory: 'app' });
   */
  async initialize(fileName: string, config: LogFileConfig): Promise<void> {
    this.fileName = fileName;
    this.config = config;
    this.blockBlobClient = await this.createBlockBlobClient();

    // Cargar contenido existente al buffer
    await this.loadExistingContent();
  }

  /**
   * Crea el `BlockBlobClient` con SAS.
   * Permisos: READ, WRITE, CREATE.
   *
   * @returns {Promise<BlockBlobClient>} Cliente listo para subir contenido.
   * @throws {InternalServerErrorException} Si falla la generación de SAS o acceso.
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
        `Error accessing log file: ${error.message}`,
      );
    }
  }

  /**
   * Carga el contenido existente del blob al buffer en memoria.
   *
   * - Para `.xlsx` u otros, se suele manejar como **JSON lines** dentro del buffer.
   * - Si hay error o el blob está vacío, el buffer queda limpio.
   */
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

  /**
   * Agrega UNA entrada ya formateada al buffer y escribe inmediatamente.
   *
   * @param {string} formattedContent - Línea serializada (p. ej., JSON).
   */
  async writeEntry(formattedContent: string): Promise<void> {
    // Agregar al buffer en memoria
    this.contentBuffer.push(formattedContent.trim());

    // Escribir inmediatamente para entries individuales
    await this.flushBuffer();
  }

  /**
   * Agrega varias entradas al buffer y escribe todo de una vez.
   *
   * @param {string} formattedContent - Varias líneas (separadas por `\n`).
   */
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

  /**
   * Sincroniza el buffer con Azure:
   * - Une todas las líneas con `\n`.
   * - Sube el archivo completo (sobrescribe).
   * - Establece `content-type` y metadata estándar.
   *
   * @throws {InternalServerErrorException} Si la subida falla.
   */
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

  /**
   * Indica si el archivo debe **rotarse** por tamaño.
   *
   * @returns {Promise<boolean>} `true` si supera `maxFileSize` (MB); `false` si no o si falla el check.
   */
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

  /**
   * Rota el archivo actual:
   * - Limpia el buffer.
   * - Genera nuevo nombre con sufijo `-rotated-{timestamp}`.
   * - Crea un nuevo `BlockBlobClient` apuntando al archivo rotado.
   *
   * @returns {Promise<string>} Nombre del archivo rotado.
   */
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

  /**
   * Lee el contenido actual desde el **buffer en memoria**.
   * (Útil cuando el formato se maneja como JSON lines antes de convertir a binario).
   *
   * @returns {Promise<string>} Contenido concatenado por `\n`.
   */
  async readContent(): Promise<string> {
    // Para block blobs, retornamos el contenido del buffer actual
    return this.contentBuffer.join('\n');
  }

  /**
   * Limpia recursos:
   * - Asegura escritura pendiente con `flushBuffer()`.
   * - Limpia el buffer en memoria.
   */
  async cleanup(): Promise<void> {
    // Asegurar que todo se escriba antes de limpiar
    await this.flushBuffer();
    this.contentBuffer = [];
  }
}
