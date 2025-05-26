import { ClientSecretCredential } from '@azure/identity';
import {
  BlobSASPermissions,
  ContainerSASPermissions,
  BlobSASSignatureValues,
  BlobServiceClient,
  RestError,
  SASProtocol,
  StorageSharedKeyCredential,
  UserDelegationKey,
  generateBlobSASQueryParameters,
} from '@azure/storage-blob';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getBlobInfoFromUrl } from '@src/common/utils';
import { ErrorMessages } from '@src/shared/enums/error-messages.enum';
import { SasPermission } from '@src/shared/enums/sas-permission.enum';
import { BadRequestException } from '@src/shared/exceptions/bad-request.exception';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class SasService {
  constructor(private readonly configService: ConfigService) {}

  /**
   * Obtiene las credenciales de Azure AD usando las variables de entorno.
   */
  private getAzureCredential(): ClientSecretCredential {
    const tenantId = this.configService.get<string>('azure.tenantId');
    const clientId = this.configService.get<string>('azure.clientId');
    const clientSecret = this.configService.get<string>('azure.clientSecret');

    if (!tenantId || !clientId || !clientSecret) {
      throw new BadRequestException(ErrorMessages.ENV_MISSING);
    }
    return new ClientSecretCredential(tenantId, clientId, clientSecret);
  }

  /**
   * Extrae el nombre del contenedor y del blob a partir de la URL.
   * La función getBlobInfoFromUrl se encuentra en src/sas/utils.ts.
   */
  private getBlobInfo(blobUrl: string): {
    containerName: string;
    blobName: string;
  } {
    try {
      return getBlobInfoFromUrl(blobUrl);
    } catch (error) {
      console.error('Error parsing blob URL:', error);
      throw new BadRequestException(ErrorMessages.URL_INVALID);
    }
  }

  /**
   * Calcula el intervalo de validez del SAS
   * @param expirationMinutes - Minutos hasta la expiración (por defecto 5)
   */
  private computeValidity(expirationMinutes: number = 5): {
    startsOn: Date;
    expiresOn: Date;
  } {
    const startsOn = new Date();
    const expiresOn = new Date(
      startsOn.getTime() + expirationMinutes * 60 * 1000,
    );
    return { startsOn, expiresOn };
  }

  private async generateSasToken(
    blobServiceClient: BlobServiceClient,
    sasOptions: BlobSASSignatureValues,
    useSharedKey: boolean,
    startsOn: Date,
    expiresOn: Date,
    accountName: string,
  ): Promise<string> {
    if (useSharedKey) {
      // --- Ruta Shared Key ---
      const sharedCred =
        blobServiceClient.credential as StorageSharedKeyCredential;
      try {
        return generateBlobSASQueryParameters(
          sasOptions,
          sharedCred,
        ).toString();
      } catch (err) {
        console.error('Error generating SAS with SharedKey:', err);
        throw new InternalServerErrorException(ErrorMessages.SAS_PERMISSION);
      }
    } else {
      // --- Ruta User Delegation Key via AAD ---
      let userDelegationKey: UserDelegationKey;
      try {
        userDelegationKey = await blobServiceClient.getUserDelegationKey(
          startsOn,
          expiresOn,
        );
      } catch (err) {
        console.error('Error fetching User Delegation Key:', err);
        if (
          err instanceof RestError &&
          err.statusCode === 403 &&
          err.code === 'AuthorizationPermissionMismatch'
        ) {
          throw new InternalServerErrorException(ErrorMessages.SAS_PERMISSION);
        }
        throw new InternalServerErrorException(ErrorMessages.SAS_GENERATION);
      }

      try {
        return generateBlobSASQueryParameters(
          sasOptions,
          userDelegationKey,
          accountName,
        ).toString();
      } catch (err) {
        console.error('Error generating SAS with UserDelegationKey:', err);
        throw new InternalServerErrorException(ErrorMessages.SAS_PERMISSION);
      }
    }
  }

  /**
   * Genera un SAS Token para el blob indicado en la URL, opcionalmente restringido por IP.
   */
  async generateSasUrl(
    blobUrl: string,
    userIp?: string,
  ): Promise<{
    sasUrl: string;
    sasToken: string;
    permissions: string;
    expiresOn: Date;
    containerName: string;
    blobName: string;
    requestId: string;
  }> {
    const connString = this.configService.get<string>('azure.connectionString');
    const accountName = this.configService.get<string>(
      'azure.storageAccountName',
    );
    if (!accountName) {
      throw new BadRequestException(ErrorMessages.ENV_MISSING);
    }

    // Inicializar cliente
    let blobServiceClient: BlobServiceClient;
    let useSharedKey = false;
    if (connString) {
      blobServiceClient = BlobServiceClient.fromConnectionString(connString);
      useSharedKey = true;
    } else {
      const credential = this.getAzureCredential();
      blobServiceClient = new BlobServiceClient(
        `https://${accountName}.blob.core.windows.net/`,
        credential,
      );
    }

    // Obtener container/blob y fechas
    const { containerName, blobName } = this.getBlobInfo(blobUrl);
    const { startsOn, expiresOn } = this.computeValidity();

    // Construir la configuración común
    const sasOptions: BlobSASSignatureValues = {
      containerName,
      blobName,
      permissions: BlobSASPermissions.parse('r'),
      startsOn,
      expiresOn,
      protocol: SASProtocol.Https,
      ipRange: userIp ? { start: userIp, end: userIp } : undefined,
    };

    const permissions = sasOptions.permissions;

    const sasToken = await this.generateSasToken(
      blobServiceClient,
      sasOptions,
      useSharedKey,
      startsOn,
      expiresOn,
      accountName,
    );

    return {
      sasUrl: `${blobUrl}?${sasToken}`,
      sasToken,
      permissions: permissions.toString(),
      expiresOn,
      containerName,
      blobName,
      requestId: uuidv4(),
    };
  }

  /**
   * Genera un SAS Token con parámetros específicos
   */
  async generateSasTokenWithParams(
    containerName: string,
    fileName?: string,
    permissions?: SasPermission[],
    expirationMinutes?: number,
    userIp?: string,
  ): Promise<{
    sasToken: string;
    sasUrl: string;
    permissions: string;
    expiresOn: Date;
    containerName: string;
    blobName?: string;
    requestId: string;
  }> {
    const accountName = this.configService.get<string>(
      'azure.storageAccountName',
    );
    const connString = this.configService.get<string>('azure.connectionString');

    if (!accountName) {
      throw new BadRequestException(ErrorMessages.ENV_MISSING);
    }

    // Inicializar cliente
    let blobServiceClient: BlobServiceClient;
    let useSharedKey = false;

    if (connString) {
      blobServiceClient = BlobServiceClient.fromConnectionString(connString);
      useSharedKey = true;
    } else {
      const credential = this.getAzureCredential();
      blobServiceClient = new BlobServiceClient(
        `https://${accountName}.blob.core.windows.net/`,
        credential,
      );
    }

    // Calcular fechas
    const { startsOn, expiresOn } = this.computeValidity(
      expirationMinutes || 5,
    );

    // Construir permisos
    const permissionsString = permissions ? permissions.join('') : 'r';

    // Construir la configuración y URL dependiendo del tipo
    let sasOptions: BlobSASSignatureValues;
    let sasUrl: string;

    if (fileName) {
      // SAS para un blob específico
      const blobPermissions = BlobSASPermissions.parse(permissionsString);
      sasOptions = {
        containerName,
        blobName: fileName,
        permissions: blobPermissions,
        startsOn,
        expiresOn,
        protocol: SASProtocol.Https,
        ipRange: userIp ? { start: userIp, end: userIp } : undefined,
      };
      sasUrl = `https://${accountName}.blob.core.windows.net/${containerName}/${fileName}`;
    } else {
      // SAS para el contenedor
      const containerPermissions =
        ContainerSASPermissions.parse(permissionsString);
      sasOptions = {
        containerName,
        permissions: containerPermissions,
        startsOn,
        expiresOn,
        protocol: SASProtocol.Https,
        ipRange: userIp ? { start: userIp, end: userIp } : undefined,
      };
      sasUrl = `https://${accountName}.blob.core.windows.net/${containerName}`;
    }

    const sasToken = await this.generateSasToken(
      blobServiceClient,
      sasOptions,
      useSharedKey,
      startsOn,
      expiresOn,
      accountName,
    );

    const result: {
      sasToken: string;
      sasUrl: string;
      permissions: string;
      expiresOn: Date;
      containerName: string;
      blobName?: string;
      requestId: string;
    } = {
      sasToken,
      sasUrl: `${sasUrl}?${sasToken}`,
      permissions: permissionsString,
      expiresOn,
      containerName,
      requestId: uuidv4(),
    };

    if (fileName) {
      result.blobName = fileName;
    }

    return result;
  }
}
