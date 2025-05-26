import { ClientSecretCredential } from '@azure/identity';
import * as storageBlob from '@azure/storage-blob';
import { ConfigService } from '@nestjs/config';
import { SasService } from '../../src/sas/services/sas.service';

jest.mock('@azure/identity');
jest.mock('@azure/storage-blob');

describe('SasService.generateSasUrl', () => {
  let sasService: SasService;
  let configService: Partial<ConfigService>;

  const blobUrl =
    'https://exampleaccount.blob.core.windows.net/container/file.pdf';

  beforeEach(() => {
    jest.clearAllMocks();

    configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          'azure.tenantId': 'fake-tenant-id',
          'azure.clientId': 'fake-client-id',
          'azure.clientSecret': 'fake-client-secret',
          'azure.storageAccountName': 'exampleaccount',
        };
        return values[key];
      }),
    };

    sasService = new SasService(configService as ConfigService);
  });

  it('should generate a SAS URL', async () => {
    const mockCredential = {};
    const mockUserDelegationKey = {
      signedOid: 'oid',
      signedTid: 'tid',
      signedExpiry: new Date(Date.now() + 5 * 60 * 1000),
    };
    const mockBlobServiceClient = {
      getUserDelegationKey: jest.fn().mockResolvedValue(mockUserDelegationKey),
    };

    (ClientSecretCredential as jest.Mock).mockReturnValue(mockCredential);
    (storageBlob.BlobServiceClient as unknown as jest.Mock).mockImplementation(
      () => mockBlobServiceClient,
    );

    const sasString = 'sig=abc123';
    (storageBlob.generateBlobSASQueryParameters as jest.Mock).mockReturnValue({
      toString: () => sasString,
    });

    const result = await sasService.generateSasUrl(blobUrl, '200.100.50.25');
    expect(result).toBe(`${blobUrl}?${sasString}`);
    expect(mockBlobServiceClient.getUserDelegationKey).toHaveBeenCalled();
    expect(storageBlob.generateBlobSASQueryParameters).toHaveBeenCalled();
  });

  it('should throw if tenantId is missing (getAzureCredential)', async () => {
    (configService.get as jest.Mock).mockImplementation((key: string) => {
      const values: Record<string, string | undefined> = {
        'azure.tenantId': undefined,
        'azure.clientId': 'fake-client-id',
        'azure.clientSecret': 'fake-client-secret',
        'azure.storageAccountName': 'exampleaccount',
      };
      return values[key];
    });

    await expect(sasService.generateSasUrl(blobUrl)).rejects.toThrow(
      'Bad Request Exception',
    );
  });

  it('should throw if storageAccountName is missing', async () => {
    (configService.get as jest.Mock).mockImplementation((key: string) => {
      const values: Record<string, string | undefined> = {
        'azure.tenantId': 'fake-tenant-id',
        'azure.clientId': 'fake-client-id',
        'azure.clientSecret': 'fake-client-secret',
        'azure.storageAccountName': undefined,
      };
      return values[key];
    });

    await expect(sasService.generateSasUrl(blobUrl)).rejects.toThrow(
      'Bad Request Exception',
    );
  });

  it('should throw if the URL does not contain container or blob', async () => {
    const badUrl =
      'https://exampleaccount.blob.core.windows.net/solo-container/';
    await expect(sasService.generateSasUrl(badUrl)).rejects.toThrow(
      'URL inválida.',
    );
  });

  it('should throw if getUserDelegationKey returns 403 AuthorizationPermissionMismatch', async () => {
    const error = new storageBlob.RestError('Forbidden');
    const mockBlobServiceClient = {
      getUserDelegationKey: jest.fn().mockRejectedValue(error),
    };

    (ClientSecretCredential as jest.Mock).mockReturnValue({});
    (storageBlob.BlobServiceClient as unknown as jest.Mock).mockImplementation(
      () => mockBlobServiceClient,
    );

    await expect(sasService.generateSasUrl(blobUrl)).rejects.toThrow(
      'Error interno al solicitar el User Delegation Key.',
    );
  });

  it('should throw if generateBlobSASQueryParameters throws error', async () => {
    const mockUserDelegationKey = {
      signedOid: 'oid',
      signedTid: 'tid',
      signedExpiry: new Date(Date.now() + 5 * 60 * 1000),
    };
    const mockBlobServiceClient = {
      getUserDelegationKey: jest.fn().mockResolvedValue(mockUserDelegationKey),
    };

    (ClientSecretCredential as jest.Mock).mockReturnValue({});
    (storageBlob.BlobServiceClient as unknown as jest.Mock).mockImplementation(
      () => mockBlobServiceClient,
    );
    (
      storageBlob.generateBlobSASQueryParameters as jest.Mock
    ).mockImplementation(() => {
      throw new Error('Error en generación de SAS');
    });

    await expect(sasService.generateSasUrl(blobUrl)).rejects.toThrow(
      'Tu aplicación no tiene permisos para generar SAS Tokens.',
    );
  });
});
