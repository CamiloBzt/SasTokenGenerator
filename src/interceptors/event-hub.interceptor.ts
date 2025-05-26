import { EventHubProducerClient } from '@azure/event-hubs';
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { IncomingHttpHeaders } from 'http';
import { Observable, tap } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class EventHubInterceptor implements NestInterceptor {
  private producerClient: EventHubProducerClient;

  constructor(
    private readonly connectionString: string,
    private readonly eventHubName: string,
  ) {
    this.producerClient = new EventHubProducerClient(
      this.connectionString,
      this.eventHubName,
    );
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const startTime = Date.now();
    const httpCtx = context.switchToHttp();
    const request = httpCtx.getRequest();
    const response = httpCtx.getResponse();

    const {
      method,
      url,
      headers,
      query,
      body,
    }: {
      method: string;
      url: string;
      headers: IncomingHttpHeaders;
      query: any;
      body: any;
    } = request;
    const uuid = uuidv4();

    // Guardamos el método json original de Express
    const originalJson = response.json;

    // Sobrescribimos el método json para capturar el objeto que se envía
    response.json = function (payload: any) {
      response.locals.__bodyToLog = payload; // Guardamos el body
      return originalJson.call(this, payload);
    };

    return next.handle().pipe(
      tap(async (responseData) => {
        // Recogemos el objeto que mandó el controlador
        const finalResponse = response.locals.__bodyToLog;
        const endTime = Date.now();

        try {
          await this.producerClient.sendBatch([
            {
              body: {
                idlog: uuid,
                serviceName: 'pendig-seguridad-ms-gestion-autorizacion',
                tipoMetodo: method,
                headers: headers,
                parameters: query,
                uri: url,
                timeInput: new Date(startTime).toISOString(),
                timeOutput: new Date(endTime).toISOString(),
                timeExecution: endTime - startTime,
                requestBody: body,
                responseBody: finalResponse,
                codeError: String(response.statusCode),
                tracerError: '',
                componentName: 'pendig-seguridad-ms-gestion-autorizacion',
                iVEncript: '',
              },
            },
          ]);
        } catch (error) {
          console.error('Error sending event to event hub:', error);
        }
      }),
    );
  }
}
