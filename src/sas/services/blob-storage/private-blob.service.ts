import { BlockBlobClient, ContainerClient } from '@azure/storage-blob';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { formatFileSize, processEnrichedBlobs } from '@src/common/utils';
import { ErrorMessages } from '@src/shared/enums/error-messages.enum';
import { SasPermission } from '@src/shared/enums/sas-permission.enum';
import { BadRequestException } from '@src/shared/exceptions/bad-request.exception';
import { BusinessErrorException } from '@src/shared/exceptions/business-error.exception';
import {
  BlobInfo,
  BlobListResponse,
} from '@src/shared/interfaces/services/blob-storage/list-blobs.interface';
import { v4 as uuidv4 } from 'uuid';
import { SasService } from '../sas.service';

/**
 * @fileoverview
 * Servicio para **operaciones privadas** sobre Azure Blob Storage (subir, descargar,
 * listar y eliminar blobs), usando SAS tokens *ad hoc* generados vía `SasService`.
 *
 * Características:
 * - Soporta **upload** desde `Multer` (buffer) y **upload Base64**.
 * - **Download** como `Buffer` o como **Base64** (con metadata `contentType`).
 * - **Delete** seguro con manejo de errores de negocio y Azure.
 * - **List** con enriquecimiento de items (`BlobInfo`) y totales de tamaño.
 *
 * Seguridad:
 * - Genera SAS tokens con permisos mínimos necesarios para cada operación
 *   (`READ`, `WRITE`, `CREATE`, `DELETE`, `LIST`), con expiración corta.
 *
 * @module sas/services/blob-storage/private-blob.service
 */
@Injectable()
export class PrivateBlobService {
  /**
   * @param {ConfigService} configService - Servicio de configuración (cuenta de storage).
   * @param {SasService} sasService - Servicio para generación de SAS tokens.
   */
  constructor(
    private readonly configService: ConfigService,
    private readonly sasService: SasService,
  ) {}

  /**
   * Construye la **ruta completa** `{directory}/{blobName}` si hay directorio.
   *
   * @param {string | undefined} directory - Carpeta lógica (opcional).
   * @param {string} blobName - Nombre del blob (con extensión).
   * @returns {string} Ruta completa del blob.
   *
   * @example
   * buildFullBlobPath('invoices/2025', 'report.pdf'); // 'invoices/2025/report.pdf'
   * buildFullBlobPath(undefined, 'logo.png');         // 'logo.png'
   */
  private buildFullBlobPath(
    directory: string | undefined,
    blobName: string,
  ): string {
    if (directory && directory.trim() !== '') {
      const normalizedDirectory = directory.endsWith('/')
        ? directory
        : directory + '/';
      return `${normalizedDirectory}${blobName}`;
    }
    return blobName;
  }

  /**
   * Valida presencia de **contenido Base64** y **MIME type**.
   *
   * @param {string} fileBase64 - Contenido en Base64 **sin encabezado** (solo data).
   * @param {string} mimeType - Tipo MIME declarado (ej. `image/png`).
   * @throws {BadRequestException}
   *  - `FILE_BASE64_MISSING` si no hay contenido.
   *  - `MIME_TYPE_MISSING` si no se proporciona el MIME.
   */
  private validateBase64AndMimeType(
    fileBase64: string,
    mimeType: string,
  ): void {
    if (!fileBase64 || fileBase64.trim() === '') {
      throw new BadRequestException(ErrorMessages.FILE_BASE64_MISSING);
    }
    if (!mimeType || mimeType.trim() === '') {
      throw new BadRequestException(ErrorMessages.MIME_TYPE_MISSING);
    }
  }

