import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * @fileoverview
 * Servicio de configuración centralizada para la aplicación.
 *
 * Este servicio actúa como un wrapper de {@link ConfigService} de NestJS,
 * exponiendo getters tipados para acceder a variables de entorno críticas
 * (puerto, ambiente, credenciales de Azure, etc.).
 *
 * Al usar este servicio en lugar de `ConfigService` directamente:
 * - Se evitan errores de typo en los nombres de las variables.
 * - Se asegura un tipado fuerte (`string` | `number`).
 * - Se concentra en un único punto el manejo de configuración.
 *
 * @module config/config.service.ts
 */
@Injectable()
export class AppConfigService {
  constructor(private readonly configService: ConfigService) {}

  /**
   * Entorno actual de la aplicación (`development`, `production`, `test`).
   *
   * @type {string}
   * @example
   * if (appConfig.environment === 'production') {
   *   enableSecurityMiddlewares();
   * }
   */
  get environment(): string {
    return this.configService.get<string>('environment');
  }

  /**
   * Puerto en el que se levanta la aplicación.
   *
   * @type {number}
   * @example
   * await app.listen(appConfig.port || 3000);
   */
  get port(): number {
    return this.configService.get<number>('port');
  }

  /**
   * Nombre de la cuenta de Azure Storage.
   *
   * @type {string}
   * @see https://learn.microsoft.com/en-us/azure/storage/common/storage-account-overview
   */
  get azureStorageAccountName(): string {
    return this.configService.get<string>('azure.storageAccountName');
  }

  /**
   * ID de inquilino de Azure AD (Tenant ID).
   *
   * @type {string}
   * @see https://learn.microsoft.com/en-us/azure/active-directory/fundamentals/active-directory-whatis
   */
  get azureTenantId(): string {
    return this.configService.get<string>('azure.tenantId');
  }

  /**
   * ID de cliente de la aplicación registrada en Azure AD.
   *
   * @type {string}
   * @see https://learn.microsoft.com/en-us/azure/active-directory/develop/app-objects-and-service-principals
   */
  get azureClientId(): string {
    return this.configService.get<string>('azure.clientId');
  }

  /**
   * Secreto del cliente registrado en Azure AD.
   *
   * ⚠️ Debe manejarse con cuidado y nunca exponerse en el frontend.
   *
   * @type {string}
   */
  get azureClientSecret(): string {
    return this.configService.get<string>('azure.clientSecret');
  }

  /**
   * Cadena de conexión pública de Azure Storage (solo lectura/uso público).
   *
   * @type {string}
   * @example
   * BlobServiceClient.fromConnectionString(appConfig.azurePublicConnectionString);
   */
  get azurePublicConnectionString(): string {
    return this.configService.get<string>('azure.publicConnectionString');
  }

  /**
   * Nombre del contenedor público en Azure Storage.
   *
   * @type {string}
   */
  get azurePublicContainer(): string {
    return this.configService.get<string>('azure.publicContainerName');
  }

  /**
   * Dominio personalizado configurado para acceso público a blobs.
   *
   * @type {string}
   * @example
   * // Devuelve: https://cdn.miempresa.com
   * console.log(appConfig.azurePublicCustomDomain);
   */
  get azurePublicCustomDomain(): string {
    return this.configService.get<string>('azure.publicCustomDomain');
  }
}
