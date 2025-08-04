import {
    ApiAppendLogOperation,
    ApiBulkLogOperation,
    ApiLogStatsOperation,
    ApiLoggingErrorResponses,
    ApiReadLogOperation,
} from '../../../src/shared/decorators/blob-logging.decorator';

describe('blob-logging decorators', () => {
  it('ApiAppendLogOperation should be a function and return a value', () => {
    expect(typeof ApiAppendLogOperation).toBe('function');
    expect(ApiAppendLogOperation()).toBeDefined();
  });

  it('ApiBulkLogOperation should be a function and return a value', () => {
    expect(typeof ApiBulkLogOperation).toBe('function');
    expect(ApiBulkLogOperation()).toBeDefined();
  });

  it('ApiReadLogOperation should be a function and return a value', () => {
    expect(typeof ApiReadLogOperation).toBe('function');
    expect(ApiReadLogOperation()).toBeDefined();
  });

  it('ApiLogStatsOperation should be a function and return a value', () => {
    expect(typeof ApiLogStatsOperation).toBe('function');
    expect(ApiLogStatsOperation()).toBeDefined();
  });

  it('ApiLoggingErrorResponses should be a function and return a value', () => {
    expect(typeof ApiLoggingErrorResponses).toBe('function');
    expect(ApiLoggingErrorResponses()).toBeDefined();
  });
});