  /**
   * Sube un **blob** usando un archivo recibido por **Multer** (buffer).
   *
   * Permisos SAS: `WRITE`, `CREATE`.
   *
   * @param {string} containerName - Contenedor destino.
   * @param {string | undefined} directory - Directorio lógico (opcional).
   * @param {string} blobName - Nombre del blob (incluye extensión).
   * @param {Express.Multer.File} file - Archivo Multer (usa `file.buffer` y `file.mimetype`).
   * @returns {Promise<{ blobUrl: string; containerName: string; blobName: string; fullPath: string; requestId: string; }>}
   * @throws {BadRequestException|InternalServerErrorException}
   *  - `FILE_MISSING` si no se recibe el buffer.
   *  - `CONTAINER_NOT_FOUND` si el contenedor no existe.
   *  - `SAS_PERMISSION` si el token no tiene permisos/credenciales.
   *  - `SAS_GENERATION` para fallos al generar/usar SAS.
   */
  async uploadBlob(
    containerName: string,
    directory: string | undefined,
    blobName: string,
    file: Express.Multer.File,
  ): Promise<{
    blobUrl: string;
    containerName: string;
    blobName: string;
    fullPath: string;
    requestId: string;
  }> {
    // Validar archivo
    if (!file?.buffer) {
      throw new BadRequestException(ErrorMessages.FILE_MISSING);
    }

    // Construir la ruta completa del blob incluyendo el directorio
    const fullBlobPath = this.buildFullBlobPath(directory, blobName);

    // Generar SAS token con permisos de escritura
    const sasData = await this.sasService.generateSasTokenWithParams(
      containerName,
      fullBlobPath,
      [SasPermission.WRITE, SasPermission.CREATE],
      30, // 30 minutos de expiración
    );

    try {
      // Crear cliente de blob con SAS token
      const blockBlobClient = new BlockBlobClient(sasData.sasUrl);

      // Subir el archivo directamente desde el buffer
      await blockBlobClient.upload(file.buffer, file.buffer.length, {
        blobHTTPHeaders: {
          blobContentType: file.mimetype,
        },
      });

      const accountName = this.configService.get<string>(
        'azure.storageAccountName',
      );
      const blobUrl = `https://${accountName}.blob.core.windows.net/${containerName}/${fullBlobPath}`;

      return {
        blobUrl,
        containerName,
        blobName,
        fullPath: fullBlobPath,
        requestId: uuidv4(),
      };
    } catch (error: any) {
      console.error('Error uploading blob:', error);

      if (error.statusCode === 401) {
        throw new InternalServerErrorException(ErrorMessages.SAS_PERMISSION);
      }

      if (error.statusCode === 403) {
        throw new InternalServerErrorException(ErrorMessages.SAS_PERMISSION);
      }

      if (error.statusCode === 404) {
        throw new BadRequestException(ErrorMessages.CONTAINER_NOT_FOUND);
      }

      throw new InternalServerErrorException(ErrorMessages.SAS_GENERATION);
    }
  }

  /**
   * Sube un **blob** a partir de **contenido Base64**.
   *
   * Permisos SAS: `WRITE`, `CREATE`.
   *
   * @param {string} containerName - Contenedor destino.
   * @param {string | undefined} directory - Directorio lógico (opcional).
   * @param {string} blobName - Nombre del blob (incluye extensión).
   * @param {string} fileBase64 - Data en Base64 (sin prefijo `data:`).
   * @param {string} mimeType - Tipo MIME declarado (ej. `image/png`).
   * @returns {Promise<{ blobUrl: string; containerName: string; blobName: string; fullPath: string; requestId: string; }>}
   * @throws {BadRequestException|InternalServerErrorException}
   *  - `FILE_BASE64_MISSING`, `MIME_TYPE_MISSING`, `BASE64_EMPTY_BUFFER`, `BASE64_CONTENT_INVALID`.
   *  - `CONTAINER_NOT_FOUND`, `SAS_PERMISSION`, `SAS_GENERATION`.
   */
  async uploadBlobBase64(
    containerName: string,
    directory: string | undefined,
    blobName: string,
    fileBase64: string,
    mimeType: string,
  ): Promise<{
    blobUrl: string;
    containerName: string;
    blobName: string;
    fullPath: string;
    requestId: string;
  }> {
    // Validar Base64 y MIME type
    this.validateBase64AndMimeType(fileBase64, mimeType);

    try {
      // Convertir Base64 a Buffer
      const fileBuffer = Buffer.from(fileBase64, 'base64');

      if (fileBuffer.length === 0) {
        throw new BadRequestException(ErrorMessages.BASE64_EMPTY_BUFFER);
      }

      // Construir la ruta completa del blob incluyendo el directorio
      const fullBlobPath = this.buildFullBlobPath(directory, blobName);

      // Generar SAS token con permisos de escritura
      const sasData = await this.sasService.generateSasTokenWithParams(
        containerName,
        fullBlobPath,
        [SasPermission.WRITE, SasPermission.CREATE],
        30, // 30 minutos de expiración
      );

      // Crear cliente de blob con SAS token
      const blockBlobClient = new BlockBlobClient(sasData.sasUrl);

      // Subir el archivo desde el buffer convertido de Base64
      await blockBlobClient.upload(fileBuffer, fileBuffer.length, {
        blobHTTPHeaders: {
          blobContentType: mimeType,
        },
      });

      const accountName = this.configService.get<string>(
        'azure.storageAccountName',
      );
      const blobUrl = `https://${accountName}.blob.core.windows.net/${containerName}/${fullBlobPath}`;

      return {
        blobUrl,
        containerName,
        blobName,
        fullPath: fullBlobPath,
        requestId: uuidv4(),
      };
    } catch (error: any) {
      console.error('Error uploading Base64 blob:', error);

      // Si es error de Base64 inválido (desde Buffer.from)
      if (error.message?.includes('Invalid') || error.name === 'TypeError') {
        throw new BadRequestException(ErrorMessages.BASE64_CONTENT_INVALID);
      }

      // Si ya es una BadRequestException del enum, relanzarla
      if (error instanceof BadRequestException) {
        throw error;
      }

      // Errores de Azure Storage
      if (error.statusCode === 401) {
        throw new InternalServerErrorException(ErrorMessages.SAS_PERMISSION);
      }

      if (error.statusCode === 403) {
        throw new InternalServerErrorException(ErrorMessages.SAS_PERMISSION);
      }

      if (error.statusCode === 404) {
        throw new BadRequestException(ErrorMessages.CONTAINER_NOT_FOUND);
      }

      throw new InternalServerErrorException(ErrorMessages.SAS_GENERATION);
    }
  }

