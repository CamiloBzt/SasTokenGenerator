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
import { BusinessErrorException } from '@src/shared/exceptions/business-error.exception';
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

  /**
   * Valida que el base64 y el mimeType sean válidos.
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

      console.log(`Converting Base64 to buffer: ${fileBuffer.length} bytes`);

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

  async moveBlob(
    containerName: string,
    sourceBlobPath: string,
    destinationBlobPath: string,
  ): Promise<{
    message: string;
    containerName: string;
    sourcePath: string;
    destinationPath: string;
    requestId: string;
  }> {
    // Validar que las rutas no sean iguales
    if (sourceBlobPath === destinationBlobPath) {
      throw new BadRequestException(ErrorMessages.BLOB_MOVE_SAME_PATH);
    }

    // Generar SAS tokens
    const sourceSasData = await this.sasService.generateSasTokenWithParams(
      containerName,
      sourceBlobPath,
      [SasPermission.READ, SasPermission.DELETE],
      30, // 30 minutos de expiración
    );

    const destinationSasData = await this.sasService.generateSasTokenWithParams(
      containerName,
      destinationBlobPath,
      [SasPermission.WRITE, SasPermission.CREATE],
      30,
    );

    try {
      // Crear clientes para los blobs de origen y destino
      const sourceBlockBlobClient = new BlockBlobClient(sourceSasData.sasUrl);
      const destinationBlockBlobClient = new BlockBlobClient(
        destinationSasData.sasUrl,
      );

      // Verificar que el blob de origen existe
      const sourceExists = await sourceBlockBlobClient.exists();
      if (!sourceExists) {
        throw new BusinessErrorException(ErrorMessages.BLOB_NOT_FOUND);
      }

      // Obtener las propiedades del blob origen para preservar metadatos
      const sourceProperties = await sourceBlockBlobClient.getProperties();

      // Copiar el blob
      const copyOperation = await destinationBlockBlobClient.syncCopyFromURL(
        sourceBlockBlobClient.url,
      );

      // Verificar que la copia fue exitosa
      if (copyOperation.copyStatus !== 'success') {
        throw new InternalServerErrorException(
          `${ErrorMessages.BLOB_MOVE_FAILED} Copy status: ${copyOperation.copyStatus}`,
        );
      }

      // Preservar los metadatos y propiedades del archivo original
      try {
        await destinationBlockBlobClient.setHTTPHeaders({
          blobContentType: sourceProperties.contentType,
          blobContentEncoding: sourceProperties.contentEncoding,
          blobContentLanguage: sourceProperties.contentLanguage,
          blobContentDisposition: sourceProperties.contentDisposition,
          blobCacheControl: sourceProperties.cacheControl,
        });

        if (
          sourceProperties.metadata &&
          Object.keys(sourceProperties.metadata).length > 0
        ) {
          await destinationBlockBlobClient.setMetadata(
            sourceProperties.metadata,
          );
        }
      } catch (error: any) {
        console.warn(
          'Warning: Could not preserve all metadata:',
          error.message,
        );
      }

      // Eliminar el blob original
      try {
        const deleteResult = await sourceBlockBlobClient.deleteIfExists();
        if (!deleteResult.succeeded) {
          console.warn(
            `Warning: Failed to delete source blob after copy: ${sourceBlobPath}. Manual cleanup may be required.`,
          );
        }
      } catch (error: any) {
        console.warn(
          `Warning: Error deleting source blob: ${error.message}. File was copied successfully but source cleanup failed.`,
        );
      }

      console.log(
        `Successfully moved blob from ${sourceBlobPath} to ${destinationBlobPath}`,
      );

      return {
        message: 'Blob moved successfully',
        containerName,
        sourcePath: sourceBlobPath,
        destinationPath: destinationBlobPath,
        requestId: uuidv4(),
      };
    } catch (error: any) {
      console.error('Error moving blob:', error);

      if (
        error instanceof BadRequestException ||
        error instanceof BusinessErrorException
      ) {
        throw error;
      }

      if (error.statusCode === 401 || error.statusCode === 403) {
        throw new InternalServerErrorException(
          `${ErrorMessages.SAS_PERMISSION} Detalles: ${error.message || 'Sin permisos suficientes'}`,
        );
      }

      if (error.statusCode === 404) {
        throw new BusinessErrorException(ErrorMessages.BLOB_NOT_FOUND);
      }

      throw new InternalServerErrorException(
        `${ErrorMessages.BLOB_MOVE_FAILED} Error: ${error.message || 'Error desconocido'}`,
      );
    }
  }

  async copyBlob(
    containerName: string,
    sourceBlobPath: string,
    destinationBlobPath: string,
  ): Promise<{
    message: string;
    containerName: string;
    sourcePath: string;
    destinationPath: string;
    requestId: string;
  }> {
    // Validar que las rutas no sean iguales
    if (sourceBlobPath === destinationBlobPath) {
      throw new BadRequestException(ErrorMessages.BLOB_COPY_SAME_PATH);
    }

    // Generar SAS tokens
    const sourceSasData = await this.sasService.generateSasTokenWithParams(
      containerName,
      sourceBlobPath,
      [SasPermission.READ],
      30, // 30 minutos de expiración
    );

    const destinationSasData = await this.sasService.generateSasTokenWithParams(
      containerName,
      destinationBlobPath,
      [SasPermission.WRITE, SasPermission.CREATE],
      30,
    );

    try {
      // Crear clientes para los blobs de origen y destino
      const sourceBlockBlobClient = new BlockBlobClient(sourceSasData.sasUrl);
      const destinationBlockBlobClient = new BlockBlobClient(
        destinationSasData.sasUrl,
      );

      // Verificar que el blob de origen existe
      const sourceExists = await sourceBlockBlobClient.exists();
      if (!sourceExists) {
        throw new BusinessErrorException(ErrorMessages.BLOB_NOT_FOUND);
      }

      // Obtener las propiedades del blob origen para preservar metadatos
      const sourceProperties = await sourceBlockBlobClient.getProperties();

      // Copiar el blob
      const copyOperation = await destinationBlockBlobClient.syncCopyFromURL(
        sourceBlockBlobClient.url,
      );

      // Verificar que la copia fue exitosa
      if (copyOperation.copyStatus !== 'success') {
        throw new InternalServerErrorException(
          `${ErrorMessages.BLOB_COPY_FAILED} Copy status: ${copyOperation.copyStatus}`,
        );
      }

      // Preservar los metadatos y propiedades del archivo original
      try {
        await destinationBlockBlobClient.setHTTPHeaders({
          blobContentType: sourceProperties.contentType,
          blobContentEncoding: sourceProperties.contentEncoding,
          blobContentLanguage: sourceProperties.contentLanguage,
          blobContentDisposition: sourceProperties.contentDisposition,
          blobCacheControl: sourceProperties.cacheControl,
        });

        if (
          sourceProperties.metadata &&
          Object.keys(sourceProperties.metadata).length > 0
        ) {
          await destinationBlockBlobClient.setMetadata(
            sourceProperties.metadata,
          );
        }
      } catch (error: any) {
        console.warn(
          'Warning: Could not preserve all metadata during copy:',
          error.message,
        );
      }

      console.log(
        `Successfully copied blob from ${sourceBlobPath} to ${destinationBlobPath}`,
      );

      return {
        message: 'Blob copied successfully',
        containerName,
        sourcePath: sourceBlobPath,
        destinationPath: destinationBlobPath,
        requestId: uuidv4(),
      };
    } catch (error: any) {
      console.error('Error copying blob:', error);

      if (
        error instanceof BadRequestException ||
        error instanceof BusinessErrorException
      ) {
        throw error;
      }

      if (error.statusCode === 401 || error.statusCode === 403) {
        throw new InternalServerErrorException(
          `${ErrorMessages.SAS_PERMISSION} Detalles: ${error.message || 'Sin permisos suficientes'}`,
        );
      }

      if (error.statusCode === 404) {
        throw new BusinessErrorException(ErrorMessages.BLOB_NOT_FOUND);
      }

      throw new InternalServerErrorException(
        `${ErrorMessages.BLOB_COPY_FAILED} Error: ${error.message || 'Error desconocido'}`,
      );
    }
  }
}
