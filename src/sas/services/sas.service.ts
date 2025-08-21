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

/**
 * @fileoverview
 * Servicio central para **generación de SAS tokens** de Azure Blob Storage.
 *
 * Características:
 * - Soporta **Shared Key** (connection string) y **User Delegation Key** (Azure AD).
 * - Genera SAS a **nivel blob** o **nivel contenedor**, con permisos e IP opcional.
 * - Permite **custom connection string** (multi-cuenta/tenant).
 * - Calcula expiración y construye resultado estándar (`SasGenerationResult`).
 *
 * Seguridad y configuración:
 * - Lee variables desde `ConfigService` (`azure.connectionString`, `azure.storageAccountName`, `azure.tenantId`, `azure.clientId`, `azure.clientSecret`).
 * - En entornos no `prod`, desactiva la validación TLS para desarrollo (solo local).
 *
 * @module sas/services/sas.service
 */
@Injectable()
export class SasService {
  /**
   * @param {ConfigService} configService - Servicio de configuración.
   */
  constructor(private readonly configService: ConfigService) {
    const isProduction =
      this.configService.get<string>('environment') === 'prod';

    if (!isProduction) {
      // ⚠️ Solo para entornos no productivos (evita errores de certificados en dev)
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    }
  }

  /**
   * Obtiene las **credenciales de Azure AD** desde variables de entorno.
   *
   * @returns {ClientSecretCredential} Credencial de cliente (tenantId, clientId, clientSecret).
   * @throws {BadRequestException} Si faltan variables requeridas.
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
   * Extrae `{ containerName, blobName }` desde una URL de blob.
   *
   * @param {string} blobUrl - URL absoluta del blob.
   * @returns {{containerName:string; blobName:string;}}
   * @throws {BadRequestException} Si la URL es inválida.
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
   * Calcula la **fecha de expiración** del SAS (solo `expiresOn`).
   *
   * @param {number} [expirationMinutes=5] - Minutos hasta expiración.
   * @returns {{expiresOn: Date}}
   */
  private computeValidity(expirationMinutes: number = 5): {
    expiresOn: Date;
  } {
    const expiresOn = new Date(Date.now() + expirationMinutes * 60 * 1000);
    return { expiresOn };
  }

  /**
   * Calcula `startsOn` y `expiresOn` para **User Delegation Key**.
   * (Azure requiere un rango de tiempo para obtener la llave)
   *
   * @param {number} [expirationMinutes=5] - Minutos hasta expiración.
   * @returns {{startsOn: Date; expiresOn: Date}}
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
   * Extrae **AccountName** desde un **connection string**.
   *
   * @param {string} connectionString
   * @returns {string} Nombre de cuenta de storage.
   * @throws {BadRequestException} Si el connection string es inválido.
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
   * Crea el **BlobServiceClient**:
   * - Si hay `connectionString` (parámetro o config): usa **SharedKey**.
   * - Si no, usa **Azure AD** (User Delegation Key) con `accountName`.
   *
   * @param {string} [connectionString] - Connection string opcional (prioritario).
   * @returns {{ blobServiceClient: BlobServiceClient; useSharedKey: boolean; accountName: string; }}
   * @throws {BadRequestException} Si faltan variables requeridas.
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
   * Construye **opciones SAS** (`BlobSASSignatureValues`) y la **URL base** (sin token).
   * Soporta SAS para **blob específico** o **contenedor**.
   *
   * @param {SasGenerationParams} params - Parámetros de generación.
   * @param {string} accountName     - Nombre de cuenta.
   * @param {Date} expiresOn         - Fecha de expiración del SAS.
   * @returns {{ sasOptions: BlobSASSignatureValues; sasUrl: string; permissionsString: string }}
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

    // Construir permisos como string (`r`, `rw`, etc.)
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
   * Construye el objeto **resultado** (`SasGenerationResult`) a partir del token.
   *
   * @param {SasGenerationParams} params
   * @param {string} sasToken
   * @param {string} sasUrl - URL base sin token.
   * @param {string} permissionsString
   * @param {Date} expiresOn
   * @returns {SasGenerationResult}
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
   * Núcleo de generación de **SAS token** (refactorizado).
   * Selecciona SharedKey vs UserDelegationKey, arma opciones, genera token y construye resultado.
   *
   * @param {SasGenerationParams} params - Parámetros de SAS (contenedor, blob opcional, permisos, expiración, IP).
   * @param {string} [customConnectionString] - Connection string alternativo (multi-cuenta).
   * @returns {Promise<SasGenerationResult>}
   * @throws {BadRequestException | InternalServerErrorException}
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

  /**
   * Genera el **token SAS** utilizando:
   * - **Shared Key** (si hay connection string) o
   * - **User Delegation Key** (Azure AD).
   *
   * @param {BlobServiceClient} blobServiceClient
   * @param {BlobSASSignatureValues} sasOptions
   * @param {boolean} useSharedKey
   * @param {number} expirationMinutes
   * @param {string} accountName
   * @returns {Promise<string>} Token SAS (querystring).
   * @throws {InternalServerErrorException} Si falla la obtención de claves o la firma.
   */
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
   * Genera un **SAS Token** para el blob indicado por **URL**, con permisos `r`
   * y **opcionalmente restringido por IP**.
   *
   * @param {string} blobUrl - URL absoluta del blob destino.
   * @param {string} [userIp] - IP para restringir el rango (`start=end=userIp`).
   * @returns {Promise<{ sasUrl: string; sasToken: string; permissions: string; expiresOn: Date; containerName: string; blobName: string; requestId: string; }>}
   * @throws {BadRequestException | InternalServerErrorException}
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
   * Genera un **SAS Token** con parámetros específicos.
   *
   * @param {string} containerName - Contenedor de destino.
   * @param {string} [fileName] - Blob específico (opcional).
   * @param {SasPermission[]} [permissions] - Permisos concatenables: `r`, `w`, `d`, `l`, `c`, `a`, etc.
   * @param {number} [expirationMinutes] - Minutos de validez (default 30).
   * @param {string} [userIp] - IP para restricción de acceso (opcional).
   * @returns {Promise<SasGenerationResult>}
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
   * Genera un **SAS Token** usando un **connection string personalizado**.
   *
   * Útil para operar sobre **otra cuenta** o **otra suscripción** distinta a la configurada por defecto.
   *
   * @param {string} connectionString - Connection string alternativo.
   * @param {string} containerName    - Contenedor de destino.
   * @param {string} [fileName]       - Blob específico (opcional).
   * @param {SasPermission[]} [permissions]      - Permisos solicitados.
   * @param {number} [expirationMinutes]         - Minutos de validez.
   * @param {string} [userIp]                    - Restricción por IP.
   * @returns {Promise<SasGenerationResult>}
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