  /**
   * Descarga un **blob** y retorna su contenido como **Buffer**, junto con el `contentType`.
   *
   * Permisos SAS: `READ`.
   *
   * @param {string} containerName - Contenedor origen.
   * @param {string | undefined} directory - Directorio lógico (opcional).
   * @param {string} blobName - Nombre del blob.
   * @returns {Promise<{ data: Buffer; contentType: string; containerName: string; blobName: string; fullPath: string; requestId: string; }>}
   * @throws {BusinessErrorException|InternalServerErrorException}
   *  - `BLOB_NOT_FOUND` si no existe.
   *  - `SAS_PERMISSION` o `SAS_GENERATION` para errores de acceso.
   */
  async downloadBlob(
    containerName: string,
    directory: string | undefined,
    blobName: string,
  ): Promise<{
    data: Buffer;
    contentType: string;
    containerName: string;
    blobName: string;
    fullPath: string;
    requestId: string;
  }> {
    // Construir la ruta completa del blob incluyendo el directorio
    const fullBlobPath = this.buildFullBlobPath(directory, blobName);

    // Generar SAS token con permisos de lectura
    const sasData = await this.sasService.generateSasTokenWithParams(
      containerName,
      fullBlobPath,
      [SasPermission.READ],
      30, // 30 minutos de expiración
    );

    try {
      // Crear cliente de blob con SAS token
      const blockBlobClient = new BlockBlobClient(sasData.sasUrl);

      // Descargar el contenido del blob
      const downloadResponse = await blockBlobClient.downloadToBuffer();

      // Obtener metadata del blob
      const properties = await blockBlobClient.getProperties();

      return {
        data: downloadResponse,
        contentType: properties.contentType || 'application/octet-stream',
        containerName,
        blobName,
        fullPath: fullBlobPath,
        requestId: uuidv4(),
      };
    } catch (error: any) {
      console.error('Error downloading blob:', error);

      if (error.statusCode === 404) {
        throw new BusinessErrorException(ErrorMessages.BLOB_NOT_FOUND);
      }

      if (error.statusCode === 401) {
        throw new InternalServerErrorException(ErrorMessages.SAS_PERMISSION);
      }

      if (error.statusCode === 403) {
        throw new InternalServerErrorException(ErrorMessages.SAS_PERMISSION);
      }

      throw new InternalServerErrorException(ErrorMessages.SAS_GENERATION);
    }
  }

