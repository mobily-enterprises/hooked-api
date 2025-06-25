import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Api, resetGlobalRegistryForTesting } from '../index.js';

describe('Resources', () => {
  beforeEach(() => {
    resetGlobalRegistryForTesting();
  });

  it('should add resources with schemas', () => {
    const api = new Api({
      name: 'test-resources',
      version: '1.0.0'
    });
    
    api.addResource('users', {
      schema: {
        type: 'object',
        properties: {
          name: { type: 'string', required: true },
          email: { type: 'string', format: 'email' }
        }
      }
    });
    
    api.addResource('departments', {
      schema: {
        type: 'object',
        properties: {
          name: { type: 'string', required: true },
          budget: { type: 'number', minimum: 0 }
        }
      }
    });
    
    assert.ok(api._resources.has('users'));
    assert.ok(api._resources.has('departments'));
  });

  it('should access resources through proxy', async () => {
    const api = new Api({
      name: 'test-resources',
      version: '1.0.0'
    });
    
    api.customize({
      implementers: {
        test: async ({ resource }) => `Called on ${resource || 'API'}`
      }
    });
    
    api.addResource('users', {});
    
    const result = await api.resources.users.test();
    assert.equal(result, 'Called on users');
  });

  it('should throw error for duplicate resource', () => {
    const api = new Api({
      name: 'test-resources',
      version: '1.0.0'
    });
    
    api.addResource('users', {});
    
    assert.throws(() => {
      api.addResource('users', {});
    }, /Resource 'users' already exists/);
  });
});