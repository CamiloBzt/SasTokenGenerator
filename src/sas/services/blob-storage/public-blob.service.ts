import {
  BlobServiceClient,
  BlockBlobClient,
  ContainerClient,
} from '@azure/storage-blob';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { formatFileSize, processEnrichedBlobs } from '@src/common/utils';
import { ErrorMessages } from '@src/shared/enums/error-messages.enum';
import { SasPermission } from '@src/shared/enums/sas-permission.enum';
import { BadRequestException } from '@src/shared/exceptions/bad-request.exception';
import { BusinessErrorException } from '@src/shared/exceptions/business-error.exception';
import {
  BlobContentInfo,
  ExposePublicBlobParams,
  ExposePublicBlobResult,
  PublicStoreConfig,
} from '@src/shared/interfaces/services/blob-storage/expose-public-blob.interface';
import {
  BlobInfo,
  BlobListResponse,
} from '@src/shared/interfaces/services/blob-storage/list-blobs.interface';
import { v4 as uuidv4 } from 'uuid';
import { SasService } from '../sas.service';
import { PrivateBlobService } from './private-blob.service';

/**
 * @fileoverview
 * Servicio para **exponer** blobs privados en un **store público** (otra cuenta/contenedor)
 * y para **listar** blobs del store público. Ofrece dos estrategias:
 *
 * - **Copia directa (direct copy)**: `syncCopyFromURL` desde el blob privado al público.
 * - **Descargar y subir (download-upload)**: descarga del privado y sube al público.
 *
 * Seguridad:
 * - Genera SAS temporales y de **mínimos privilegios** para cada operación.
 * - Opcionalmente reemplaza el dominio de Azure por un **custom domain** público.
 *
 * @module sas/services/blob-storage/public-blob.service
 */
@Injectable()
export class PublicBlobService {
  /**
   * @param {ConfigService} configService - Configuración de entorno (connection strings/nombres).
   * @param {SasService} sasService - Servicio generador de SAS tokens.
   * @param {PrivateBlobService} privateBlobService - Acceso al store privado (descargas, etc.).
   */
  constructor(
    private readonly configService: ConfigService,
    private readonly sasService: SasService,
    private readonly privateBlobService: PrivateBlobService,
  ) {}

  /**
   * Construye `{directory}/{blobName}` si `directory` viene informado.
   *
   * @param {string | undefined} directory - Carpeta lógica opcional.
   * @param {string} blobName - Nombre del blob (con extensión).
   * @returns {string} Ruta completa.
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
   * Reemplaza `*.blob.core.windows.net` por un **custom domain** si está configurado.
   *
   * @param {string} originalUrl - URL SAS generada.
   * @param {string} accountName - Nombre de cuenta de Azure Storage.
   * @returns {string} URL con dominio personalizado (si aplica) o la original.
   */
  private replaceWithCustomDomain(
    originalUrl: string,
    accountName: string,
  ): string {
    const customDomain = this.configService.get<string>(
      'azure.publicCustomDomain',
    );

    if (!customDomain || !accountName) {
      return originalUrl;
    }

    const azureDomain = `${accountName}.blob.core.windows.net`;
    return originalUrl.replace(azureDomain, customDomain);
  }

  /**
   * Extrae `AccountName` desde un **connection string**.
   *
   * @param {string} connectionString - Connection string del store público.
   * @returns {string|null} Account name o `null` si no pudo extraerse.
   */
  private extractAccountNameFromConnectionString(
    connectionString: string,
  ): string | null {
    try {
      const regex = /AccountName=([^;]+)/i;
      const accountNameMatch = regex.exec(connectionString);
      return accountNameMatch ? accountNameMatch[1] : null;
    } catch (error) {
      console.error(
        'Error extracting account name from connection string:',
        error,
      );
      return null;
    }
  }

