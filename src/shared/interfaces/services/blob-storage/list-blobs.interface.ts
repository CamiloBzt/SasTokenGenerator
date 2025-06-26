export interface BlobInfo {
  name: string;
  fileName: string;
  directory?: string;
  fileExtension?: string;
  size: number;
  sizeFormatted: string;
  contentType?: string;
  lastModified: Date;
  etag?: string;
}

export interface BlobListResponse {
  blobs: BlobInfo[];
  containerName: string;
  directory?: string;
  totalBlobs: number;
  totalSize: number;
  totalSizeFormatted: string;
  requestId: string;
}
