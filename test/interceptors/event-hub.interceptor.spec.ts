import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { EventHubInterceptor } from '../../src/interceptors/event-hub.interceptor';

jest.mock('@azure/event-hubs', () => {
  return {
    EventHubProducerClient: jest.fn().mockImplementation(() => {
      return {
        sendBatch: jest.fn().mockResolvedValue(undefined),
      };
    }),
  };
});

const createMockExecutionContext = (reqOverrides = {}, resOverrides = {}) => {
  const req: any = {
    method: 'POST',
    url: '/test/url',
    headers: { 'x-forwarded-for': '192.168.1.100' },
    query: { q: 'test' },
    body: { data: 'test body' },
    ...reqOverrides,
  };

  const res: any = {
    statusCode: 200,
    locals: {},
    ...resOverrides,
  };

  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  } as unknown as ExecutionContext;
};

const createMockCallHandler = (responseValue: any) => {
  return {
    handle: () => of(responseValue),
  } as CallHandler;
};

describe('EventHubInterceptor', () => {
  let interceptor: EventHubInterceptor;

  const validConnectionString =
    'Endpoint=sb://some.namespace.servicebus.windows.net/;SharedAccessKeyName=keyName;SharedAccessKey=key;EntityPath=eventHub';
  const eventHubName = 'eventHub';

  describe('Constructor', () => {
    it('should set producerClient when connectionString is valid', () => {
      interceptor = new EventHubInterceptor(
        validConnectionString,
        eventHubName,
      );
      expect(interceptor['producerClient']).toBeDefined();
    });

    it('should set producerClient to null when connectionString is invalid', () => {
      interceptor = new EventHubInterceptor('invalid-connection', eventHubName);
      expect(interceptor['producerClient']).toBeNull();
    });
  });

  describe('intercept', () => {
    it('should not send event if producerClient is null', (done) => {
      interceptor = new EventHubInterceptor('invalid-connection', eventHubName);
      const context = createMockExecutionContext();
      const next: CallHandler = createMockCallHandler({ result: 'ok' });

      interceptor.intercept(context, next).subscribe({
        next: () => {
          done();
        },
        error: done,
      });
    });
  });
});
