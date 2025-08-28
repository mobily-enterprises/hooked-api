import test from 'node:test';
import assert from 'node:assert/strict';
import { Api, LogLevel, ConfigurationError } from '../index.js';


test('Basic API instantiation', async (t) => {
  await t.test('should create API with valid name', () => {
    const api = new Api({ name: 'test-api' });
    assert.equal(api.options.name, 'test-api');
  });

  await t.test('should throw error when name is missing', () => {
    assert.throws(
      () => new Api({}),
      ConfigurationError
    );
  });

  await t.test('should throw error when name is empty', () => {
    assert.throws(
      () => new Api({ name: '' }),
      ConfigurationError
    );
  });

  await t.test('should throw error when name is null', () => {
    assert.throws(
      () => new Api({ name: null }),
      ConfigurationError
    );
  });



  await t.test('should apply default logging configuration', () => {
    const api = new Api({ name: 'test' });
    assert.equal(api.options.logging.level, 'info');
    assert.equal(api.options.logging.format, 'pretty');
    assert.equal(api.options.logging.timestamp, true);
    assert.equal(api.options.logging.colors, true);
    assert.equal(api.options.logging.logger, console);
  });

  await t.test('should merge custom logging configuration', () => {
    const api = new Api({ 
      name: 'test', 
      logging: { level: 'debug', format: 'json' }
    });
    assert.equal(api.options.logging.level, 'debug');
    assert.equal(api.options.logging.format, 'json');
    assert.equal(api.options.logging.timestamp, true); // default preserved
  });

  await t.test('should allow numeric log levels', () => {
    const api = new Api({ 
      name: 'test', 
      logging: { level: LogLevel.DEBUG }
    });
    assert.equal(api._logLevel, LogLevel.DEBUG);
  });
});