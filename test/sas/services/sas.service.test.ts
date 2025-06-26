import { ClientSecretCredential } from '@azure/identity';
import * as storageBlob from '@azure/storage-blob';
import { ConfigService } from '@nestjs/config';
import { SasPermission } from '@src/shared/enums/sas-permission.enum';
import { SasService } from '../../../src/sas/services/sas.service';

jest.mock('@azure/identity');
jest.mock('@azure/storage-blob');
jest.mock('uuid', () => ({
  v4: jest.fn(() => '123e4567-e89b-12d3-a456-426614174000'),
}));

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

    const mockPermissions = {
      toString: jest.fn().mockReturnValue('r'),
    };

    (ClientSecretCredential as jest.Mock).mockReturnValue(mockCredential);
    (storageBlob.BlobServiceClient as unknown as jest.Mock).mockImplementation(
      () => mockBlobServiceClient,
    );
    (storageBlob.BlobSASPermissions.parse as jest.Mock).mockReturnValue(
      mockPermissions,
    );

    const sasString = 'sig=abc123';
    (storageBlob.generateBlobSASQueryParameters as jest.Mock).mockReturnValue({
      toString: () => sasString,
    });

    const result = await sasService.generateSasUrl(blobUrl, '200.100.50.25');

    expect(result).toMatchObject({
      sasUrl: `${blobUrl}?${sasString}`,
      sasToken: sasString,
      permissions: 'r',
      containerName: 'container',
      blobName: 'file.pdf',
    });
    expect(result.expiresOn).toBeInstanceOf(Date);
    expect(result.requestId).toBeDefined();
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
      'Bad Request Exception',
    );
  });

  it('should throw if getUserDelegationKey returns 403 AuthorizationPermissionMismatch', async () => {
    const error = new storageBlob.RestError('Forbidden', {
      statusCode: 403,
      code: 'AuthorizationPermissionMismatch',
    } as any);

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

    const mockPermissions = {
      toString: jest.fn().mockReturnValue('r'),
    };

    (ClientSecretCredential as jest.Mock).mockReturnValue({});
    (storageBlob.BlobServiceClient as unknown as jest.Mock).mockImplementation(
      () => mockBlobServiceClient,
    );
    (storageBlob.BlobSASPermissions.parse as jest.Mock).mockReturnValue(
      mockPermissions,
    );
    (
      storageBlob.generateBlobSASQueryParameters as jest.Mock
    ).mockImplementation(() => {
      throw new Error('Error en generación de SAS');
    });

    await expect(sasService.generateSasUrl(blobUrl)).rejects.toThrow(
      'Tu aplicación no tiene permisos para generar SAS tokens.',
    );
  });
});

