import test from 'node:test';
import assert from 'node:assert/strict';
import { Api, LogLevel, resetGlobalRegistryForTesting, ConfigurationError } from '../index.js';

// Reset registry before each test to avoid conflicts
test.beforeEach(() => {
  resetGlobalRegistryForTesting();
});

test('Basic API instantiation', async (t) => {
  await t.test('should create API with valid name and version', () => {
    const api = new Api({ name: 'test-api', version: '1.0.0' });
    assert.equal(api.options.name, 'test-api');
    assert.equal(api.options.version, '1.0.0');
  });

  await t.test('should throw error when name is missing', () => {
    assert.throws(
      () => new Api({ version: '1.0.0' }),
      ConfigurationError
    );
  });

  await t.test('should throw error when name is empty', () => {
    assert.throws(
      () => new Api({ name: '', version: '1.0.0' }),
      ConfigurationError
    );
  });

  await t.test('should throw error when name is null', () => {
    assert.throws(
      () => new Api({ name: null, version: '1.0.0' }),
      ConfigurationError
    );
  });

  await t.test('should throw error when version is invalid', () => {
    assert.throws(
      () => new Api({ name: 'test', version: '1.0' }),
      ConfigurationError
    );
  });

  await t.test('should throw error when version is not a string', () => {
    assert.throws(
      () => new Api({ name: 'test', version: 1.0 }),
      ConfigurationError
    );
  });

  await t.test('should apply default logging configuration', () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    assert.equal(api.options.logging.level, 'info');
    assert.equal(api.options.logging.format, 'pretty');
    assert.equal(api.options.logging.timestamp, true);
    assert.equal(api.options.logging.colors, true);
    assert.equal(api.options.logging.logger, console);
  });

  await t.test('should merge custom logging configuration', () => {
    const api = new Api({ 
      name: 'test', 
      version: '1.0.0',
      logging: { level: 'debug', format: 'json' }
    });
    assert.equal(api.options.logging.level, 'debug');
    assert.equal(api.options.logging.format, 'json');
    assert.equal(api.options.logging.timestamp, true); // default preserved
  });

  await t.test('should allow numeric log levels', () => {
    const api = new Api({ 
      name: 'test', 
      version: '1.0.0',
      logging: { level: LogLevel.DEBUG }
    });
    assert.equal(api._logLevel, LogLevel.DEBUG);
  });
});