  /**
   * Obtiene y valida la configuración del **store público**.
   *
   * @returns {PublicStoreConfig} Config consolidada (conn string, contenedor y accountName).
   * @throws {BadRequestException}
   *  - `PUBLIC_CONNECTION_STRING_MISSING`
   *  - `PUBLIC_CONTAINER_NAME_MISSING`
   *  - `PUBLIC_STORE_ACCESS_ERROR` (si no se extrae account name)
   */
  private getPublicStoreConfig(): PublicStoreConfig {
    const publicConnectionString = this.configService.get<string>(
      'azure.publicConnectionString',
    );
    const publicContainerName = this.configService.get<string>(
      'azure.publicContainerName',
    );

    if (!publicConnectionString) {
      throw new BadRequestException(
        ErrorMessages.PUBLIC_CONNECTION_STRING_MISSING,
      );
    }

    if (!publicContainerName) {
      throw new BadRequestException(
        ErrorMessages.PUBLIC_CONTAINER_NAME_MISSING,
      );
    }

    const publicAccountName = this.extractAccountNameFromConnectionString(
      publicConnectionString,
    );

    if (!publicAccountName) {
      throw new BadRequestException(ErrorMessages.PUBLIC_STORE_ACCESS_ERROR);
    }

    return {
      publicConnectionString,
      publicContainerName,
      publicAccountName,
    };
  }

  /**
   * Genera un **SAS público** (solo lectura) para el `fullBlobPath` y
   * reemplaza el dominio por el **custom domain** si está configurado.
   *
   * @param {PublicStoreConfig} config - Config del store público.
   * @param {string} fullBlobPath - Ruta completa destino en el store público.
   * @param {number} expirationMinutes - Minutos de validez del token.
   * @returns {Promise<{ sasToken: string; sasUrl: string; permissions: string; expiresOn: Date }>}
   */
  private async generatePublicSasToken(
    config: PublicStoreConfig,
    fullBlobPath: string,
    expirationMinutes: number,
  ): Promise<{
    sasToken: string;
    sasUrl: string;
    permissions: string;
    expiresOn: Date;
  }> {
    const publicSasData =
      await this.sasService.generateSasTokenWithCustomConnection(
        config.publicConnectionString,
        config.publicContainerName,
        fullBlobPath,
        [SasPermission.READ],
        expirationMinutes,
      );

    const customSasUrl = this.replaceWithCustomDomain(
      publicSasData.sasUrl,
      config.publicAccountName,
    );

    return {
      sasToken: publicSasData.sasToken,
      sasUrl: customSasUrl,
      permissions: publicSasData.permissions,
      expiresOn: publicSasData.expiresOn,
    };
  }

  /**
   * Construye el resultado estandarizado de **exposición pública**.
   *
   * @param {ExposePublicBlobParams} params - Parámetros de exposición recibidos.
   * @param {string} fullBlobPath - Ruta completa en el público.
   * @param {{ sasToken: string; sasUrl: string; permissions: string; expiresOn: Date }} sasData - Datos SAS finales.
   * @param {BlobContentInfo} blobInfo - Info de contenido (tipo/tamaño/bytes).
   * @param {string} [base64Data] - Data Base64 si fue solicitada.
   * @returns {ExposePublicBlobResult}
   */
  private buildExposeResult(
    params: ExposePublicBlobParams,
    fullBlobPath: string,
    sasData: {
      sasToken: string;
      sasUrl: string;
      permissions: string;
      expiresOn: Date;
    },
    blobInfo: BlobContentInfo,
    base64Data?: string,
  ): ExposePublicBlobResult {
    const result: ExposePublicBlobResult = {
      sasToken: sasData.sasToken,
      sasUrl: sasData.sasUrl,
      permissions: sasData.permissions,
      expiresOn: sasData.expiresOn,
      contentType: blobInfo.contentType,
      containerName: params.privateContainerName,
      blobName: params.blobName,
      fullPath: fullBlobPath,
      size: blobInfo.size,
      requestId: uuidv4(),
    };

    if (params.includeBase64 && base64Data) {
      result.fileBase64 = base64Data;
    }

    return result;
  }

  /**
   * Intenta **limpiar** el blob destino en el público, probando Block y Append blob.
   * (Best-effort: si falla un tipo, intenta el otro).
   *
   * @param {PublicStoreConfig} config
   * @param {string} fullBlobPath
   * @returns {Promise<void>}
   */
  private async cleanupDestinationBlob(
    config: PublicStoreConfig,
    fullBlobPath: string,
  ): Promise<void> {
    const publicBlobServiceClient = BlobServiceClient.fromConnectionString(
      config.publicConnectionString,
    );

    // Intentar eliminar como Block Blob
    try {
      const blockBlobClient = publicBlobServiceClient
        .getContainerClient(config.publicContainerName)
        .getBlockBlobClient(fullBlobPath);

      const blockExists = await blockBlobClient.exists();
      if (blockExists) {
        await blockBlobClient.deleteIfExists();

        return;
      }
    } catch (blockError) {
      console.error(
        `⚠️  Could not delete as Block Blob: ${blockError.message}`,
      );
    }

    // Intentar eliminar como Append Blob
    try {
      const appendBlobClient = publicBlobServiceClient
        .getContainerClient(config.publicContainerName)
        .getAppendBlobClient(fullBlobPath);

      const appendExists = await appendBlobClient.exists();
      if (appendExists) {
        await appendBlobClient.deleteIfExists();

        return;
      }
    } catch (appendError) {
      console.error(
        `⚠️  Could not delete as Append Blob: ${appendError.message}`,
      );
    }
  }

