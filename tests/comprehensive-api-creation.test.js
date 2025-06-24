import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Api, resetGlobalRegistryForTesting } from '../index.js';

describe('Comprehensive API Creation Tests', () => {
  beforeEach(() => {
    resetGlobalRegistryForTesting();
  });

  describe('Constructor validation', () => {
    it('should handle all types of invalid names', () => {
      const invalidNames = [
        null,
        undefined,
        '',
        ' ',
        '\t',
        '\n',
        '   ',
        123,
        true,
        false,
        [],
        {},
        () => {},
        Symbol('test'),
        NaN,
        Infinity,
        -Infinity,
        0,
        -1,
        1.5,
        new Date(),
        /regex/,
        new Map(),
        new Set(),
        new Error(),
        Promise.resolve(),
        Buffer.from('test'),
        new ArrayBuffer(8),
        new Int8Array(8)
      ];

      for (const name of invalidNames) {
        assert.throws(() => {
          new Api({ name, version: '1.0.0' });
        }, /API instance must have a non-empty "name" property/, `Failed for name: ${String(name)}`);
      }
    });

    it('should accept valid names with various characters', () => {
      const validNames = [
        'a',
        'A',
        '0',
        'my-api',
        'my_api',
        'MyAPI',
        'myAPI123',
        'my.api',
        'my:api',
        'my@api',
        'my/api',
        'my\\api',
        'my api',
        'мой-апи', // Cyrillic
        '我的API', // Chinese
        'मेरा-एपीआई', // Hindi
        'API_v2.0',
        'com.example.api',
        '🚀-api', // Emoji
        'a'.repeat(1000), // Very long name
      ];

      for (const name of validNames) {
        assert.doesNotThrow(() => {
          new Api({ name, version: '1.0.0' });
        }, `Failed for valid name: ${name}`);
      }
    });

    it('should handle all types of invalid versions', () => {
      const invalidVersions = [
        null,
        undefined,
        '',
        ' ',
        'invalid',
        '1',
        '1.0',
        '1.0.0.0',
        'v1.0.0',
        '1.0.0-',
        '1.0.0+',
        '1.0.0-+',
        '1.0.0-+123',
        '1.0.0-123+',
        '1.0.0--alpha',
        '1.0.0++build',
        '01.0.0',
        '1.00.0',
        '1.0.00',
        '-1.0.0',
        '1.-1.0',
        '1.0.-1',
        'a.b.c',
        '1.a.0',
        '1.0.a',
        '🚀.0.0',
        true,
        false,
        123,
        1.0,
        [],
        {},
        () => {},
        new Date()
      ];

      for (const version of invalidVersions) {
        assert.throws(() => {
          new Api({ name: 'test', version });
        }, /Invalid version format/, `Failed for version: ${String(version)}`);
      }
    });

    it('should accept valid semver versions', () => {
      const validVersions = [
        '0.0.0',
        '0.0.1',
        '0.1.0',
        '1.0.0',
        '1.2.3',
        '10.20.30',
        '99.99.99',
        '1.0.0-alpha',
        '1.0.0-alpha.1',
        '1.0.0-alpha.beta',
        '1.0.0-beta',
        '1.0.0-beta.2',
        '1.0.0-beta.11',
        '1.0.0-rc.1',
        '1.0.0+20130313144700',
        '1.0.0-beta+exp.sha.5114f85',
        '1.0.0+21AF26D3----117B344092BD',
        '1.0.0-0.3.7',
        '1.0.0-x.7.z.92',
        '1.0.0-x-y-z.--'
      ];

      for (const version of validVersions) {
        assert.doesNotThrow(() => {
          new Api({ name: 'test', version });
        }, `Failed for valid version: ${version}`);
      }
    });

    it('should handle missing options object', () => {
      assert.throws(() => {
        new Api();
      }, /API instance must have a non-empty "name" property/);
    });

    it('should handle null options', () => {
      assert.throws(() => {
        new Api(null);
      }, /API instance must have a non-empty "name" property/);
    });

    it('should handle non-object options', () => {
      const nonObjects = ['string', 123, true, [], () => {}];
      for (const opt of nonObjects) {
        assert.throws(() => {
          new Api(opt);
        });
      }
    });
  });

  describe('Default values and options merging', () => {
    it('should use default version when not provided', () => {
      const api = new Api({ name: 'test' });
      assert.equal(api.options.version, '1.0.0');
    });

    it('should preserve all custom options', () => {
      const customOptions = {
        name: 'test',
        version: '2.0.0',
        custom1: 'value1',
        custom2: { nested: true },
        custom3: [1, 2, 3],
        custom4: null,
        custom5: undefined,
        custom6: 0,
        custom7: false,
        custom8: '',
        custom9: Symbol('test'),
        custom10: new Date()
      };

      const api = new Api(customOptions);
      
      for (const [key, value] of Object.entries(customOptions)) {
        assert.equal(api.options[key], value, `Failed for option: ${key}`);
      }
    });

    it('should not modify the original options object', () => {
      const options = {
        name: 'test',
        version: '1.0.0',
        custom: { value: 1 }
      };
      const originalOptions = JSON.parse(JSON.stringify(options));
      
      new Api(options);
      
      assert.deepEqual(options, originalOptions);
    });

    it('should handle options with prototype pollution attempts', () => {
      const maliciousOptions = {
        name: 'test',
        version: '1.0.0',
        '__proto__': { polluted: true },
        'constructor': { polluted: true },
        'prototype': { polluted: true }
      };

      const api = new Api(maliciousOptions);
      
      assert.equal(api.options.__proto__, maliciousOptions.__proto__);
      assert.equal(api.options.constructor, maliciousOptions.constructor);
      assert.equal(api.options.prototype, maliciousOptions.prototype);
      
      // Ensure no actual pollution occurred
      assert.equal({}.polluted, undefined);
    });
  });

  describe('API Registry', () => {
    it('should handle concurrent registrations', () => {
      const apis = [];
      for (let i = 0; i < 100; i++) {
        apis.push(new Api({
          name: `api-${i}`,
          version: '1.0.0'
        }));
      }

      for (let i = 0; i < 100; i++) {
        const found = Api.registry.get(`api-${i}`, '1.0.0');
        assert.equal(found, apis[i]);
      }
    });

    it('should prevent duplicate registrations', () => {
      new Api({ name: 'duplicate', version: '1.0.0' });
      
      assert.throws(() => {
        new Api({ name: 'duplicate', version: '1.0.0' });
      }, /API 'duplicate' version '1.0.0' is already registered/);
    });

    it('should allow same name with different versions', () => {
      const api1 = new Api({ name: 'versioned', version: '1.0.0' });
      const api2 = new Api({ name: 'versioned', version: '2.0.0' });
      const api3 = new Api({ name: 'versioned', version: '1.1.0' });
      
      assert.equal(Api.registry.get('versioned', '1.0.0'), api1);
      assert.equal(Api.registry.get('versioned', '2.0.0'), api2);
      assert.equal(Api.registry.get('versioned', '1.1.0'), api3);
    });

    it('should handle version resolution correctly', () => {
      new Api({ name: 'resolver', version: '1.0.0' });
      new Api({ name: 'resolver', version: '1.1.0' });
      new Api({ name: 'resolver', version: '1.2.0' });
      new Api({ name: 'resolver', version: '2.0.0' });
      new Api({ name: 'resolver', version: '2.1.0' });
      
      // Exact matches
      assert.equal(Api.registry.get('resolver', '1.1.0').options.version, '1.1.0');
      
      // Latest
      assert.equal(Api.registry.get('resolver', 'latest').options.version, '2.1.0');
      assert.equal(Api.registry.get('resolver').options.version, '2.1.0');
      
      // Range queries
      assert.equal(Api.registry.get('resolver', '^1.0.0').options.version, '1.2.0');
      assert.equal(Api.registry.get('resolver', '~1.1.0').options.version, '1.1.0');
      assert.equal(Api.registry.get('resolver', '>=1.1.0 <2.0.0').options.version, '1.2.0');
      assert.equal(Api.registry.get('resolver', '>1.0.0').options.version, '2.1.0');
      
      // Non-existent exact version should return closest higher
      assert.equal(Api.registry.get('resolver', '1.0.5').options.version, '1.1.0');
      assert.equal(Api.registry.get('resolver', '0.9.0'), null);
    });

    it('should handle registry list correctly', () => {
      new Api({ name: 'list1', version: '1.0.0' });
      new Api({ name: 'list1', version: '2.0.0' });
      new Api({ name: 'list2', version: '1.0.0' });
      
      const list = Api.registry.list();
      
      assert.deepEqual(list.list1, ['2.0.0', '1.0.0']);
      assert.deepEqual(list.list2, ['1.0.0']);
    });

    it('should handle registry.has correctly', () => {
      new Api({ name: 'exists', version: '1.0.0' });
      
      assert.equal(Api.registry.has('exists'), true);
      assert.equal(Api.registry.has('exists', '1.0.0'), true);
      assert.equal(Api.registry.has('exists', '2.0.0'), false);
      assert.equal(Api.registry.has('not-exists'), false);
      assert.equal(Api.registry.has('not-exists', '1.0.0'), false);
      assert.equal(Api.registry.has(null), false);
      assert.equal(Api.registry.has(undefined), false);
      assert.equal(Api.registry.has(''), false);
    });

    it('should handle registry.versions correctly', () => {
      new Api({ name: 'versions-test', version: '1.0.0' });
      new Api({ name: 'versions-test', version: '1.1.0' });
      new Api({ name: 'versions-test', version: '2.0.0' });
      new Api({ name: 'versions-test', version: '0.9.0' });
      
      const versions = Api.registry.versions('versions-test');
      assert.deepEqual(versions, ['2.0.0', '1.1.0', '1.0.0', '0.9.0']);
      
      assert.deepEqual(Api.registry.versions('non-existent'), []);
    });

    it('should handle registry.find as alias for get', () => {
      const api = new Api({ name: 'findable', version: '1.0.0' });
      
      assert.equal(Api.registry.find('findable', '1.0.0'), api);
      assert.equal(Api.registry.find('findable'), api);
    });
  });

  describe('Instance properties initialization', () => {
    it('should initialize all expected properties', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      assert.ok(api.hooks instanceof Map);
      assert.ok(api.constants instanceof Map);
      assert.ok(api.implementers instanceof Map);
      assert.ok(api._installedPlugins instanceof Set);
      assert.ok(api._resources instanceof Map);
      assert.ok(typeof api._options === 'object');
      assert.ok(typeof api.run === 'function');
      assert.ok(typeof api.resources === 'object');
    });

    it('should freeze api options in _options', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      assert.ok(Object.isFrozen(api._options.api));
      assert.throws(() => {
        api._options.api.name = 'modified';
      });
    });

    it('should handle extremely large number of properties', () => {
      const options = {
        name: 'test',
        version: '1.0.0'
      };
      
      // Add 10000 properties
      for (let i = 0; i < 10000; i++) {
        options[`prop${i}`] = i;
      }
      
      const api = new Api(options);
      
      for (let i = 0; i < 10000; i++) {
        assert.equal(api.options[`prop${i}`], i);
      }
    });
  });

  describe('Memory and resource management', () => {
    it('should not leak memory with repeated instantiation', () => {
      // Create and let GC many instances
      for (let i = 0; i < 1000; i++) {
        new Api({ name: `temp-${i}`, version: '1.0.0' });
      }
      
      // Should be able to create more without issues
      assert.doesNotThrow(() => {
        new Api({ name: 'after-many', version: '1.0.0' });
      });
    });

    it('should handle circular references in options', () => {
      const options = {
        name: 'test',
        version: '1.0.0'
      };
      options.circular = options;
      options.nested = { parent: options };
      
      assert.doesNotThrow(() => {
        new Api(options);
      });
    });
  });

  describe('Edge cases and unusual scenarios', () => {
    it('should handle toString and valueOf overrides in options', () => {
      const options = {
        name: 'test',
        version: '1.0.0',
        toString: () => { throw new Error('toString called'); },
        valueOf: () => { throw new Error('valueOf called'); }
      };
      
      const api = new Api(options);
      assert.equal(typeof api.options.toString, 'function');
      assert.equal(typeof api.options.valueOf, 'function');
    });

    it('should handle options with null prototype', () => {
      const options = Object.create(null);
      options.name = 'test';
      options.version = '1.0.0';
      
      assert.doesNotThrow(() => {
        new Api(options);
      });
    });

    it('should handle re-registration after reset', () => {
      const api1 = new Api({ name: 'reset-test', version: '1.0.0' });
      resetGlobalRegistryForTesting();
      
      // Should be able to register again
      const api2 = new Api({ name: 'reset-test', version: '1.0.0' });
      
      // Old reference should not be in registry
      assert.notEqual(Api.registry.get('reset-test', '1.0.0'), api1);
      assert.equal(Api.registry.get('reset-test', '1.0.0'), api2);
    });

    it('should handle Unicode in API names and versions', () => {
      assert.doesNotThrow(() => {
        new Api({ 
          name: '🚀📦™️', 
          version: '1.0.0'
        });
      });
    });

    it('should handle very long version strings', () => {
      const longVersion = '1.0.0-' + 'alpha'.repeat(100);
      assert.doesNotThrow(() => {
        new Api({ name: 'test', version: longVersion });
      });
    });
  });
});