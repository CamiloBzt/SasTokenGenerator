import { Injectable } from '@nestjs/common';
import {
  ExposePublicBlobParams,
  ExposePublicBlobResult,
} from '@src/shared/interfaces/services/blob-storage/expose-public-blob.interface';
import { BlobListResponse } from '@src/shared/interfaces/services/blob-storage/list-blobs.interface';
import { BlobOperationService } from './blob-operation.service';
import { PrivateBlobService } from './private-blob.service';
import { PublicBlobService } from './public-blob.service';

/**
 * Servicio principal de almacenamiento de blobs.
 *
 * Expone una interfaz unificada para interactuar con blobs privados y públicos en Azure Storage,
 * así como realizar operaciones de copia y movimiento de blobs dentro de un contenedor.
 *
 * Delegación de responsabilidades:
 * - **PrivateBlobService** → Maneja cargas, descargas, eliminaciones y listados de blobs privados.
 * - **PublicBlobService** → Gestiona la exposición y listado de blobs públicos.
 * - **BlobOperationService** → Ejecuta operaciones de movimiento y copia entre blobs.
 */
@Injectable()
export class BlobStorageService {
  constructor(
    private readonly privateBlobService: PrivateBlobService,
    private readonly publicBlobService: PublicBlobService,
    private readonly blobOperationService: BlobOperationService,
  ) {}

  // ================== Métodos de Blob Privado ==================

  /**
   * Sube un archivo al almacenamiento de blobs en un contenedor privado.
   *
   * @param containerName - Nombre del contenedor de destino.
   * @param directory - Directorio opcional dentro del contenedor.
   * @param blobName - Nombre que tendrá el blob.
   * @param file - Archivo recibido por `Multer` desde el cliente.
   * @returns Objeto con la URL, contenedor, nombre, ruta completa y `requestId`.
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
    return this.privateBlobService.uploadBlob(
      containerName,
      directory,
      blobName,
      file,
    );
  }

  /**
   * Sube un archivo en formato Base64 al almacenamiento privado.
   *
   * @param containerName - Nombre del contenedor.
   * @param directory - Directorio opcional.
   * @param blobName - Nombre del blob.
   * @param fileBase64 - Contenido del archivo en base64.
   * @param mimeType - Tipo MIME del archivo.
   * @returns Objeto con URL, contenedor, nombre, ruta y `requestId`.
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
    return this.privateBlobService.uploadBlobBase64(
      containerName,
      directory,
      blobName,
      fileBase64,
      mimeType,
    );
  }

  /**
   * Descarga un blob privado como un `Buffer`.
   *
   * @param containerName - Nombre del contenedor.
   * @param directory - Directorio opcional.
   * @param blobName - Nombre del blob a descargar.
   * @returns Contenido del archivo, tipo MIME, ruta y `requestId`.
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
    return this.privateBlobService.downloadBlob(
      containerName,
      directory,
      blobName,
    );
  }

  /**
   * Descarga un blob privado en formato Base64.
   *
   * @param containerName - Nombre del contenedor.
   * @param directory - Directorio opcional.
   * @param blobName - Nombre del blob.
   * @returns Archivo codificado en Base64, tipo MIME, tamaño, ruta y `requestId`.
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
    return this.privateBlobService.downloadBlobBase64(
      containerName,
      directory,
      blobName,
    );
  }

  /**
   * Elimina un blob de un contenedor privado.
   *
   * @param containerName - Nombre del contenedor.
   * @param directory - Directorio opcional.
   * @param blobName - Nombre del blob.
   * @returns Información del blob eliminado (contenedor, nombre, ruta y `requestId`).
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
    return this.privateBlobService.deleteBlob(
      containerName,
      directory,
      blobName,
    );
  }

  /**
   * Lista todos los blobs de un contenedor privado o directorio específico.
   *
   * @param containerName - Nombre del contenedor.
   * @param directory - Directorio opcional.
   * @returns Lista de blobs y metadatos.
   */
  async listBlobs(
    containerName: string,
    directory?: string,
  ): Promise<BlobListResponse> {
    return this.privateBlobService.listBlobs(containerName, directory);
  }

  // ================== Métodos de Operaciones (Move/Copy) ==================

  /**
   * Mueve un blob dentro del mismo contenedor.
   *
   * @param containerName - Nombre del contenedor.
   * @param sourceBlobPath - Ruta del blob de origen.
   * @param destinationBlobPath - Ruta de destino.
   * @returns Resultado de la operación con paths y `requestId`.
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
    return this.blobOperationService.moveBlob(
      containerName,
      sourceBlobPath,
      destinationBlobPath,
    );
  }

  /**
   * Copia un blob dentro del mismo contenedor.
   *
   * @param containerName - Nombre del contenedor.
   * @param sourceBlobPath - Ruta del blob origen.
   * @param destinationBlobPath - Ruta del blob destino.
   * @returns Resultado con mensaje, paths y `requestId`.
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
    return this.blobOperationService.copyBlob(
      containerName,
      sourceBlobPath,
      destinationBlobPath,
    );
  }

  // ================== Métodos de Blob Público ==================

  /**
   * Expone un blob como público mediante copia directa o proceso alternativo.
   *
   * @param params - Parámetros de exposición (`containerName`, `blobName`, etc.).
   * @param useDirectCopy - Indica si se usa copia directa (default: true).
   * @returns Resultado con URL pública y metadatos.
   */
  async exposePublicBlob(
    params: ExposePublicBlobParams,
    useDirectCopy: boolean = true,
  ): Promise<ExposePublicBlobResult> {
    return this.publicBlobService.exposePublicBlob(params, useDirectCopy);
  }

  /**
   * Lista blobs expuestos públicamente.
   *
   * @param directory - Directorio opcional dentro del contenedor público.
   * @returns Lista de blobs públicos y metadatos.
   */
  async listPublicBlobs(directory?: string): Promise<BlobListResponse> {
    return this.publicBlobService.listPublicBlobs(directory);
  }
}
