import { Module } from '@nestjs/common';
import { RouterModule } from '@nestjs/core';
import { AppConfigModule } from './config/config.module';
import { EventHubInterceptor } from './interceptors/event-hub.interceptor';
import { SasModule } from './sas/sas.module';

export function createAppModule() {
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
    providers: [
      // {
      //   provide: 'APP_INTERCEPTOR',
      //   useFactory: () => {
      //     const connectionString = process.env.EVENT_HUB_CONNECTION_S!;
      //     const eventHubName = process.env.EVENT_HUB_QUEUE!;
      //     return new EventHubInterceptor(connectionString, eventHubName);
      //   },
      // },
    ],
  })
  class AppModule {}
  return AppModule;
}
