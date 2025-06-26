import { BlockBlobClient } from '@azure/storage-blob';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ErrorMessages } from '@src/shared/enums/error-messages.enum';
import { SasPermission } from '@src/shared/enums/sas-permission.enum';
import { BadRequestException } from '@src/shared/exceptions/bad-request.exception';
import { BusinessErrorException } from '@src/shared/exceptions/business-error.exception';
import { v4 as uuidv4 } from 'uuid';
import { SasService } from '../sas.service';

@Injectable()
export class BlobOperationService {
  constructor(private readonly sasService: SasService) {}

  private validateBlobPaths(
    sourceBlobPath: string,
    destinationBlobPath: string,
  ): void {
    if (sourceBlobPath === destinationBlobPath) {
      throw new BadRequestException(ErrorMessages.BLOB_SAME_PATH);
    }
  }

  private async generateBlobOperationTokens(
    containerName: string,
    sourceBlobPath: string,
    destinationBlobPath: string,
    operation: 'move' | 'copy',
  ): Promise<{
    sourceSasData: any;
    destinationSasData: any;
  }> {
    const sourcePermissions =
      operation === 'move'
        ? [SasPermission.READ, SasPermission.DELETE]
        : [SasPermission.READ];

    const [sourceSasData, destinationSasData] = await Promise.all([
      this.sasService.generateSasTokenWithParams(
        containerName,
        sourceBlobPath,
        sourcePermissions,
        30, // 30 minutos de expiración
      ),
      this.sasService.generateSasTokenWithParams(
        containerName,
        destinationBlobPath,
        [SasPermission.WRITE, SasPermission.CREATE],
        30,
      ),
    ]);

    return { sourceSasData, destinationSasData };
  }

  private async validateSourceBlobExists(
    sourceBlockBlobClient: BlockBlobClient,
  ): Promise<void> {
    const sourceExists = await sourceBlockBlobClient.exists();
    if (!sourceExists) {
      throw new BusinessErrorException(ErrorMessages.BLOB_NOT_FOUND);
    }
  }

  private async performBlobCopy(
    sourceBlockBlobClient: BlockBlobClient,
    destinationBlockBlobClient: BlockBlobClient,
    operation: 'move' | 'copy',
  ): Promise<void> {
    const copyOperation = await destinationBlockBlobClient.syncCopyFromURL(
      sourceBlockBlobClient.url,
    );

    if (copyOperation.copyStatus !== 'success') {
      const errorMessage =
        operation === 'move'
          ? ErrorMessages.BLOB_MOVE_FAILED
          : ErrorMessages.BLOB_COPY_FAILED;
      throw new InternalServerErrorException(
        `${errorMessage} Copy status: ${copyOperation.copyStatus}`,
      );
    }
  }

  private async preserveBlobMetadata(
    sourceBlockBlobClient: BlockBlobClient,
    destinationBlockBlobClient: BlockBlobClient,
    operation: 'move' | 'copy',
  ): Promise<void> {
    try {
      const sourceProperties = await sourceBlockBlobClient.getProperties();

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
        await destinationBlockBlobClient.setMetadata(sourceProperties.metadata);
      }
    } catch (error: any) {
      console.warn(
        `Warning: Could not preserve all metadata during ${operation}:`,
        error.message,
      );
    }
  }

  private async deleteSourceBlob(
    sourceBlockBlobClient: BlockBlobClient,
    sourceBlobPath: string,
  ): Promise<void> {
    try {
      const deleteResult = await sourceBlockBlobClient.deleteIfExists();
      if (!deleteResult.succeeded) {
        console.warn(
          `Warning: Failed to delete source blob after move: ${sourceBlobPath}. Manual cleanup may be required.`,
        );
      }
    } catch (error: any) {
      console.warn(
        `Warning: Error deleting source blob: ${error.message}. File was moved successfully but source cleanup failed.`,
      );
    }
  }

  private handleBlobOperationError(
    error: any,
    operation: 'move' | 'copy',
  ): void {
    if (
      error instanceof BadRequestException ||
      error instanceof BusinessErrorException
    ) {
      throw error;
    }

    if (error.statusCode === 401 || error.statusCode === 403) {
      throw new InternalServerErrorException(
        `${ErrorMessages.SAS_PERMISSION} Detalles: ${error.message ?? 'Sin permisos suficientes'}`,
      );
    }

    if (error.statusCode === 404) {
      throw new BusinessErrorException(ErrorMessages.BLOB_NOT_FOUND);
    }

    const errorMessage =
      operation === 'move'
        ? ErrorMessages.BLOB_MOVE_FAILED
        : ErrorMessages.BLOB_COPY_FAILED;

    throw new InternalServerErrorException(
      `${errorMessage} Error: ${error.message ?? 'Error desconocido'}`,
    );
  }

  private async executeBlobOperation(
    containerName: string,
    sourceBlobPath: string,
    destinationBlobPath: string,
    operation: 'move' | 'copy',
  ): Promise<{
    message: string;
    containerName: string;
    sourcePath: string;
    destinationPath: string;
    requestId: string;
  }> {
    // Validar que las rutas no sean iguales
    this.validateBlobPaths(sourceBlobPath, destinationBlobPath);

    try {
      // Generar SAS tokens
      const { sourceSasData, destinationSasData } =
        await this.generateBlobOperationTokens(
          containerName,
          sourceBlobPath,
          destinationBlobPath,
          operation,
        );

      // Crear clientes para los blobs de origen y destino
      const sourceBlockBlobClient = new BlockBlobClient(sourceSasData.sasUrl);
      const destinationBlockBlobClient = new BlockBlobClient(
        destinationSasData.sasUrl,
      );

      // Verificar que el blob de origen existe
      await this.validateSourceBlobExists(sourceBlockBlobClient);

      // Realizar la copia
      await this.performBlobCopy(
        sourceBlockBlobClient,
        destinationBlockBlobClient,
        operation,
      );

      // Preservar metadatos
      await this.preserveBlobMetadata(
        sourceBlockBlobClient,
        destinationBlockBlobClient,
        operation,
      );

      // Eliminar el blob original solo si es una operación de move
      if (operation === 'move') {
        await this.deleteSourceBlob(sourceBlockBlobClient, sourceBlobPath);
      }

      const actionPastTense = operation === 'move' ? 'moved' : 'copied';
      console.log(
        `Successfully ${actionPastTense} blob from ${sourceBlobPath} to ${destinationBlobPath}`,
      );

      const successMessage =
        operation === 'move'
          ? 'Blob moved successfully'
          : 'Blob copied successfully';

      return {
        message: successMessage,
        containerName,
        sourcePath: sourceBlobPath,
        destinationPath: destinationBlobPath,
        requestId: uuidv4(),
      };
    } catch (error: any) {
      console.error(`Error ${operation}ing blob:`, error);
      this.handleBlobOperationError(error, operation);
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
    return this.executeBlobOperation(
      containerName,
      sourceBlobPath,
      destinationBlobPath,
      'move',
    );
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
    return this.executeBlobOperation(
      containerName,
      sourceBlobPath,
      destinationBlobPath,
      'copy',
    );
  }
}
