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

@Injectable()
export class PrivateBlobService {
  constructor(
    private readonly configService: ConfigService,
    private readonly sasService: SasService,
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

      console.log('Upload completed successfully');

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

      console.log('Base64 upload completed successfully');

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

      console.log('Download completed successfully');

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

      console.log(
        `Base64 download completed successfully: ${downloadResponse.length} bytes -> ${fileBase64.length} chars`,
      );

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

      console.log('Delete attempt completed');

      // Si no se eliminó, significa que no existía
      if (!deletionResponse.succeeded) {
        throw new BusinessErrorException(ErrorMessages.BLOB_NOT_FOUND);
      }

      console.log('Delete completed successfully');

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
      blobItems.push(blob);
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