  /**
   * Estrategia **download-upload**: descarga del privado y sube al público como Block Blob.
   *
   * @param {ExposePublicBlobParams} params
   * @param {PublicStoreConfig} config
   * @param {string} fullBlobPath
   * @returns {Promise<{ blobInfo: BlobContentInfo; base64Data?: string }>}
   */
  private async exposePublicBlobByDownloadUpload(
    params: ExposePublicBlobParams,
    config: PublicStoreConfig,
    fullBlobPath: string,
  ): Promise<{ blobInfo: BlobContentInfo; base64Data?: string }> {
    // 1. Limpiar cualquier blob existente en el destino
    await this.cleanupDestinationBlob(config, fullBlobPath);

    // 2. Descargar el archivo del store privado
    const privateDownloadResult = await this.privateBlobService.downloadBlob(
      params.privateContainerName,
      params.directory,
      params.blobName,
    );

    // 3. Crear cliente para el store público
    const publicBlobServiceClient = BlobServiceClient.fromConnectionString(
      config.publicConnectionString,
    );

    // 4. Subir el archivo al store público como Block Blob
    const publicBlockBlobClient = publicBlobServiceClient
      .getContainerClient(config.publicContainerName)
      .getBlockBlobClient(fullBlobPath);

    // Verificar una vez más que el destino está limpio antes de subir
    const stillExists = await publicBlockBlobClient.exists();
    if (stillExists) {
      await publicBlockBlobClient.deleteIfExists();
    }

    await publicBlockBlobClient.upload(
      privateDownloadResult.data,
      privateDownloadResult.data.length,
      {
        blobHTTPHeaders: {
          blobContentType: privateDownloadResult.contentType,
        },
        metadata: {
          expirationTime: new Date(
            Date.now() + params.expirationMinutes * 60 * 1000,
          ).toISOString(),
          sourceContainer: params.privateContainerName,
          sourceBlob: fullBlobPath,
          createdAt: new Date().toISOString(),
          exposeMethod: 'download_upload',
          recreated: 'true',
        },
      },
    );

    const blobInfo: BlobContentInfo = {
      contentType: privateDownloadResult.contentType,
      size: privateDownloadResult.data.length,
      data: privateDownloadResult.data,
    };

    const base64Data = params.includeBase64
      ? privateDownloadResult.data.toString('base64')
      : undefined;

    return { blobInfo, base64Data };
  }

