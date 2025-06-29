import test from 'node:test';
import assert from 'node:assert/strict';
import { Api, resetGlobalRegistryForTesting, ConfigurationError } from '../index.js';

// Reset registry before each test to avoid conflicts
test.beforeEach(() => {
  resetGlobalRegistryForTesting();
});

test('Registry', async (t) => {
  await t.test('should register APIs by name and version', () => {
    const api1 = new Api({ name: 'test-api', version: '1.0.0' });
    const api2 = new Api({ name: 'test-api', version: '2.0.0' });
    
    assert.ok(Api.registry.has('test-api'));
    assert.ok(Api.registry.has('test-api', '1.0.0'));
    assert.ok(Api.registry.has('test-api', '2.0.0'));
  });

  await t.test('should prevent duplicate registrations', () => {
    new Api({ name: 'dup-test', version: '1.0.0' });
    assert.throws(
      () => new Api({ name: 'dup-test', version: '1.0.0' }),
      ConfigurationError
    );
  });

  await t.test('should retrieve APIs by version', () => {
    const api1 = new Api({ name: 'versioned', version: '1.0.0' });
    const api2 = new Api({ name: 'versioned', version: '2.0.0' });
    
    const retrieved1 = Api.registry.get('versioned', '1.0.0');
    const retrieved2 = Api.registry.get('versioned', '2.0.0');
    
    assert.equal(retrieved1.options.version, '1.0.0');
    assert.equal(retrieved2.options.version, '2.0.0');
  });

  await t.test('should get latest version by default', () => {
    new Api({ name: 'latest-test', version: '1.0.0' });
    new Api({ name: 'latest-test', version: '2.0.0' });
    new Api({ name: 'latest-test', version: '1.5.0' });
    
    const latest = Api.registry.get('latest-test');
    assert.equal(latest.options.version, '2.0.0');
  });

  await t.test('should support semver ranges', () => {
    new Api({ name: 'range-test', version: '1.0.0' });
    new Api({ name: 'range-test', version: '1.5.0' });
    new Api({ name: 'range-test', version: '2.0.0' });
    
    const v1Compatible = Api.registry.get('range-test', '^1.0.0');
    assert.equal(v1Compatible.options.version, '1.5.0'); // Latest 1.x
    
    const v1Minor = Api.registry.get('range-test', '~1.0.0');
    assert.equal(v1Minor.options.version, '1.0.0'); // 1.0.x only
  });

  await t.test('should list all registered APIs', () => {
    new Api({ name: 'list-test-1', version: '1.0.0' });
    new Api({ name: 'list-test-2', version: '1.0.0' });
    new Api({ name: 'list-test-2', version: '2.0.0' });
    
    const registry = Api.registry.list();
    assert.ok(registry['list-test-1']);
    assert.deepEqual(registry['list-test-1'], ['1.0.0']);
    assert.deepEqual(registry['list-test-2'], ['2.0.0', '1.0.0']);
  });
});