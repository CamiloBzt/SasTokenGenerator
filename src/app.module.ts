import { Module } from '@nestjs/common';
import { RouterModule } from '@nestjs/core';
import { AppConfigModule } from './config/config.module';
import { EventHubInterceptor } from './interceptors/event-hub.interceptor';
import { SasModule } from './sas/sas.module';

/**
 * Módulo raíz de la aplicación.
 * - Importa los módulos de configuración y SAS.
 * - Registra las rutas base de la API.
 * - Configura condicionalmente el interceptor para enviar eventos a Event Hub,
 *   solo si las variables de entorno necesarias están definidas.
 */

export function createAppModule() {
  const createProviders = () => {
    const providers = [];
    const connectionString = process.env.EVENT_HUB_CONNECTION_S;
    const eventHubName = process.env.EVENT_HUB_QUEUE;

    if (
      connectionString &&
      eventHubName &&
      connectionString.trim() !== '' &&
      eventHubName.trim() !== ''
    ) {
      providers.push({
        provide: 'APP_INTERCEPTOR',
        useFactory: () => {
          return new EventHubInterceptor(connectionString, eventHubName);
        },
      });
    }

    return providers;
  };
  @Module({
    imports: [
      AppConfigModule,
      SasModule,
      RouterModule.register([
        {
          path: '/service/pendig/transversales/sas/v1/',
          children: [SasModule],
        },
      ]),
    ],
    controllers: [],
    providers: createProviders(),
  })
  class AppModule {}
  return AppModule;
}
