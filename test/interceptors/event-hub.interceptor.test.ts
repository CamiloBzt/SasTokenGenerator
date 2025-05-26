import { EventHubProducerClient } from '@azure/event-hubs';
import { EventHubInterceptor } from '@src/interceptors/event-hub.interceptor';

jest.mock('@azure/event-hubs', () => {
  return {
    EventHubProducerClient: jest.fn().mockImplementation(() => {
      return {
        sendBatch: jest.fn().mockResolvedValue(undefined),
      };
    }),
  };
});

describe('EventHubInterceptor', () => {
  let interceptor: EventHubInterceptor;
  let mockProducerClient: jest.Mocked<EventHubProducerClient>;

  beforeEach(() => {
    mockProducerClient = {
      sendBatch: jest.fn().mockResolvedValue(undefined),
    } as any;

    (EventHubProducerClient as jest.Mock).mockImplementation(
      () => mockProducerClient,
    );

    interceptor = new EventHubInterceptor(
      'fake-connection-string',
      'fake-event-hub',
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });
});
