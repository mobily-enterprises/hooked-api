import { Api } from './index.js';

// Example demonstrating scope iteration functionality
async function scopeIterationExample() {
  console.log('=== Hooked API Scope Iteration Example ===\n');
  
  const api = new Api({ name: 'blog-api' });
  
  // Add some scope methods
  await api.customize({
    scopeMethods: {
      count: async ({ scopeName }) => {
        return { scope: scopeName, count: Math.floor(Math.random() * 100) };
      },
      info: async ({ scopeName }) => {
        return { scope: scopeName, description: `Information about ${scopeName}` };
      }
    }
  });
  
  // Add multiple scopes
  await api.addScope('users', { schema: { name: 'string', email: 'string' } });
  await api.addScope('posts', { schema: { title: 'string', content: 'text' } });
  await api.addScope('comments', { schema: { text: 'string', author: 'string' } });
  await api.addScope('tags', { schema: { name: 'string', color: 'string' } });
  
  console.log('1. Iterating over scopes with for...in loop:');
  for (const scopeName in api.scopes) {
    console.log(`   - ${scopeName}`);
  }
  
  console.log('\n2. Using Object.keys() to get scope names:');
  const scopeNames = Object.keys(api.scopes);
  console.log('   Scope names:', scopeNames);
  
  console.log('\n3. Using Object.entries() to iterate with scope objects:');
  const entries = Object.entries(api.scopes);
  for (const [name, scope] of entries) {
    console.log(`   - ${name}:`, typeof scope);
  }
  
  console.log('\n4. Practical example - calling methods on all scopes:');
  for (const scopeName in api.scopes) {
    const countResult = await api.scopes[scopeName].count();
    const infoResult = await api.scopes[scopeName].info();
    console.log(`   ${scopeName}: ${countResult.count} items - ${infoResult.description}`);
  }
  
  console.log('\n5. Filtering scopes based on some criteria:');
  const scopesWithStringSchema = [];
  for (const scopeName in api.scopes) {
    // In a real scenario, you might check scope options or other metadata
    if (scopeName.length <= 5) { // Simple example filter
      scopesWithStringSchema.push(scopeName);
    }
  }
  console.log('   Short-named scopes (≤5 chars):', scopesWithStringSchema);
  
  console.log('\n=== Example Completed ===');
}

scopeIterationExample().catch(console.error);