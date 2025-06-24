import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Api } from '../index.js';

const DatabasePlugin = {
  name: 'database',
  install({ api }) {
    api.implement('get', async ({ params, resource, api }) => {
      const schema = params.schema;
      
      let context = { schema, resource };
      context = await api.runHooks('beforeValidate', context, resource);
      context = await api.runHooks('afterValidate', context, resource);
      
      context = await api.runHooks('beforeGet', context, resource);
      
      const record = {
        id: Math.floor(Math.random() * 1000),
        resource: resource,
        data: { sample: 'data' }
      };
      context.record = record;
      
      context = await api.runHooks('afterGet', context, resource);
      context = await api.runHooks('beforeSend', context, resource);
      
      return context.record;
    });
    
    api.implement('query', async ({ params, resource, api }) => {
      const schema = params.schema;
      
      let context = { schema, resource, filters: params.filters || {} };
      context = await api.runHooks('beforeValidate', context, resource);
      context = await api.runHooks('afterValidate', context, resource);
      
      context = await api.runHooks('beforeQuery', context, resource);
      
      const records = [
        { id: 1, resource: resource, data: { index: 0 } },
        { id: 2, resource: resource, data: { index: 1 } }
      ];
      context.records = records;
      
      context = await api.runHooks('afterQuery', context, resource);
      context = await api.runHooks('beforeSend', context, resource);
      
      return context.records;
    });
  }
};

describe('Database Plugin', () => {
  it('should install plugin and add methods', async () => {
    const api = new Api({
      name: 'test-db',
      version: '1.0.0'
    });
    
    api.use(DatabasePlugin);
    
    const result = await api.run('get', { schema: {} });
    assert.equal(result.resource, null);
    assert.ok(result.id);
    assert.deepEqual(result.data, { sample: 'data' });
  });

  it('should run query method', async () => {
    const api = new Api({
      name: 'test-db-query',
      version: '1.0.0'
    });
    
    api.use(DatabasePlugin);
    
    const results = await api.run('query', { schema: {}, filters: { active: true } });
    assert.equal(results.length, 2);
    assert.equal(results[0].id, 1);
    assert.equal(results[1].id, 2);
  });
});