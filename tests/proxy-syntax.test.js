import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Api } from '../index.js';

describe('Proxy Syntax', () => {
  it('should support both api.run() syntaxes', async () => {
    const api = new Api({
      name: 'test-proxy',
      version: '1.0.0'
    });
    
    api.customize({
      implementers: {
        greet: async ({ params }) => `Hello ${params.name}!`
      }
    });
    
    // Traditional syntax
    const result1 = await api.run('greet', { name: 'World' });
    assert.equal(result1, 'Hello World!');
    
    // Proxy syntax
    const result2 = await api.run.greet({ name: 'Universe' });
    assert.equal(result2, 'Hello Universe!');
  });

  it('should support resource proxy syntax', async () => {
    const api = new Api({
      name: 'test-proxy-resources',
      version: '1.0.0'
    });
    
    api.customize({
      implementers: {
        identify: async ({ resource, params }) => `${resource}: ${params.id}`
      }
    });
    
    api.addResource('users', {});
    api.addResource('posts', {});
    
    const user = await api.resources.users.identify({ id: 123 });
    assert.equal(user, 'users: 123');
    
    const post = await api.resources.posts.identify({ id: 456 });
    assert.equal(post, 'posts: 456');
  });
});