import { ClientSecretCredential } from '@azure/identity';
import {
  BlobSASPermissions,
  BlobSASSignatureValues,
  BlobServiceClient,
  ContainerSASPermissions,
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
import {
  SasGenerationParams,
  SasGenerationResult,
} from '@src/shared/interfaces/services/sas.interface';
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
    expiresOn: Date;
  } {
    const expiresOn = new Date(Date.now() + expirationMinutes * 60 * 1000);
    return { expiresOn };
  }

  /**
   * Para User Delegation Key necesitamos fechas de inicio y fin
   * pero para el SAS token solo usaremos la fecha de fin
   */
  private computeValidityForUserDelegation(expirationMinutes: number = 5): {
    startsOn: Date;
    expiresOn: Date;
  } {
    const startsOn = new Date(Date.now() - 2 * 60 * 1000);
    const expiresOn = new Date(Date.now() + expirationMinutes * 60 * 1000);
    return { startsOn, expiresOn };
  }

  /**
   * Extrae el nombre de la cuenta del connection string
   */
  private extractAccountNameFromConnectionString(
    connectionString: string,
  ): string {
    try {
      const accountNameMatch = connectionString.match(/AccountName=([^;]+)/i);
      if (!accountNameMatch?.[1]) {
        throw new Error(
          'No se pudo encontrar AccountName en el connection string',
        );
      }
      return accountNameMatch[1].trim();
    } catch (error) {
      console.error('Error extracting account name:', error);
      throw new BadRequestException(ErrorMessages.CONNECTION_STRING_INVALID);
    }
  }

  /**
   * Crea el cliente de BlobService basado en el connection string o credenciales
   */
  private createBlobServiceClient(connectionString?: string): {
    blobServiceClient: BlobServiceClient;
    useSharedKey: boolean;
    accountName: string;
  } {
    const configConnectionString = this.configService.get<string>(
      'azure.connectionString',
    );

    const accountName = this.configService.get<string>(
      'azure.storageAccountName',
    );

    // Priorizar el connectionString pasado como parámetro
    const effectiveConnectionString =
      connectionString || configConnectionString;

    if (effectiveConnectionString) {
      return {
        blobServiceClient: BlobServiceClient.fromConnectionString(
          effectiveConnectionString,
        ),
        useSharedKey: true,
        accountName: this.extractAccountNameFromConnectionString(
          effectiveConnectionString,
        ),
      };
    } else if (accountName) {
      const credential = this.getAzureCredential();
      return {
        blobServiceClient: new BlobServiceClient(
          `https://${accountName}.blob.core.windows.net/`,
          credential,
        ),
        useSharedKey: false,
        accountName,
      };
    } else {
      throw new BadRequestException(ErrorMessages.ENV_MISSING);
    }
  }

  /**
   * Construye las opciones SAS y la URL base
   */
  private buildSasOptionsAndUrl(
    params: SasGenerationParams,
    accountName: string,
    expiresOn: Date,
  ): {
    sasOptions: BlobSASSignatureValues;
    sasUrl: string;
    permissionsString: string;
  } {
    const { containerName, fileName, permissions, userIp } = params;

    // Construir permisos
    const permissionsString = permissions ? permissions.join('') : 'r';

    let sasOptions: BlobSASSignatureValues;
    let sasUrl: string;

    if (fileName) {
      // SAS para un blob específico
      const blobPermissions = BlobSASPermissions.parse(permissionsString);
      sasOptions = {
        containerName,
        blobName: fileName,
        permissions: blobPermissions,
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
        expiresOn,
        protocol: SASProtocol.Https,
        ipRange: userIp ? { start: userIp, end: userIp } : undefined,
      };
      sasUrl = `https://${accountName}.blob.core.windows.net/${containerName}`;
    }

    return { sasOptions, sasUrl, permissionsString };
  }

  /**
   * Construye el resultado final del SAS
   */
  private buildSasResult(
    params: SasGenerationParams,
    sasToken: string,
    sasUrl: string,
    permissionsString: string,
    expiresOn: Date,
  ): SasGenerationResult {
    const result: SasGenerationResult = {
      sasToken,
      sasUrl: `${sasUrl}?${sasToken}`,
      permissions: permissionsString,
      expiresOn,
      containerName: params.containerName,
      requestId: uuidv4(),
    };

    if (params.fileName) {
      result.blobName = params.fileName;
    }

    return result;
  }

  /**
   * Método principal para generar SAS tokens (refactorizado)
   */
  private async generateSasTokenCore(
    params: SasGenerationParams,
    customConnectionString?: string,
  ): Promise<SasGenerationResult> {
    // Validar connection string personalizado si se proporciona
    if (customConnectionString && !customConnectionString.trim()) {
      throw new BadRequestException(
        ErrorMessages.PUBLIC_CONNECTION_STRING_MISSING,
      );
    }

    // Crear cliente de BlobService
    const { blobServiceClient, useSharedKey, accountName } =
      this.createBlobServiceClient(customConnectionString);

    // Calcular fechas
    const expirationMins = params.expirationMinutes || 30;
    const { expiresOn } = this.computeValidity(expirationMins);

    // Construir opciones SAS y URL
    const { sasOptions, sasUrl, permissionsString } =
      this.buildSasOptionsAndUrl(params, accountName, expiresOn);

    // Generar el token SAS
    const sasToken = await this.generateSasToken(
      blobServiceClient,
      sasOptions,
      useSharedKey,
      expirationMins,
      accountName,
    );

    // Construir y retornar el resultado
    return this.buildSasResult(
      params,
      sasToken,
      sasUrl,
      permissionsString,
      expiresOn,
    );
  }

  private async generateSasToken(
    blobServiceClient: BlobServiceClient,
    sasOptions: BlobSASSignatureValues,
    useSharedKey: boolean,
    expirationMinutes: number,
    accountName: string,
  ): Promise<string> {
    if (useSharedKey) {
      // --- Ruta Shared Key ---
      const sharedCred =
        blobServiceClient.credential as StorageSharedKeyCredential;
      try {
        const sasOptionsFixed = {
          ...sasOptions,
          expiresOn: new Date(Date.now() + expirationMinutes * 60 * 1000),
          startsOn: undefined,
        };

        return generateBlobSASQueryParameters(
          sasOptionsFixed,
          sharedCred,
        ).toString();
      } catch (err) {
        console.error('Error generating SAS with SharedKey:', err);
        throw new InternalServerErrorException(ErrorMessages.SAS_PERMISSION);
      }
    } else {
      // --- Ruta User Delegation Key via AAD ---
      const { startsOn, expiresOn } =
        this.computeValidityForUserDelegation(expirationMinutes);

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
        const sasOptionsFixed = {
          ...sasOptions,
          expiresOn,
          startsOn: undefined,
        };

        return generateBlobSASQueryParameters(
          sasOptionsFixed,
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
    const { expiresOn } = this.computeValidity();

    const sasOptions: BlobSASSignatureValues = {
      containerName,
      blobName,
      permissions: BlobSASPermissions.parse('r'),
      expiresOn,
      protocol: SASProtocol.Https,
      ipRange: userIp ? { start: userIp, end: userIp } : undefined,
    };

    const permissions = sasOptions.permissions;

    const sasToken = await this.generateSasToken(
      blobServiceClient,
      sasOptions,
      useSharedKey,
      5,
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
  ): Promise<SasGenerationResult> {
    return this.generateSasTokenCore({
      containerName,
      fileName,
      permissions,
      expirationMinutes,
      userIp,
    });
  }

  /**
   * Genera un SAS Token con parámetros específicos usando un connection string personalizado
   */
  async generateSasTokenWithCustomConnection(
    connectionString: string,
    containerName: string,
    fileName?: string,
    permissions?: SasPermission[],
    expirationMinutes?: number,
    userIp?: string,
  ): Promise<SasGenerationResult> {
    return this.generateSasTokenCore(
      {
        containerName,
        fileName,
        permissions,
        expirationMinutes,
        userIp,
      },
      connectionString,
    );
  }
}
