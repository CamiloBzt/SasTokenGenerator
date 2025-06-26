import { EventHubProducerClient } from '@azure/event-hubs';
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { EventHubInterceptor } from '@src/interceptors/event-hub.interceptor';
import { of, throwError } from 'rxjs';

jest.mock('@azure/event-hubs');
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-12345'),
}));

describe('EventHubInterceptor', () => {
  const GET = 'GET';
  const POST = 'POST';

  let interceptor: EventHubInterceptor;
  let mockProducerClient: jest.Mocked<EventHubProducerClient>;
  let mockExecutionContext: jest.Mocked<ExecutionContext>;
  let mockCallHandler: jest.Mocked<CallHandler>;
  let mockRequest: any;
  let mockResponse: any;
  let originalDateNow: typeof Date.now;

  beforeEach(() => {
    originalDateNow = Date.now;
    Date.now = jest
      .fn()
      .mockReturnValueOnce(1000000)
      .mockReturnValueOnce(1001500);

    mockProducerClient = {
      sendBatch: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
    } as any;

    (EventHubProducerClient as jest.Mock).mockImplementation(
      () => mockProducerClient,
    );

    interceptor = new EventHubInterceptor(
      'Endpoint=sb://test.servicebus.windows.net/;SharedAccessKeyName=test;SharedAccessKey=test',
      'test-event-hub',
    );

    mockRequest = {
      method: POST,
      url: '/api/test',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'test-agent',
        authorization: 'test',
      },
      query: {
        param1: 'value1',
        param2: 'value2',
      },
      body: {
        name: 'Test User',
        email: 'test@example.com',
      },
    };

    mockResponse = {
      statusCode: 200,
      locals: {},
      json: jest.fn(),
    };

    mockExecutionContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue(mockRequest),
        getResponse: jest.fn().mockReturnValue(mockResponse),
      }),
    } as any;

    mockCallHandler = {
      handle: jest.fn(),
    } as any;
  });

  afterEach(() => {
    Date.now = originalDateNow;
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create EventHubProducerClient with correct parameters', () => {
      const connectionString = 'test-connection-string';
      const eventHubName = 'test-hub';

      new EventHubInterceptor(connectionString, eventHubName);

      expect(EventHubProducerClient).toHaveBeenCalledWith(
        connectionString,
        eventHubName,
      );
    });
  });

  describe('intercept', () => {
    it('should intercept request and send event to Event Hub successfully', async () => {
      const responseData = {
        status: { statusCode: 200, statusDescription: 'Success' },
        data: { id: 1, name: 'Test Result' },
      };

      mockCallHandler.handle.mockReturnValue(of(responseData));

      const originalJsonMock = jest.fn((payload) => {
        mockResponse.locals.__bodyToLog = payload;
        return mockResponse;
      });
      mockResponse.json = originalJsonMock;

      const result$ = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      mockResponse.json(responseData);

      await new Promise<void>((resolve) => {
        result$.subscribe({
          next: (data) => {
            expect(data).toEqual(responseData);
            resolve();
          },
        });
      });

      expect(mockCallHandler.handle).toHaveBeenCalled();
      expect(mockProducerClient.sendBatch).toHaveBeenCalledWith([
        {
          body: {
            idlog: 'test-uuid-12345',
            serviceName: 'pendig-seguridad-ms-gestion-autorizacion',
            tipoMetodo: POST,
            headers: mockRequest.headers,
            parameters: mockRequest.query,
            uri: '/api/test',
            timeInput: new Date(1000000).toISOString(),
            timeOutput: new Date(1001500).toISOString(),
            timeExecution: 1500,
            requestBody: mockRequest.body,
            responseBody: responseData,
            codeError: '200',
            tracerError: '',
            componentName: 'pendig-seguridad-ms-gestion-autorizacion',
            iVEncript: '',
          },
        },
      ]);
    });

    it('should handle GET request with no body', async () => {
      mockRequest.method = GET;
      mockRequest.body = undefined;
      const responseData = { message: 'Success' };

      mockCallHandler.handle.mockReturnValue(of(responseData));
      mockResponse.json = jest.fn((payload) => {
        mockResponse.locals.__bodyToLog = payload;
        return mockResponse;
      });

      const result$ = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );
      mockResponse.json(responseData);

      await new Promise<void>((resolve) => {
        result$.subscribe({
          next: () => resolve(),
        });
      });

      expect(mockProducerClient.sendBatch).toHaveBeenCalledWith([
        {
          body: expect.objectContaining({
            tipoMetodo: GET,
            requestBody: undefined,
            responseBody: responseData,
          }),
        },
      ]);
    });

    it('should handle empty query parameters', async () => {
      mockRequest.query = {};
      const responseData = { status: 'ok' };

      mockCallHandler.handle.mockReturnValue(of(responseData));
      mockResponse.json = jest.fn((payload) => {
        mockResponse.locals.__bodyToLog = payload;
        return mockResponse;
      });

      const result$ = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );
      mockResponse.json(responseData);

      await new Promise<void>((resolve) => {
        result$.subscribe({
          next: () => resolve(),
        });
      });

      expect(mockProducerClient.sendBatch).toHaveBeenCalledWith([
        {
          body: expect.objectContaining({
            parameters: {},
          }),
        },
      ]);
    });

    it('should handle different HTTP status codes', async () => {
      mockResponse.statusCode = 404;
      const responseData = { error: 'Not Found' };

      mockCallHandler.handle.mockReturnValue(of(responseData));
      mockResponse.json = jest.fn((payload) => {
        mockResponse.locals.__bodyToLog = payload;
        return mockResponse;
      });

      const result$ = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );
      mockResponse.json(responseData);

      await new Promise<void>((resolve) => {
        result$.subscribe({
          next: () => resolve(),
        });
      });

      expect(mockProducerClient.sendBatch).toHaveBeenCalledWith([
        {
          body: expect.objectContaining({
            codeError: '404',
            responseBody: responseData,
          }),
        },
      ]);
    });

    it('should handle complex nested request and response bodies', async () => {
      const complexRequestBody = {
        user: {
          id: 123,
          profile: {
            name: 'John Doe',
            preferences: {
              theme: 'dark',
              notifications: true,
            },
          },
        },
        metadata: ['tag1', 'tag2', 'tag3'],
      };

      const complexResponseBody = {
        status: { code: 200, message: 'Created' },
        data: {
          id: 456,
          relationships: {
            parent: { id: 123, type: 'user' },
            children: [
              { id: 789, type: 'task' },
              { id: 790, type: 'task' },
            ],
          },
        },
      };

      mockRequest.body = complexRequestBody;
      mockCallHandler.handle.mockReturnValue(of(complexResponseBody));
      mockResponse.json = jest.fn((payload) => {
        mockResponse.locals.__bodyToLog = payload;
        return mockResponse;
      });

      const result$ = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );
      mockResponse.json(complexResponseBody);

      await new Promise<void>((resolve) => {
        result$.subscribe({
          next: () => resolve(),
        });
      });

      expect(mockProducerClient.sendBatch).toHaveBeenCalledWith([
        {
          body: expect.objectContaining({
            requestBody: complexRequestBody,
            responseBody: complexResponseBody,
          }),
        },
      ]);
    });

    it('should handle errors when sending to Event Hub', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const eventHubError = new Error('Event Hub connection failed');
      mockProducerClient.sendBatch.mockRejectedValue(eventHubError);

      const responseData = { message: 'Success' };
      mockCallHandler.handle.mockReturnValue(of(responseData));
      mockResponse.json = jest.fn((payload) => {
        mockResponse.locals.__bodyToLog = payload;
        return mockResponse;
      });

      const result$ = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );
      mockResponse.json(responseData);

      await new Promise<void>((resolve) => {
        result$.subscribe({
          next: (data) => {
            expect(data).toEqual(responseData);
            resolve();
          },
        });
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error sending event to event hub:',
        eventHubError,
      );
      consoleErrorSpy.mockRestore();
    });

    it('should not affect the original response when Event Hub fails', async () => {
      jest.spyOn(console, 'error').mockImplementation();
      mockProducerClient.sendBatch.mockRejectedValue(
        new Error('Connection failed'),
      );

      const responseData = { message: 'Original response' };
      mockCallHandler.handle.mockReturnValue(of(responseData));
      mockResponse.json = jest.fn((payload) => {
        mockResponse.locals.__bodyToLog = payload;
        return mockResponse;
      });

      const result$ = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );
      mockResponse.json(responseData);

      const receivedData = await new Promise<any>((resolve) => {
        result$.subscribe({
          next: (data) => resolve(data),
        });
      });

      expect(receivedData).toEqual(responseData);
    });

    it('should preserve original response.json functionality', async () => {
      const responseData = { test: 'data' };
      mockCallHandler.handle.mockReturnValue(of(responseData));

      const originalJsonSpy = jest.fn().mockReturnValue(mockResponse);
      mockResponse.json = originalJsonSpy;

      const result$ = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      mockResponse.json(responseData);

      await new Promise<void>((resolve) => {
        result$.subscribe({
          next: () => resolve(),
        });
      });

      expect(originalJsonSpy).toHaveBeenCalledWith(responseData);
      expect(mockResponse.locals.__bodyToLog).toEqual(responseData);
    });

    it('should handle requests with special characters in URL and parameters', async () => {
      mockRequest.url = '/api/test?param=value%20with%20spaces&special=café';
      mockRequest.query = {
        param: 'value with spaces',
        special: 'café',
        unicode: '测试',
      };

      const responseData = { message: 'Success with special chars: café 测试' };
      mockCallHandler.handle.mockReturnValue(of(responseData));
      mockResponse.json = jest.fn((payload) => {
        mockResponse.locals.__bodyToLog = payload;
        return mockResponse;
      });

      const result$ = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );
      mockResponse.json(responseData);

      await new Promise<void>((resolve) => {
        result$.subscribe({
          next: () => resolve(),
        });
      });

      expect(mockProducerClient.sendBatch).toHaveBeenCalledWith([
        {
          body: expect.objectContaining({
            uri: '/api/test?param=value%20with%20spaces&special=café',
            parameters: {
              param: 'value with spaces',
              special: 'café',
              unicode: '测试',
            },
          }),
        },
      ]);
    });

    it('should handle null and undefined values in request', async () => {
      mockRequest.body = null;
      mockRequest.query = undefined;
      const responseData = { result: 'ok' };

      mockCallHandler.handle.mockReturnValue(of(responseData));
      mockResponse.json = jest.fn((payload) => {
        mockResponse.locals.__bodyToLog = payload;
        return mockResponse;
      });

      const result$ = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );
      mockResponse.json(responseData);

      await new Promise<void>((resolve) => {
        result$.subscribe({
          next: () => resolve(),
        });
      });

      expect(mockProducerClient.sendBatch).toHaveBeenCalledWith([
        {
          body: expect.objectContaining({
            requestBody: null,
            parameters: undefined,
            responseBody: responseData,
          }),
        },
      ]);
    });

    it('should measure execution time correctly', async () => {
      Date.now = jest
        .fn()
        .mockReturnValueOnce(1000000)
        .mockReturnValueOnce(1002750);

      const responseData = { message: 'Slow response' };
      mockCallHandler.handle.mockReturnValue(of(responseData));
      mockResponse.json = jest.fn((payload) => {
        mockResponse.locals.__bodyToLog = payload;
        return mockResponse;
      });

      const result$ = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );
      mockResponse.json(responseData);

      await new Promise<void>((resolve) => {
        result$.subscribe({
          next: () => resolve(),
        });
      });

      expect(mockProducerClient.sendBatch).toHaveBeenCalledWith([
        {
          body: expect.objectContaining({
            timeInput: new Date(1000000).toISOString(),
            timeOutput: new Date(1002750).toISOString(),
            timeExecution: 2750,
          }),
        },
      ]);
    });

    it('should propagate controller errors correctly', async () => {
      const controllerError = new Error('Controller error');
      mockCallHandler.handle.mockReturnValue(throwError(() => controllerError));

      const result$ = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      await expect(
        new Promise((resolve, reject) => {
          result$.subscribe({
            next: resolve,
            error: reject,
          });
        }),
      ).rejects.toThrow('Controller error');

      expect(mockProducerClient.sendBatch).not.toHaveBeenCalled();
    });

    it('should generate unique UUID for each request', async () => {
      const { v4: uuidv4 } = require('uuid');
      (uuidv4 as jest.Mock)
        .mockReturnValueOnce('uuid-1')
        .mockReturnValueOnce('uuid-2');

      const responseData = { message: 'Test' };
      mockCallHandler.handle.mockReturnValue(of(responseData));
      mockResponse.json = jest.fn((payload) => {
        mockResponse.locals.__bodyToLog = payload;
        return mockResponse;
      });

      // First call
      Date.now = jest
        .fn()
        .mockReturnValueOnce(1000000)
        .mockReturnValueOnce(1001500);
      let result$ = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );
      mockResponse.json(responseData);
      await new Promise<void>((resolve) => {
        result$.subscribe({ next: () => resolve() });
      });

      // Second call with new time
      Date.now = jest
        .fn()
        .mockReturnValueOnce(2000000)
        .mockReturnValueOnce(2001500);
      result$ = interceptor.intercept(mockExecutionContext, mockCallHandler);
      mockResponse.json(responseData);
      await new Promise<void>((resolve) => {
        result$.subscribe({ next: () => resolve() });
      });

      expect(mockProducerClient.sendBatch).toHaveBeenNthCalledWith(1, [
        { body: expect.objectContaining({ idlog: 'uuid-1' }) },
      ]);
      expect(mockProducerClient.sendBatch).toHaveBeenNthCalledWith(2, [
        { body: expect.objectContaining({ idlog: 'uuid-2' }) },
      ]);
    });
  });
});
