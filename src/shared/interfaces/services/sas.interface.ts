import { SasPermission } from '@src/shared/enums/sas-permission.enum';

export interface SasGenerationParams {
  containerName: string;
  fileName?: string;
  permissions?: SasPermission[];
  expirationMinutes?: number;
  userIp?: string;
}

export interface SasGenerationResult {
  sasToken: string;
  sasUrl: string;
  permissions: string;
  expiresOn: Date;
  containerName: string;
  blobName?: string;
  requestId: string;
}
