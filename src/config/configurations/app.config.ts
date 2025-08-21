import { Enviroment } from '@src/shared/enums/enviroment.enum';

/**
 * @fileoverview
 * Archivo de configuración base de la aplicación.
 *
 * Expone un objeto con todas las variables críticas de configuración,
 * proveniente de `process.env`. Se utiliza en conjunto con
 * `@nestjs/config` para registrar el módulo de configuración en NestJS.
 *
 * Este patrón asegura:
 * - Centralización de todas las variables de entorno.
 * - Defaults definidos cuando no existen variables.
 * - Tipado fuerte para el `environment` usando el enum {@link Enviroment}.
 *
 * @module config/configurations/app.config
 */

/**
 * Función de configuración que retorna las variables de entorno estructuradas
 * para ser consumidas por el `ConfigModule` de NestJS.
 *
 * @returns {{
 *   environment: Enviroment,
 *   port: number,
 *   azure: {
 *     storageAccountName: string,
 *     tenantId: string,
 *     clientId: string,
 *     clientSecret: string,
 *     connectionString: string,
 *     publicContainerName: string,
 *     publicConnectionString: string,
 *     publicCustomDomain: string
 *   }
 * }}
 *
 * @example
 * // En el módulo raíz (AppModule):
 * ConfigModule.forRoot({
 *   isGlobal: true,
 *   load: [appConfig],
 * });
 *
 * // Uso posterior vía AppConfigService:
 * console.log(appConfigService.azureStorageAccountName);
 */
export default () => ({
  /**
   * Entorno actual de la aplicación.
   * Valor por defecto: {@link Enviroment.Local}
   *
   * @env ENV
   * @example 'development' | 'production' | 'test'
   */
  environment: (process.env.ENV as Enviroment) || Enviroment.Local,

  /**
   * Puerto en el que se levanta la aplicación.
   * Valor por defecto: 3000
   *
   * @env PORT
   * @example 3000
   */
  port: parseInt(process.env.PORT, 10) || 3000,

  /**
   * Configuración específica de Azure Storage y Azure AD.
   */
  azure: {
    /**
     * Nombre de la cuenta de Azure Storage.
     * @env PENDIG-NAME-STORAGE-ACCOUNT
     */
    storageAccountName: process.env['PENDIG-NAME-STORAGE-ACCOUNT'] || '',

    /**
     * ID del inquilino de Azure AD.
     * @env PENDIG-ID-TENANT
     */
    tenantId: process.env['PENDIG-ID-TENANT'] || '',

    /**
     * ID del cliente (app registrada en Azure AD).
     * @env PENDIG-CLIENT-ID-TOKEN
     */
    clientId: process.env['PENDIG-CLIENT-ID-TOKEN'] || '',

    /**
     * Secreto del cliente registrado en Azure AD.
     * @env PENDIG-CLIENT-SECRET-TOKEN
     */
    clientSecret: process.env['PENDIG-CLIENT-SECRET-TOKEN'] || '',

    /**
     * Cadena de conexión completa a la cuenta principal de Azure Storage.
     * @env PENDIG-CLAVE-STORAGE-ACCOUNT
     */
    connectionString: process.env['PENDIG-CLAVE-STORAGE-ACCOUNT'] || '',

    /**
     * Nombre del contenedor público en Azure Storage.
     * @env PENDIG-CONTAINER-STORAGE-ACCOUNT-PUBLICO
     */
    publicContainerName:
      process.env['PENDIG-CONTAINER-STORAGE-ACCOUNT-PUBLICO'] || '',

    /**
     * Cadena de conexión pública para operaciones sobre el contenedor público.
     * @env PENDIG-CLAVE-STORAGE-ACCOUNT-PUBLICO
     */
    publicConnectionString:
      process.env['PENDIG-CLAVE-STORAGE-ACCOUNT-PUBLICO'] || '',

    /**
     * Dominio personalizado configurado para servir blobs públicos.
     * @env PENDIG-PUBLIC-CUSTOM-DOMAIN
     * @example 'https://cdn.miempresa.com'
     */
    publicCustomDomain: process.env['PENDIG-PUBLIC-CUSTOM-DOMAIN'] || '',
  },
});
