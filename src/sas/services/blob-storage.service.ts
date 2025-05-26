import {
  BlobServiceClient,
  BlockBlobClient,
  ContainerClient,
} from '@azure/storage-blob';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorMessages } from '@src/shared/enums/error-messages.enum';
import { SasPermission } from '@src/shared/enums/sas-permission.enum';
import { BadRequestException } from '@src/shared/exceptions/bad-request.exception';
import { v4 as uuidv4 } from 'uuid';
import { SasService } from './sas.service';

@Injectable()
export class BlobStorageService {
  private blobServiceClient: BlobServiceClient;

  constructor(
    private readonly configService: ConfigService,
    private readonly sasService: SasService,
  ) {
    this.initializeBlobServiceClient();
  }

  private initializeBlobServiceClient(): void {
    const connectionString = this.configService.get<string>(
      'azure.connectionString',
    );
    const accountName = this.configService.get<string>(
      'azure.storageAccountName',
    );

    if (connectionString) {
      this.blobServiceClient =
        BlobServiceClient.fromConnectionString(connectionString);
    } else if (accountName) {
      this.blobServiceClient = new BlobServiceClient(
        `https://${accountName}.blob.core.windows.net/`,
      );
    } else {
      throw new BadRequestException(ErrorMessages.ENV_MISSING);
    }
  }

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
    if (!file || !file.buffer) {
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
        throw new BadRequestException(ErrorMessages.BLOB_NOT_FOUND);
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
        throw new BadRequestException(ErrorMessages.BLOB_NOT_FOUND);
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

      // Si ya es una BadRequestException, relanzarla
      if (error instanceof BadRequestException) {
        throw error;
      }

      // Manejar errores específicos de Azure
      if (error.statusCode === 404) {
        throw new BadRequestException(ErrorMessages.BLOB_NOT_FOUND);
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

  async listBlobs(containerName: string): Promise<{
    blobs: string[];
    containerName: string;
    requestId: string;
  }> {
    return this.listBlobsInDirectory(containerName);
  }

  async listBlobsInDirectory(
    containerName: string,
    directory?: string,
  ): Promise<{
    blobs: string[];
    containerName: string;
    directory?: string;
    requestId: string;
  }> {
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

      const blobNames: string[] = [];

      // Configurar opciones de listado
      const listOptions =
        directory && directory.trim() !== ''
          ? { prefix: directory.endsWith('/') ? directory : directory + '/' }
          : {};

      // Listar blobs
      for await (const blob of containerClient.listBlobsFlat(listOptions)) {
        blobNames.push(blob.name);
      }

      const result: {
        blobs: string[];
        containerName: string;
        directory?: string;
        requestId: string;
      } = {
        blobs: blobNames,
        containerName,
        requestId: uuidv4(),
      };

      if (directory) {
        result.directory = directory;
      }

      return result;
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
