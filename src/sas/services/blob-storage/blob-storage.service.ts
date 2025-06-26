import { Injectable } from '@nestjs/common';
import {
  ExposePublicBlobParams,
  ExposePublicBlobResult,
} from '@src/shared/interfaces/services/blob-storage/expose-public-blob.interface';
import { BlobListResponse } from '@src/shared/interfaces/services/blob-storage/list-blobs.interface';
import { BlobOperationService } from './blob-operation.service';
import { PrivateBlobService } from './private-blob.service';
import { PublicBlobService } from './public-blob.service';

@Injectable()
export class BlobStorageService {
  constructor(
    private readonly privateBlobService: PrivateBlobService,
    private readonly publicBlobService: PublicBlobService,
    private readonly blobOperationService: BlobOperationService,
  ) {}

  // ================== Métodos de Blob Privado ==================

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

  async listBlobs(
    containerName: string,
    directory?: string,
  ): Promise<BlobListResponse> {
    return this.privateBlobService.listBlobs(containerName, directory);
  }

  // ================== Métodos de Operaciones (Move/Copy) ==================

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

  async exposePublicBlob(
    params: ExposePublicBlobParams,
    useDirectCopy: boolean = true,
  ): Promise<ExposePublicBlobResult> {
    return this.publicBlobService.exposePublicBlob(params, useDirectCopy);
  }

  async listPublicBlobs(directory?: string): Promise<BlobListResponse> {
    return this.publicBlobService.listPublicBlobs(directory);
  }
}
