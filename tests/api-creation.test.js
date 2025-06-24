import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Api } from '../index.js';

describe('API Creation', () => {
  it('should create an API with name and version', () => {
    const api = new Api({
      name: 'myapp',
      version: '1.0.0'
    });
    
    assert.equal(api.options.name, 'myapp');
    assert.equal(api.options.version, '1.0.0');
  });

  it('should throw error without name', () => {
    assert.throws(() => {
      new Api({ version: '1.0.0' });
    }, /API instance must have a non-empty "name" property/);
  });

  it('should throw error with invalid version', () => {
    assert.throws(() => {
      new Api({ name: 'test', version: 'invalid' });
    }, /Invalid version format/);
  });

  it('should register in global registry', () => {
    const api = new Api({
      name: 'test-registry',
      version: '1.0.0'
    });
    
    const found = Api.registry.get('test-registry', '1.0.0');
    assert.equal(found, api);
  });
});