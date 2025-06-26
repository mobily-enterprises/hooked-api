import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Api } from '../index.js';

describe('Resource Overrides', () => {
  it('should override implementers at resource level', async () => {
    const api = new Api({
      name: 'test-overrides',
      version: '1.0.0'
    });
    
    api.customize({
      implementers: {
        getMessage: async () => 'API default message'
      }
    });
    
    api.addResource('special', {}, {
      implementers: {
        getMessage: async () => 'Special resource message'
      }
    });
    
    api.addResource('normal', {});
    
    const specialMsg = await api.resources.special.getMessage();
    assert.equal(specialMsg, 'Special resource message');
    
    const normalMsg = await api.resources.normal.getMessage();
    assert.equal(normalMsg, 'API default message');
  });

  it('should override vars at resource level', async () => {
    const api = new Api({
      name: 'test-overrides-vars',
      version: '1.0.0'
    });
    
    api.customize({
      vars: {
        tableName: 'default_table'
      },
      implementers: {
        getTable: async ({ api }) => api.vars.tableName
      }
    });
    
    api.addResource('users', {}, {
      vars: {
        tableName: 'users_table'
      }
    });
    
    const usersTable = await api.resources.users.getTable();
    assert.equal(usersTable, 'users_table');
    
    const defaultTable = await api.run('getTable');
    assert.equal(defaultTable, 'default_table');
  });
});