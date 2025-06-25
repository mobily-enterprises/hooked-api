import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Api, resetGlobalRegistryForTesting } from '../index.js';

describe('Edge Cases - API Creation and Registry', () => {
  beforeEach(() => {
    resetGlobalRegistryForTesting();
  });

  it('should handle empty string name', () => {
    assert.throws(() => {
      new Api({ name: '', version: '1.0.0' });
    }, /API instance must have a non-empty "name" property/);
  });

  it('should handle whitespace-only name', () => {
    assert.throws(() => {
      new Api({ name: '   ', version: '1.0.0' });
    }, /API instance must have a non-empty "name" property/);
  });

  it('should handle null name', () => {
    assert.throws(() => {
      new Api({ name: null, version: '1.0.0' });
    }, /API instance must have a non-empty "name" property/);
  });

  it('should handle undefined name', () => {
    assert.throws(() => {
      new Api({ version: '1.0.0' });
    }, /API instance must have a non-empty "name" property/);
  });

  it('should handle non-string name types', () => {
    assert.throws(() => {
      new Api({ name: 123, version: '1.0.0' });
    }, /API instance must have a non-empty "name" property/);

    assert.throws(() => {
      new Api({ name: {}, version: '1.0.0' });
    }, /API instance must have a non-empty "name" property/);

    assert.throws(() => {
      new Api({ name: [], version: '1.0.0' });
    }, /API instance must have a non-empty "name" property/);
  });

  it('should handle various invalid version formats', () => {
    const invalidVersions = [
      '',
      '1',
      '1.0',
      // 'v1.0.0', // This is actually valid - semver.valid returns '1.0.0'
      '1.0.0.0',
      '1.a.0',
      'latest',
      null,
      undefined,
      123,
      {},
      []
    ];

    for (const version of invalidVersions) {
      assert.throws(() => {
        new Api({ name: 'test', version });
      }, /Invalid version format/);
    }
  });

  it('should use default version when not provided', () => {
    const api = new Api({ name: 'test' });
    assert.equal(api.options.version, '1.0.0');
  });

  it('should freeze options.api in _options', () => {
    const api = new Api({ name: 'test', custom: 'value' });
    assert.throws(() => {
      api._options.api.custom = 'changed';
    }, TypeError);
  });

  it('should handle registry operations with non-existent APIs', () => {
    assert.equal(Api.registry.get('non-existent'), null);
    assert.equal(Api.registry.get('non-existent', '1.0.0'), null);
    assert.equal(Api.registry.find('non-existent'), null);
    assert.equal(Api.registry.has('non-existent'), false);
    assert.deepEqual(Api.registry.versions('non-existent'), []);
  });

  it('should handle registry operations with empty/null names', () => {
    assert.equal(Api.registry.has(''), false);
    assert.equal(Api.registry.has(null), false);
    assert.equal(Api.registry.has(undefined), false);
  });

  it('should handle version conflicts in registry', () => {
    new Api({ name: 'conflict-test', version: '1.0.0' });
    assert.throws(() => {
      new Api({ name: 'conflict-test', version: '1.0.0' });
    }, /API 'conflict-test' version '1.0.0' is already registered/);
  });

  it('should find latest version correctly', () => {
    new Api({ name: 'version-test', version: '1.0.0' });
    new Api({ name: 'version-test', version: '2.0.0' });
    new Api({ name: 'version-test', version: '1.5.0' });
    
    const latest = Api.registry.get('version-test');
    assert.equal(latest.options.version, '2.0.0');
  });

  it('should handle version range queries', () => {
    new Api({ name: 'range-test', version: '1.0.0' });
    new Api({ name: 'range-test', version: '1.5.0' });
    new Api({ name: 'range-test', version: '2.0.0' });
    
    const v1Compatible = Api.registry.get('range-test', '^1.0.0');
    assert.equal(v1Compatible.options.version, '1.5.0');
    
    const v1Exact = Api.registry.get('range-test', '~1.0.0');
    assert.equal(v1Exact.options.version, '1.0.0');
  });

  it('should return null for non-existent exact versions', () => {
    new Api({ name: 'simple-test', version: '1.0.0' });
    new Api({ name: 'simple-test', version: '1.5.0' });
    new Api({ name: 'simple-test', version: '2.0.0' });
    
    // Exact version that doesn't exist should return null
    const result = Api.registry.get('simple-test', '1.2.0');
    assert.equal(result, null);
  });

  it('should list all APIs correctly', () => {
    new Api({ name: 'list-test-1', version: '1.0.0' });
    new Api({ name: 'list-test-1', version: '2.0.0' });
    new Api({ name: 'list-test-2', version: '1.0.0' });
    
    const list = Api.registry.list();
    assert.deepEqual(list['list-test-1'], ['2.0.0', '1.0.0']);
    assert.deepEqual(list['list-test-2'], ['1.0.0']);
  });

  it('should handle has() with specific versions', () => {
    new Api({ name: 'has-test', version: '1.0.0' });
    
    assert.ok(Api.registry.has('has-test'));
    assert.ok(Api.registry.has('has-test', '1.0.0'));
    assert.ok(!Api.registry.has('has-test', '2.0.0'));
  });
});