  /**
   * Estrategia **copia directa**: `syncCopyFromURL` del blob privado al público.
   *
   * @param {ExposePublicBlobParams} params
   * @param {PublicStoreConfig} config
   * @param {string} fullBlobPath
   * @returns {Promise<{ blobInfo: BlobContentInfo; base64Data?: string }>}
   * @throws {BusinessErrorException|InternalServerErrorException}
   *  - `BLOB_NOT_FOUND` si el blob fuente no existe.
   *  - Error genérico si `copyStatus` no es `success`.
   */
  private async exposePublicBlobByDirectCopy(
    params: ExposePublicBlobParams,
    config: PublicStoreConfig,
    fullBlobPath: string,
  ): Promise<{ blobInfo: BlobContentInfo; base64Data?: string }> {
    // 1. Limpiar cualquier blob existente en el destino
    await this.cleanupDestinationBlob(config, fullBlobPath);

    // 2. Generar SAS token para el blob fuente (privado) con permisos de READ
    const sourceSasData = await this.sasService.generateSasTokenWithParams(
      params.privateContainerName,
      fullBlobPath,
      [SasPermission.READ],
      60, // 60 minutos para la operación de copia
    );

    // 3. Crear clientes para ambos stores
    const publicBlobServiceClient = BlobServiceClient.fromConnectionString(
      config.publicConnectionString,
    );

    const sourceBlockBlobClient = new BlockBlobClient(sourceSasData.sasUrl);
    const destinationBlockBlobClient = publicBlobServiceClient
      .getContainerClient(config.publicContainerName)
      .getBlockBlobClient(fullBlobPath);

    // 4. Verificar que el blob fuente existe y obtener sus propiedades
    const sourceExists = await sourceBlockBlobClient.exists();
    if (!sourceExists) {
      throw new BusinessErrorException(ErrorMessages.BLOB_NOT_FOUND);
    }

    const sourceProperties = await sourceBlockBlobClient.getProperties();

    // 5. Verificar una vez más que el destino está limpio
    const stillExists = await destinationBlockBlobClient.exists();
    if (stillExists) {
      await destinationBlockBlobClient.deleteIfExists();
    }

    // 6. Realizar la copia directa
    const copyOperation = await destinationBlockBlobClient.syncCopyFromURL(
      sourceSasData.sasUrl,
    );

    if (copyOperation.copyStatus !== 'success') {
      throw new InternalServerErrorException(
        `Error al copiar blob al store público. Copy status: ${copyOperation.copyStatus}`,
      );
    }

    // 7. Configurar metadatos en el blob de destino
    await destinationBlockBlobClient.setMetadata({
      expirationTime: new Date(
        Date.now() + params.expirationMinutes * 60 * 1000,
      ).toISOString(),
      sourceContainer: params.privateContainerName,
      sourceBlob: fullBlobPath,
      createdAt: new Date().toISOString(),
      exposeMethod: 'direct_copy',
      recreated: 'true',
    });

    // 8. Preservar headers HTTP originales
    await destinationBlockBlobClient.setHTTPHeaders({
      blobContentType: sourceProperties.contentType,
      blobContentEncoding: sourceProperties.contentEncoding,
      blobContentLanguage: sourceProperties.contentLanguage,
      blobContentDisposition: sourceProperties.contentDisposition,
      blobCacheControl: sourceProperties.cacheControl,
    });

    const blobInfo: BlobContentInfo = {
      contentType: sourceProperties.contentType || 'application/octet-stream',
      size: sourceProperties.contentLength || 0,
    };

    // 9. Obtener Base64 si se solicita
    let base64Data: string | undefined;
    if (params.includeBase64) {
      const downloadResponse = await sourceBlockBlobClient.downloadToBuffer();
      base64Data = downloadResponse.toString('base64');
    }

    return { blobInfo, base64Data };
  }

  /**
   * Mapeo y relanzamiento de errores **homogéneo** para exposición pública.
   *
   * @param {any} error
   * @throws {BadRequestException|BusinessErrorException|InternalServerErrorException}
   */
  private handleExposePublicError(error: any): never {
    // Si ya es una excepción conocida, relanzarla
    if (
      error instanceof BadRequestException ||
      error instanceof BusinessErrorException ||
      error instanceof InternalServerErrorException
    ) {
      throw error;
    }

    // Errores específicos de Azure
    if (error.statusCode === 404) {
      throw new BusinessErrorException(ErrorMessages.BLOB_NOT_FOUND);
    }

    if (error.statusCode === 401 || error.statusCode === 403) {
      throw new InternalServerErrorException(
        `${ErrorMessages.SAS_PERMISSION} ${ErrorMessages.PUBLIC_STORE_ACCESS_ERROR}`,
      );
    }

    if (error.code === 'InvalidBlobType' || error.statusCode === 409) {
      throw new InternalServerErrorException(
        `${ErrorMessages.EXPOSE_PUBLIC_FAILED} Conflicto de tipo de blob. El archivo fue limpiado pero aún existe un conflicto: ${error.message}`,
      );
    }

    // Error genérico
    throw new InternalServerErrorException(
      `${ErrorMessages.EXPOSE_PUBLIC_FAILED} ${error.message ?? 'Error desconocido'}`,
    );
  }

