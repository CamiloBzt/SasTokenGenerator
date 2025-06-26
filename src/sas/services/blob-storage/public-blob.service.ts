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

@Injectable()
export class PublicBlobService {
  constructor(
    private readonly configService: ConfigService,
    private readonly sasService: SasService,
    private readonly privateBlobService: PrivateBlobService,
  ) {}

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

  private extractAccountNameFromConnectionString(
    connectionString: string,
  ): string | null {
    try {
      const regex = /AccountName=([^;]+)/i;
      const accountNameMatch = regex.exec(connectionString);
      return accountNameMatch ? accountNameMatch[1] : null;
    } catch (error) {
      console.warn(
        'Error extracting account name from connection string:',
        error,
      );
      return null;
    }
  }

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

  private handleExposePublicError(error: any): never {
    console.error('Error exposing public blob:', error);

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

    // Error genérico
    throw new InternalServerErrorException(
      `${ErrorMessages.EXPOSE_PUBLIC_FAILED} ${error.message ?? 'Error desconocido'}`,
    );
  }

  private async exposePublicBlobByDownloadUpload(
    params: ExposePublicBlobParams,
    config: PublicStoreConfig,
    fullBlobPath: string,
  ): Promise<{ blobInfo: BlobContentInfo; base64Data?: string }> {
    // Descargar el archivo del store privado
    const privateDownloadResult = await this.privateBlobService.downloadBlob(
      params.privateContainerName,
      params.directory,
      params.blobName,
    );

    // Crear cliente para el store público
    const publicBlobServiceClient = BlobServiceClient.fromConnectionString(
      config.publicConnectionString,
    );

    // Subir el archivo al store público con el mismo path
    const publicBlockBlobClient = publicBlobServiceClient
      .getContainerClient(config.publicContainerName)
      .getBlockBlobClient(fullBlobPath);

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
        },
      },
    );

    console.log('Successfully uploaded blob to public store');

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

  private async exposePublicBlobByDirectCopy(
    params: ExposePublicBlobParams,
    config: PublicStoreConfig,
    fullBlobPath: string,
  ): Promise<{ blobInfo: BlobContentInfo; base64Data?: string }> {
    // Generar SAS token para el blob fuente (privado) con permisos de READ
    const sourceSasData = await this.sasService.generateSasTokenWithParams(
      params.privateContainerName,
      fullBlobPath,
      [SasPermission.READ],
      60, // 60 minutos para la operación de copia
    );

    // Crear clientes para ambos stores
    const publicBlobServiceClient = BlobServiceClient.fromConnectionString(
      config.publicConnectionString,
    );

    const sourceBlockBlobClient = new BlockBlobClient(sourceSasData.sasUrl);
    const destinationBlockBlobClient = publicBlobServiceClient
      .getContainerClient(config.publicContainerName)
      .getBlockBlobClient(fullBlobPath);

    // Verificar que el blob fuente existe y obtener sus propiedades
    const sourceExists = await sourceBlockBlobClient.exists();
    if (!sourceExists) {
      throw new BusinessErrorException(ErrorMessages.BLOB_NOT_FOUND);
    }

    const sourceProperties = await sourceBlockBlobClient.getProperties();

    // Realizar la copia directa
    const copyOperation = await destinationBlockBlobClient.syncCopyFromURL(
      sourceSasData.sasUrl,
    );

    if (copyOperation.copyStatus !== 'success') {
      throw new InternalServerErrorException(
        `Error al copiar blob al store público. Copy status: ${copyOperation.copyStatus}`,
      );
    }

    console.log('Successfully copied blob to public store via direct copy');

    // Configurar metadatos en el blob de destino
    await destinationBlockBlobClient.setMetadata({
      expirationTime: new Date(
        Date.now() + params.expirationMinutes * 60 * 1000,
      ).toISOString(),
      sourceContainer: params.privateContainerName,
      sourceBlob: fullBlobPath,
      createdAt: new Date().toISOString(),
    });

    // Preservar headers HTTP originales
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

    // Obtener Base64 si se solicita
    let base64Data: string | undefined;
    if (params.includeBase64) {
      const downloadResponse = await sourceBlockBlobClient.downloadToBuffer();
      base64Data = downloadResponse.toString('base64');
    }

    return { blobInfo, base64Data };
  }

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

      console.log(
        `Public blob exposed successfully via ${useDirectCopy ? 'direct copy' : 'download/upload'}`,
      );
      return result;
    } catch (error: any) {
      this.handleExposePublicError(error);
    }
  }

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
