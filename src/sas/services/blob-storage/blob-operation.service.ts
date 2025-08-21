import { BlockBlobClient } from '@azure/storage-blob';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ErrorMessages } from '@src/shared/enums/error-messages.enum';
import { SasPermission } from '@src/shared/enums/sas-permission.enum';
import { BadRequestException } from '@src/shared/exceptions/bad-request.exception';
import { BusinessErrorException } from '@src/shared/exceptions/business-error.exception';
import { v4 as uuidv4 } from 'uuid';
import { SasService } from '../sas.service';

/**
 * @fileoverview
 * Servicio para **operaciones entre blobs** dentro de un mismo contenedor:
 * - **copy**: copia el blob de `source` a `destination` preservando metadatos.
 * - **move**: copia y, si es exitoso, **elimina** el blob de origen.
 *
 * Seguridad:
 * - Genera SAS ad-hoc con los **permisos mínimos** necesarios por operación:
 *   - copy: `READ` en origen, `WRITE`+`CREATE` en destino.
 *   - move: `READ`+`DELETE` en origen, `WRITE`+`CREATE` en destino.
 *
 * Manejo de errores:
 * - Errores de negocio (no existe fuente) → `BusinessErrorException`.
 * - Errores de permisos/credenciales → `InternalServerErrorException`.
 * - Paths iguales → `BadRequestException`.
 *
 * @module sas/services/blob-storage/blob-operation.service
 */
@Injectable()
export class BlobOperationService {
  /**
   * @param {SasService} sasService - Servicio para generación de SAS tokens.
   */
  constructor(private readonly sasService: SasService) {}

  /**
   * Valida que las rutas **no sean idénticas**.
   *
   * @param {string} sourceBlobPath - Ruta del blob origen (puede incluir subdirectorios).
   * @param {string} destinationBlobPath - Ruta del blob destino.
   * @throws {BadRequestException} Si ambas rutas son iguales.
   */
  private validateBlobPaths(
    sourceBlobPath: string,
    destinationBlobPath: string,
  ): void {
    if (sourceBlobPath === destinationBlobPath) {
      throw new BadRequestException(ErrorMessages.BLOB_SAME_PATH);
    }
  }

  /**
   * Genera los **SAS tokens** requeridos para la operación.
   *
   * @param {string} containerName - Contenedor donde residen origen y destino.
   * @param {string} sourceBlobPath - Blob origen.
   * @param {string} destinationBlobPath - Blob destino.
   * @param {'move'|'copy'} operation - Tipo de operación.
   * @returns {Promise<{ sourceSasData: any; destinationSasData: any }>}
   */
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

  /**
   * Verifica que el **blob de origen exista**.
   *
   * @param {BlockBlobClient} sourceBlockBlobClient - Cliente del blob origen (con SAS).
   * @throws {BusinessErrorException} Si el blob de origen no existe.
   */
  private async validateSourceBlobExists(
    sourceBlockBlobClient: BlockBlobClient,
  ): Promise<void> {
    const sourceExists = await sourceBlockBlobClient.exists();
    if (!sourceExists) {
      throw new BusinessErrorException(ErrorMessages.BLOB_NOT_FOUND);
    }
  }

  /**
   * Realiza la **copia** del blob (`syncCopyFromURL`) y valida estado.
   *
   * @param {BlockBlobClient} sourceBlockBlobClient - Cliente del blob origen.
   * @param {BlockBlobClient} destinationBlockBlobClient - Cliente del blob destino.
   * @param {'move'|'copy'} operation - Tipo de operación (afecta el mensaje de error).
   * @throws {InternalServerErrorException} Si `copyStatus` no es `success`.
   */
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

  /**
   * **Preserva** headers y metadatos del origen en el destino (best effort).
   *
   * @param {BlockBlobClient} sourceBlockBlobClient
   * @param {BlockBlobClient} destinationBlockBlobClient
   * @param {'move'|'copy'} operation
   * @returns {Promise<void>}
   *
   * @remarks
   * Errores en esta etapa no rompen la operación principal; solo se advierten.
   */
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

  /**
   * Intenta **eliminar** el blob de origen tras un **move**.
   * Si falla, **no interrumpe** la operación; solo registra advertencia.
   *
   * @param {BlockBlobClient} sourceBlockBlobClient
   * @param {string} sourceBlobPath
   */
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

  /**
   * Mapea y relanza errores de manera consistente para `move`/`copy`.
   *
   * @param {any} error - Error capturado.
   * @param {'move'|'copy'} operation - Tipo de operación (para mensajes).
   * @throws {BadRequestException|BusinessErrorException|InternalServerErrorException}
   */
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

  /**
   * Ejecuta la operación genérica de **copy/move**:
   * - Valida paths.
   * - Genera SAS de origen/destino.
   * - Verifica existencia del origen.
   * - Copia usando `syncCopyFromURL`.
   * - Preserva metadatos.
   * - Elimina origen si es `move`.
   *
   * @param {string} containerName
   * @param {string} sourceBlobPath
   * @param {string} destinationBlobPath
   * @param {'move'|'copy'} operation
   * @returns {Promise<{ message: string; containerName: string; sourcePath: string; destinationPath: string; requestId: string; }>}
   * @throws {BadRequestException|BusinessErrorException|InternalServerErrorException}
   */
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

  /**
   * **Mueve** un blob: copia y elimina el origen si la copia es exitosa.
   *
   * @param {string} containerName - Contenedor.
   * @param {string} sourceBlobPath - Ruta origen (incluye nombre y extensión).
   * @param {string} destinationBlobPath - Ruta destino.
   * @returns {Promise<{ message: string; containerName: string; sourcePath: string; destinationPath: string; requestId: string; }>}
   */
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

  /**
   * **Copia** un blob de un path a otro, preservando metadatos.
   *
   * @param {string} containerName - Contenedor.
   * @param {string} sourceBlobPath - Ruta origen (incluye nombre y extensión).
   * @param {string} destinationBlobPath - Ruta destino.
   * @returns {Promise<{ message: string; containerName: string; sourcePath: string; destinationPath: string; requestId: string; }>}
   */
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