  /**
   * Expone un blob del **store privado** en el **store público**, generando la URL SAS final.
   *
   * @param {ExposePublicBlobParams} params - Parámetros del blob privado y opciones (expiración, base64).
   * @param {boolean} [useDirectCopy=true] - `true` usa **copia directa**, `false` usa **download-upload**.
   * @returns {Promise<ExposePublicBlobResult>} Resultado con `sasUrl`, `contentType`, `size`, etc.
   * @throws {BadRequestException|BusinessErrorException|InternalServerErrorException}
   */
  async exposePublicBlob(
    params: ExposePublicBlobParams,
    useDirectCopy: boolean = true,
  ): Promise<ExposePublicBlobResult> {
    const fullBlobPath = this.buildFullBlobPath(
      params.directory,
      params.blobName,
    );

    try {
      // 1. Obtener y validar configuración del store público
      const config = this.getPublicStoreConfig();

      // 2. Ejecutar estrategia de copia según el parámetro
      const { blobInfo, base64Data } = useDirectCopy
        ? await this.exposePublicBlobByDirectCopy(params, config, fullBlobPath)
        : await this.exposePublicBlobByDownloadUpload(
            params,
            config,
            fullBlobPath,
          );

      // 3. Generar SAS token público
      const sasData = await this.generatePublicSasToken(
        config,
        fullBlobPath,
        params.expirationMinutes,
      );

      // 4. Construir y retornar resultado
      const result = this.buildExposeResult(
        params,
        fullBlobPath,
        sasData,
        blobInfo,
        base64Data,
      );

      return result;
    } catch (error: any) {
      this.handleExposePublicError(error);
    }
  }

  /**
   * Crea un `ContainerClient` para el **store público** usando SAS de `LIST`.
   *
   * @param {PublicStoreConfig} config
   * @returns {Promise<ContainerClient>}
   */
  private async createPublicContainerClient(
    config: PublicStoreConfig,
  ): Promise<ContainerClient> {
    // Generar SAS token para operaciones del contenedor público
    const publicSasData =
      await this.sasService.generateSasTokenWithCustomConnection(
        config.publicConnectionString,
        config.publicContainerName,
        undefined,
        [SasPermission.LIST],
        30,
      );

    const containerUrl = publicSasData.sasUrl.split('?')[0];
    return new ContainerClient(`${containerUrl}?${publicSasData.sasToken}`);
  }

  /**
   * Implementación genérica para **listar blobs** usando un `ContainerClient` ya autenticado.
   * Enriquece elementos con `BlobInfo` y agrega totales (tamaño y cantidad).
   *
   * @param {ContainerClient} containerClient - Cliente del contenedor público (con SAS embebido).
   * @param {string} containerName - Nombre del contenedor final a reportar.
   * @param {string} [directory] - Prefijo opcional (carpeta lógica).
   * @param {string} [publicContainerName] - Alias para reportar en respuesta (si difiere).
   * @returns {Promise<BlobListResponse>}
   */
  private async listBlobsGeneric<T extends BlobInfo>(
    containerClient: ContainerClient,
    containerName: string,
    directory?: string,
    publicContainerName?: string,
  ): Promise<BlobListResponse> {
    const blobItems = [];

    const listOptions =
      directory && directory.trim() !== ''
        ? { prefix: directory.endsWith('/') ? directory : directory + '/' }
        : {};

    for await (const blob of containerClient.listBlobsFlat(listOptions)) {
      blobItems.push(blob);
    }

    const { enrichedBlobs, totalSize } = processEnrichedBlobs<T>(blobItems);

    const baseResponse: BlobListResponse = {
      blobs: enrichedBlobs as BlobInfo[],
      containerName: publicContainerName || containerName,
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
   * Lista blobs del **store público** (opcionalmente filtrando por `directory`).
   *
   * @param {string} [directory] - Prefijo/carpeta lógica a listar.
   * @returns {Promise<BlobListResponse>} Resumen con blobs, totales y `requestId`.
   * @throws {BadRequestException|BusinessErrorException|InternalServerErrorException}
   */
  async listPublicBlobs(directory?: string): Promise<BlobListResponse> {
    try {
      // 1. Obtener y validar configuración del store público
      const config = this.getPublicStoreConfig();

      // 2. Crear cliente de contenedor público
      const containerClient = await this.createPublicContainerClient(config);

      // 3. Usar función genérica para listar blobs públicos
      return await this.listBlobsGeneric<BlobInfo>(
        containerClient,
        config.publicContainerName,
        directory,
        config.publicContainerName,
      );
    } catch (error: any) {
      this.handleExposePublicError(error);
    }
  }
}
