export interface PublicStoreConfig {
  publicConnectionString: string;
  publicContainerName: string;
  publicAccountName: string;
}

export interface ExposePublicBlobParams {
  privateContainerName: string;
  directory: string;
  blobName: string;
  expirationMinutes: number;
  includeBase64: boolean;
}

export interface ExposePublicBlobResult {
  sasToken: string;
  sasUrl: string;
  permissions: string;
  expiresOn: Date;
  fileBase64?: string;
  contentType: string;
  containerName: string;
  blobName: string;
  fullPath: string;
  size: number;
  requestId: string;
}

export interface BlobContentInfo {
  contentType: string;
  size: number;
  data?: Buffer;
}