  /**
   * Descarga un **blob** y retorna su contenido en **Base64**, además de tamaño y `contentType`.
   *
   * Permisos SAS: `READ`.
   *
   * @param {string} containerName - Contenedor origen.
   * @param {string | undefined} directory - Directorio lógico (opcional).
   * @param {string} blobName - Nombre del blob.
   * @returns {Promise<{ fileBase64: string; contentType: string; containerName: string; blobName: string; fullPath: string; size: number; requestId: string; }>}
   * @throws {BusinessErrorException|InternalServerErrorException}
   *  - `BLOB_NOT_FOUND`, `SAS_PERMISSION`, `SAS_GENERATION`.
   */
  async downloadBlobBase64(
    containerName: string,
    directory: string | undefined,
    blobName: string,
  ): Promise<{
    fileBase64: string;
    contentType: string;
    containerName: string;
    blobName: string;
    fullPath: string;
    size: number;
    requestId: string;
  }> {
    // Construir la ruta completa del blob incluyendo el directorio
    const fullBlobPath = this.buildFullBlobPath(directory, blobName);

    // Generar SAS token con permisos de lectura
    const sasData = await this.sasService.generateSasTokenWithParams(
      containerName,
      fullBlobPath,
      [SasPermission.READ],
      30, // 30 minutos de expiración
    );

    try {
      // Crear cliente de blob con SAS token
      const blockBlobClient = new BlockBlobClient(sasData.sasUrl);

      // Descargar el contenido del blob
      const downloadResponse = await blockBlobClient.downloadToBuffer();

      // Obtener metadata del blob
      const properties = await blockBlobClient.getProperties();

      // Convertir Buffer a Base64
      const fileBase64 = downloadResponse.toString('base64');

      return {
        fileBase64,
        contentType: properties.contentType || 'application/octet-stream',
        containerName,
        blobName,
        fullPath: fullBlobPath,
        size: downloadResponse.length,
        requestId: uuidv4(),
      };
    } catch (error: any) {
      console.error('Error downloading Base64 blob:', error);

      if (error.statusCode === 404) {
        throw new BusinessErrorException(ErrorMessages.BLOB_NOT_FOUND);
      }

      if (error.statusCode === 401) {
        throw new InternalServerErrorException(ErrorMessages.SAS_PERMISSION);
      }

      if (error.statusCode === 403) {
        throw new InternalServerErrorException(ErrorMessages.SAS_PERMISSION);
      }

      throw new InternalServerErrorException(ErrorMessages.SAS_GENERATION);
    }
  }

  /**
   * Elimina un **blob** del contenedor.
   *
   * Permisos SAS: `DELETE`.
   *
   * @param {string} containerName - Contenedor origen.
   * @param {string | undefined} directory - Directorio lógico (opcional).
   * @param {string} blobName - Nombre del blob.
   * @returns {Promise<{ containerName: string; blobName: string; fullPath: string; requestId: string; }>}
   * @throws {BusinessErrorException|InternalServerErrorException}
   *  - `BLOB_NOT_FOUND` si el blob no existe.
   *  - `SAS_PERMISSION` o `SAS_GENERATION` para errores de acceso.
   */
  async deleteBlob(
    containerName: string,
    directory: string | undefined,
    blobName: string,
  ): Promise<{
    containerName: string;
    blobName: string;
    fullPath: string;
    requestId: string;
  }> {
    // Construir la ruta completa del blob incluyendo el directorio
    const fullBlobPath = this.buildFullBlobPath(directory, blobName);

    // Generar SAS token con permisos de eliminación
    const sasData = await this.sasService.generateSasTokenWithParams(
      containerName,
      fullBlobPath,
      [SasPermission.DELETE],
      30, // 30 minutos de expiración
    );

    try {
      // Crear cliente de blob con SAS token
      const blockBlobClient = new BlockBlobClient(sasData.sasUrl);

      // Eliminar el blob directamente
      // deleteIfExists() también devuelve false si el blob no existe, sin lanzar error
      const deletionResponse = await blockBlobClient.deleteIfExists();

      // Si no se eliminó, significa que no existía
      if (!deletionResponse.succeeded) {
        throw new BusinessErrorException(ErrorMessages.BLOB_NOT_FOUND);
      }

      return {
        containerName,
        blobName,
        fullPath: fullBlobPath,
        requestId: uuidv4(),
      };
    } catch (error: any) {
      console.error('Error deleting blob:', error);

      if (error instanceof BusinessErrorException) {
        throw error;
      }

      // Manejar errores específicos de Azure
      if (error.statusCode === 404) {
        throw new BusinessErrorException(ErrorMessages.BLOB_NOT_FOUND);
      }

      if (error.statusCode === 401) {
        throw new InternalServerErrorException(ErrorMessages.SAS_PERMISSION);
      }

      if (error.statusCode === 403) {
        throw new InternalServerErrorException(ErrorMessages.SAS_PERMISSION);
      }

      throw new InternalServerErrorException(ErrorMessages.SAS_GENERATION);
    }
  }