describe('SasService.generateSasTokenWithParams', () => {
  let sasService: SasService;
  let configService: Partial<ConfigService>;

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

  describe('Blob SAS', () => {
    it('should generate a SAS token for a specific blob', async () => {
      const mockCredential = {};
      const mockUserDelegationKey = {
        signedOid: 'oid',
        signedTid: 'tid',
        signedExpiry: new Date(Date.now() + 5 * 60 * 1000),
      };
      const mockBlobServiceClient = {
        getUserDelegationKey: jest
          .fn()
          .mockResolvedValue(mockUserDelegationKey),
      };

      const mockPermissions = {
        toString: jest.fn().mockReturnValue('rw'),
      };

      (ClientSecretCredential as jest.Mock).mockReturnValue(mockCredential);
      (
        storageBlob.BlobServiceClient as unknown as jest.Mock
      ).mockImplementation(() => mockBlobServiceClient);
      (storageBlob.BlobSASPermissions.parse as jest.Mock).mockReturnValue(
        mockPermissions,
      );

      const sasString = 'sig=abc123&se=2024-01-01T00:00:00Z&sp=rw';
      (storageBlob.generateBlobSASQueryParameters as jest.Mock).mockReturnValue(
        {
          toString: () => sasString,
        },
      );

      const result = await sasService.generateSasTokenWithParams(
        'uploads',
        'documents/file.pdf',
        [SasPermission.READ, SasPermission.WRITE],
        10,
        '192.168.1.1',
      );

      expect(result).toMatchObject({
        sasToken: sasString,
        sasUrl: `https://exampleaccount.blob.core.windows.net/uploads/documents/file.pdf?${sasString}`,
        permissions: 'rw',
        containerName: 'uploads',
        blobName: 'documents/file.pdf',
        requestId: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.expiresOn).toBeInstanceOf(Date);
      expect(storageBlob.BlobSASPermissions.parse).toHaveBeenCalledWith('rw');
    });

    it('should generate a SAS token for a blob with default permissions', async () => {
      const mockCredential = {};
      const mockUserDelegationKey = {
        signedOid: 'oid',
        signedTid: 'tid',
        signedExpiry: new Date(Date.now() + 5 * 60 * 1000),
      };
      const mockBlobServiceClient = {
        getUserDelegationKey: jest
          .fn()
          .mockResolvedValue(mockUserDelegationKey),
      };

      const mockPermissions = {
        toString: jest.fn().mockReturnValue('r'),
      };

      (ClientSecretCredential as jest.Mock).mockReturnValue(mockCredential);
      (
        storageBlob.BlobServiceClient as unknown as jest.Mock
      ).mockImplementation(() => mockBlobServiceClient);
      (storageBlob.BlobSASPermissions.parse as jest.Mock).mockReturnValue(
        mockPermissions,
      );

      const sasString = 'sig=xyz789&se=2024-01-01T00:00:00Z&sp=r';
      (storageBlob.generateBlobSASQueryParameters as jest.Mock).mockReturnValue(
        {
          toString: () => sasString,
        },
      );

      const result = await sasService.generateSasTokenWithParams(
        'uploads',
        'file.pdf',
      );

      expect(result).toMatchObject({
        permissions: 'r',
        blobName: 'file.pdf',
      });
      expect(storageBlob.BlobSASPermissions.parse).toHaveBeenCalledWith('r');
    });
  });

  describe('Container SAS', () => {
    it('should generate a SAS token for a container', async () => {
      const mockCredential = {};
      const mockUserDelegationKey = {
        signedOid: 'oid',
        signedTid: 'tid',
        signedExpiry: new Date(Date.now() + 5 * 60 * 1000),
      };
      const mockBlobServiceClient = {
        getUserDelegationKey: jest
          .fn()
          .mockResolvedValue(mockUserDelegationKey),
      };

      const mockPermissions = {
        toString: jest.fn().mockReturnValue('rl'),
      };

      (ClientSecretCredential as jest.Mock).mockReturnValue(mockCredential);
      (
        storageBlob.BlobServiceClient as unknown as jest.Mock
      ).mockImplementation(() => mockBlobServiceClient);
      (storageBlob.ContainerSASPermissions.parse as jest.Mock).mockReturnValue(
        mockPermissions,
      );

      const sasString = 'sig=container123&se=2024-01-01T00:00:00Z&sp=rl';
      (storageBlob.generateBlobSASQueryParameters as jest.Mock).mockReturnValue(
        {
          toString: () => sasString,
        },
      );

      const result = await sasService.generateSasTokenWithParams(
        'uploads',
        undefined,
        [SasPermission.READ, SasPermission.LIST],
        15,
      );

      expect(result).toMatchObject({
        sasToken: sasString,
        sasUrl: `https://exampleaccount.blob.core.windows.net/uploads?${sasString}`,
        permissions: 'rl',
        containerName: 'uploads',
        requestId: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.blobName).toBeUndefined();
      expect(storageBlob.ContainerSASPermissions.parse).toHaveBeenCalledWith(
        'rl',
      );
    });
  });
});