  /**
   * Implementación genérica de **listado de blobs** (aplica filtro por `directory` si se indica)
   * y **enriquece** cada item con `BlobInfo` (nombre, directorio, tamaño formateado, etc.).
   *
   * @param {ContainerClient} containerClient - Cliente de contenedor con SAS embebido.
   * @param {string} containerName - Nombre del contenedor.
   * @param {string} [directory] - Directorio lógico para `prefix`.
   * @returns {Promise<BlobListResponse>} Resumen con blobs, totales y `requestId`.
   */
  private async listBlobsGeneric<T extends BlobInfo>(
    containerClient: ContainerClient,
    containerName: string,
    directory?: string,
  ): Promise<BlobListResponse> {
    const blobItems = [];

    const listOptions =
      directory && directory.trim() !== ''
        ? { prefix: directory.endsWith('/') ? directory : directory + '/' }
        : {};

    for await (const blob of containerClient.listBlobsFlat(listOptions)) {
      if (blob.properties.contentLength && blob.properties.contentLength > 0) {
        blobItems.push(blob);
      }
    }

    const { enrichedBlobs, totalSize } = processEnrichedBlobs<T>(blobItems);

    const baseResponse: BlobListResponse = {
      blobs: enrichedBlobs as BlobInfo[],
      containerName,
      totalBlobs: enrichedBlobs.length,
      totalSize,
      totalSizeFormatted: formatFileSize(totalSize),
      requestId: uuidv4(),
    };

    if (directory && directory.trim() !== '') {
      baseResponse.directory = directory;
    }

    return baseResponse;
  }

  /**
   * Lista blobs de un contenedor (opcionalmente filtrando por `directory` como `prefix`),
   * devolviendo datos enriquecidos y totales.
   *
   * Permisos SAS: `LIST` (a nivel **contenedor**).
   *
   * @param {string} containerName - Contenedor a listar.
   * @param {string} [directory] - Prefijo opcional (carpeta lógica).
   * @returns {Promise<BlobListResponse>}
   * @throws {BadRequestException|InternalServerErrorException}
   *  - `CONTAINER_NOT_FOUND`, `SAS_PERMISSION`, `SAS_GENERATION`.
   */
  async listBlobs(
    containerName: string,
    directory?: string,
  ): Promise<BlobListResponse> {
    // Generar SAS token con permisos de listado
    const sasData = await this.sasService.generateSasTokenWithParams(
      containerName,
      undefined,
      [SasPermission.LIST],
      30, // 30 minutos de expiración
    );

    try {
      // Crear cliente de contenedor con SAS token
      const containerUrl = `https://${this.configService.get<string>('azure.storageAccountName')}.blob.core.windows.net/${containerName}`;
      const containerClient = new ContainerClient(
        `${containerUrl}?${sasData.sasToken}`,
      );

      return await this.listBlobsGeneric<BlobInfo>(
        containerClient,
        containerName,
        directory,
      );
    } catch (error: any) {
      console.error('Error listing blobs:', error);

      if (error.statusCode === 404) {
        throw new BadRequestException(ErrorMessages.CONTAINER_NOT_FOUND);
      }

      if (error.statusCode === 401) {
        throw new InternalServerErrorException(ErrorMessages.SAS_PERMISSION);
      }

      if (error.statusCode === 403) {
        throw new InternalServerErrorException(ErrorMessages.SAS_PERMISSION);
      }

      throw new InternalServerErrorException(ErrorMessages.SAS_GENERATION);
    }
  }
}
