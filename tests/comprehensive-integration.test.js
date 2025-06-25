import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Api, resetGlobalRegistryForTesting } from '../index.js';

describe('Comprehensive Integration Tests - Real World Scenarios', () => {
  beforeEach(() => {
    resetGlobalRegistryForTesting();
  });

  describe('E-Commerce API System', () => {
    it('should implement complete e-commerce functionality', async () => {
      // Create main API
      const api = new Api({
        name: 'ecommerce',
        version: '1.0.0'
      });
      
      api.customize({
        constants: {
          TAX_RATE: 0.08,
          MAX_CART_ITEMS: 100,
          CURRENCY: 'USD'
        }
      });

      // Add authentication plugin
      const authPlugin = {
        name: 'auth',
        install: ({ api }) => {
          let users = new Map();
          let sessions = new Map();
          
          api.implement('register', ({ params }) => {
            if (users.has(params.email)) {
              throw new Error('User already exists');
            }
            const user = {
              id: Date.now(),
              email: params.email,
              name: params.name,
              password: params.password // In real app, would hash
            };
            users.set(params.email, user);
            return { id: user.id, email: user.email, name: user.name };
          });
          
          api.implement('login', ({ params }) => {
            const user = users.get(params.email);
            if (!user || user.password !== params.password) {
              throw new Error('Invalid credentials');
            }
            const token = `token-${Date.now()}-${Math.random()}`;
            sessions.set(token, user);
            return { token, user: { id: user.id, email: user.email } };
          });
          
          api.addHook('before:auth', 'validateToken', ({ context }) => {
            const token = context.token;
            if (!token || !sessions.has(token)) {
              throw new Error('Unauthorized');
            }
            context.user = sessions.get(token);
          });
        }
      };
      
      api.use(authPlugin);

      // Add inventory management
      const inventory = new Map();
      
      api.addResource('products', { collection: 'products' }, {
        implementers: {
          create: ({ params, context }) => {
            const product = {
              id: Date.now(),
              name: params.name,
              price: params.price,
              stock: params.stock || 0,
              description: params.description
            };
            inventory.set(product.id, product);
            return product;
          },
          
          list: ({ params }) => {
            const products = Array.from(inventory.values());
            if (params.inStock) {
              return products.filter(p => p.stock > 0);
            }
            return products;
          },
          
          get: ({ params }) => {
            const product = inventory.get(params.id);
            if (!product) throw new Error('Product not found');
            return product;
          },
          
          updateStock: ({ params }) => {
            const product = inventory.get(params.id);
            if (!product) throw new Error('Product not found');
            product.stock += params.delta;
            return product;
          }
        },
        constants: {
          MAX_PRICE: 999999,
          MIN_STOCK_WARNING: 10
        }
      });

      // Add shopping cart functionality
      const carts = new Map();
      
      api.addResource('cart', { persistent: false }, {
        implementers: {
          get: async ({ context }) => {
            await api.runHooks('before:auth', context);
            const userId = context.user.id;
            if (!carts.has(userId)) {
              carts.set(userId, { items: [], userId });
            }
            return carts.get(userId);
          },
          
          addItem: async ({ params, context, api }) => {
            await api.runHooks('before:auth', context);
            const userId = context.user.id;
            
            // Check product exists and has stock
            const product = await api.resources.products.get({ id: params.productId });
            if (product.stock < params.quantity) {
              throw new Error('Insufficient stock');
            }
            
            if (!carts.has(userId)) {
              carts.set(userId, { items: [], userId });
            }
            
            const cart = carts.get(userId);
            const existingItem = cart.items.find(i => i.productId === params.productId);
            
            if (existingItem) {
              existingItem.quantity += params.quantity;
            } else {
              cart.items.push({
                productId: params.productId,
                quantity: params.quantity,
                price: product.price
              });
            }
            
            if (cart.items.length > api.constants.get('MAX_CART_ITEMS')) {
              throw new Error('Cart limit exceeded');
            }
            
            return cart;
          },
          
          checkout: async ({ context, api }) => {
            await api.runHooks('before:auth', context);
            const userId = context.user.id;
            const cart = carts.get(userId);
            
            if (!cart || cart.items.length === 0) {
              throw new Error('Cart is empty');
            }
            
            // Calculate total
            let subtotal = 0;
            for (const item of cart.items) {
              subtotal += item.price * item.quantity;
            }
            
            const tax = subtotal * api.constants.get('TAX_RATE');
            const total = subtotal + tax;
            
            // Create order
            const order = {
              id: Date.now(),
              userId,
              items: [...cart.items],
              subtotal,
              tax,
              total,
              currency: api.constants.get('CURRENCY'),
              status: 'pending',
              createdAt: new Date()
            };
            
            // Update inventory
            for (const item of cart.items) {
              await api.resources.products.updateStock({
                id: item.productId,
                delta: -item.quantity
              });
            }
            
            // Clear cart
            cart.items = [];
            
            // Run post-order hooks
            await api.runHooks('after:order', { ...context, order });
            
            return order;
          }
        },
        hooks: {
          'before:addItem': ({ context }) => {
            console.log(`Adding item to cart for user ${context.user?.id}`);
          },
          'after:order': ({ context }) => {
            console.log(`Order ${context.order.id} created for ${context.order.total} ${context.order.currency}`);
          }
        }
      });

      // Add analytics plugin
      const analyticsPlugin = {
        name: 'analytics',
        install: ({ api }) => {
          const events = [];
          
          // Track all method calls
          api.addHook('after:order', 'trackOrder', ({ context }) => {
            events.push({
              type: 'order',
              orderId: context.order.id,
              total: context.order.total,
              timestamp: new Date()
            });
          });
          
          api.implement('getAnalytics', () => {
            return {
              totalEvents: events.length,
              orderCount: events.filter(e => e.type === 'order').length,
              totalRevenue: events
                .filter(e => e.type === 'order')
                .reduce((sum, e) => sum + e.total, 0)
            };
          });
        }
      };
      
      api.use(analyticsPlugin);

      // Test complete flow
      
      // 1. Register user
      const user = await api.run.register({
        email: 'customer@example.com',
        name: 'Test Customer',
        password: 'secure123'
      });
      assert.ok(user.id);
      
      // 2. Login
      const session = await api.run.login({
        email: 'customer@example.com',
        password: 'secure123'
      });
      assert.ok(session.token);
      
      // 3. Create products
      const product1 = await api.resources.products.create({
        name: 'Laptop',
        price: 999.99,
        stock: 50,
        description: 'High-performance laptop'
      });
      
      const product2 = await api.resources.products.create({
        name: 'Mouse',
        price: 29.99,
        stock: 100,
        description: 'Wireless mouse'
      });
      
      // 4. List products
      const products = await api.resources.products.list({ inStock: true });
      assert.equal(products.length, 2);
      
      // 5. Add to cart
      const context = { token: session.token };
      
      await api.resources.cart.addItem({
        productId: product1.id,
        quantity: 1
      }, context);
      
      await api.resources.cart.addItem({
        productId: product2.id,
        quantity: 2
      }, context);
      
      // 6. Check cart
      const cart = await api.resources.cart.get(context);
      assert.equal(cart.items.length, 2);
      
      // 7. Checkout
      const order = await api.resources.cart.checkout(context);
      assert.equal(order.items.length, 2);
      assert.equal(order.subtotal, 1059.97);
      assert.equal(order.tax.toFixed(2), '84.80');
      assert.equal(order.total.toFixed(2), '1144.77');
      
      // 8. Verify inventory updated
      const updatedProduct1 = await api.resources.products.get({ id: product1.id });
      assert.equal(updatedProduct1.stock, 49);
      
      // 9. Check analytics
      const analytics = await api.run.getAnalytics();
      assert.equal(analytics.orderCount, 1);
      assert.equal(analytics.totalRevenue.toFixed(2), '1144.77');
    });
  });

  describe('Blog/CMS System', () => {
    it('should implement complete blog functionality with comments', async () => {
      const blog = new Api({
        name: 'blog',
        version: '2.0.0'
      });
      
      blog.customize({
        constants: {
          MAX_POST_LENGTH: 10000,
          MAX_COMMENT_LENGTH: 1000,
          POSTS_PER_PAGE: 10
        }
      });

      // Content moderation plugin
      const moderationPlugin = {
        name: 'moderation',
        install: ({ api }) => {
          const bannedWords = ['spam', 'inappropriate'];
          
          api.addHook('before:publish', 'checkContent', ({ context }) => {
            const content = context.content || '';
            const title = context.title || '';
            const text = (title + ' ' + content).toLowerCase();
            
            for (const word of bannedWords) {
              if (text.includes(word)) {
                throw new Error('Content contains inappropriate language');
              }
            }
          });
          
          api.implement('addBannedWord', ({ params }) => {
            bannedWords.push(params.word.toLowerCase());
            return bannedWords;
          });
        }
      };
      
      blog.use(moderationPlugin);

      // Posts resource
      const posts = new Map();
      const postComments = new Map();
      
      blog.addResource('posts', { table: 'posts' }, {
        implementers: {
          create: async ({ params, context, api }) => {
            context.title = params.title;
            context.content = params.content;
            
            await api.runHooks('before:publish', context);
            
            const post = {
              id: Date.now(),
              title: params.title,
              content: params.content,
              author: params.author,
              tags: params.tags || [],
              status: 'draft',
              views: 0,
              createdAt: new Date(),
              updatedAt: new Date()
            };
            
            posts.set(post.id, post);
            postComments.set(post.id, []);
            
            return post;
          },
          
          publish: async ({ params, api }) => {
            const post = posts.get(params.id);
            if (!post) throw new Error('Post not found');
            
            post.status = 'published';
            post.publishedAt = new Date();
            post.updatedAt = new Date();
            
            await api.runHooks('after:publish', { post });
            
            return post;
          },
          
          list: ({ params }) => {
            const allPosts = Array.from(posts.values());
            let filtered = allPosts;
            
            if (params.status) {
              filtered = filtered.filter(p => p.status === params.status);
            }
            
            if (params.tag) {
              filtered = filtered.filter(p => p.tags.includes(params.tag));
            }
            
            if (params.author) {
              filtered = filtered.filter(p => p.author === params.author);
            }
            
            // Pagination
            const page = params.page || 1;
            const perPage = params.perPage || api.constants.get('POSTS_PER_PAGE');
            const start = (page - 1) * perPage;
            const end = start + perPage;
            
            return {
              posts: filtered.slice(start, end),
              total: filtered.length,
              page,
              perPage,
              totalPages: Math.ceil(filtered.length / perPage)
            };
          },
          
          get: ({ params }) => {
            const post = posts.get(params.id);
            if (!post) throw new Error('Post not found');
            
            // Increment views
            post.views++;
            
            return {
              ...post,
              comments: postComments.get(params.id) || []
            };
          },
          
          update: async ({ params, context, api }) => {
            const post = posts.get(params.id);
            if (!post) throw new Error('Post not found');
            
            if (params.title !== undefined) {
              context.title = params.title;
              post.title = params.title;
            }
            
            if (params.content !== undefined) {
              context.content = params.content;
              post.content = params.content;
            }
            
            if (params.title || params.content) {
              await api.runHooks('before:publish', context);
            }
            
            if (params.tags !== undefined) post.tags = params.tags;
            
            post.updatedAt = new Date();
            
            return post;
          },
          
          delete: ({ params }) => {
            const post = posts.get(params.id);
            if (!post) throw new Error('Post not found');
            
            posts.delete(params.id);
            postComments.delete(params.id);
            
            return { deleted: true, id: params.id };
          }
        },
        
        hooks: {
          'after:publish': ({ post }) => {
            console.log(`Post "${post.title}" published by ${post.author}`);
          }
        }
      });

      // Comments resource
      blog.addResource('comments', { table: 'comments' }, {
        implementers: {
          add: async ({ params, context, api }) => {
            const post = posts.get(params.postId);
            if (!post) throw new Error('Post not found');
            
            context.content = params.content;
            await api.runHooks('before:publish', context);
            
            const comment = {
              id: Date.now(),
              postId: params.postId,
              author: params.author,
              content: params.content,
              createdAt: new Date()
            };
            
            const comments = postComments.get(params.postId);
            comments.push(comment);
            
            return comment;
          },
          
          list: ({ params }) => {
            return postComments.get(params.postId) || [];
          },
          
          moderate: ({ params }) => {
            const comments = postComments.get(params.postId);
            if (!comments) throw new Error('Post not found');
            
            const index = comments.findIndex(c => c.id === params.commentId);
            if (index === -1) throw new Error('Comment not found');
            
            if (params.action === 'delete') {
              comments.splice(index, 1);
              return { deleted: true };
            } else if (params.action === 'hide') {
              comments[index].hidden = true;
              return comments[index];
            }
          }
        }
      });

      // Search functionality
      blog.implement('search', ({ params }) => {
        const query = params.query.toLowerCase();
        const results = [];
        
        for (const post of posts.values()) {
          if (post.status !== 'published') continue;
          
          const searchText = `${post.title} ${post.content} ${post.tags.join(' ')}`.toLowerCase();
          if (searchText.includes(query)) {
            results.push({
              id: post.id,
              title: post.title,
              excerpt: post.content.substring(0, 200) + '...',
              type: 'post'
            });
          }
        }
        
        return results;
      });

      // RSS feed generation
      blog.implement('generateRSS', async ({ api }) => {
        const recentPosts = await api.resources.posts.list({
          status: 'published',
          perPage: 20
        });
        
        const items = recentPosts.posts.map(post => ({
          title: post.title,
          description: post.content.substring(0, 500),
          pubDate: post.publishedAt,
          guid: post.id,
          author: post.author
        }));
        
        return {
          title: 'Blog RSS Feed',
          description: 'Latest posts from our blog',
          items
        };
      });

      // Test complete blog flow
      
      // 1. Create posts
      const post1 = await blog.resources.posts.create({
        title: 'Introduction to Testing',
        content: 'Testing is crucial for software quality...',
        author: 'john@example.com',
        tags: ['testing', 'quality', 'software']
      });
      
      const post2 = await blog.resources.posts.create({
        title: 'Advanced Testing Patterns',
        content: 'Let us explore advanced testing patterns...',
        author: 'jane@example.com',
        tags: ['testing', 'patterns', 'advanced']
      });
      
      // 2. Publish posts
      await blog.resources.posts.publish({ id: post1.id });
      await blog.resources.posts.publish({ id: post2.id });
      
      // 3. List published posts
      const publishedPosts = await blog.resources.posts.list({ status: 'published' });
      assert.equal(publishedPosts.total, 2);
      
      // 4. Add comments
      await blog.resources.comments.add({
        postId: post1.id,
        author: 'reader@example.com',
        content: 'Great article! Very informative.'
      });
      
      await blog.resources.comments.add({
        postId: post1.id,
        author: 'another@example.com',
        content: 'I have a question about this approach...'
      });
      
      // 5. Get post with comments
      const fullPost = await blog.resources.posts.get({ id: post1.id });
      assert.equal(fullPost.comments.length, 2);
      assert.equal(fullPost.views, 1);
      
      // 6. Search posts
      const searchResults = await blog.run.search({ query: 'testing' });
      assert.equal(searchResults.length, 2);
      
      // 7. Generate RSS
      const rss = await blog.run.generateRSS();
      assert.equal(rss.items.length, 2);
      
      // 8. Test moderation
      await assert.rejects(
        blog.resources.posts.create({
          title: 'Spam Post',
          content: 'This is spam content',
          author: 'spammer@example.com'
        }),
        /inappropriate language/
      );
      
      // 9. Update post
      await blog.resources.posts.update({
        id: post1.id,
        tags: ['testing', 'quality', 'software', 'beginner']
      });
      
      // 10. Filter by tag
      const beginnerPosts = await blog.resources.posts.list({ tag: 'beginner' });
      assert.equal(beginnerPosts.total, 1);
    });
  });

  describe('Multi-tenant SaaS Platform', () => {
    it('should implement complete multi-tenant functionality', async () => {
      const saas = new Api({
        name: 'saas-platform',
        version: '3.0.0'
      });

      // Tenant management
      const tenants = new Map();
      const tenantData = new Map();
      
      const tenantPlugin = {
        name: 'tenancy',
        install: ({ api }) => {
          // Add tenant context to all operations
          api.addHook('before:operation', 'injectTenant', ({ context }) => {
            if (!context.tenantId && !context.skipTenantCheck) {
              throw new Error('Tenant context required');
            }
            
            if (context.tenantId && !tenants.has(context.tenantId)) {
              throw new Error('Invalid tenant');
            }
          });
          
          api.implement('createTenant', ({ params }) => {
            const tenant = {
              id: `tenant-${Date.now()}`,
              name: params.name,
              plan: params.plan || 'free',
              createdAt: new Date(),
              settings: params.settings || {},
              users: [],
              active: true
            };
            
            tenants.set(tenant.id, tenant);
            tenantData.set(tenant.id, new Map());
            
            return tenant;
          });
          
          api.implement('getTenant', ({ params }) => {
            const tenant = tenants.get(params.tenantId);
            if (!tenant) throw new Error('Tenant not found');
            return tenant;
          });
        }
      };
      
      saas.use(tenantPlugin);

      // Add per-tenant data storage
      saas.addResource('data', { isolated: true }, {
        implementers: {
          set: async ({ params, context, api }) => {
            await api.runHooks('before:operation', context);
            
            const tenantStorage = tenantData.get(context.tenantId);
            tenantStorage.set(params.key, params.value);
            
            return { key: params.key, value: params.value };
          },
          
          get: async ({ params, context, api }) => {
            await api.runHooks('before:operation', context);
            
            const tenantStorage = tenantData.get(context.tenantId);
            const value = tenantStorage.get(params.key);
            
            if (value === undefined) throw new Error('Key not found');
            
            return { key: params.key, value };
          },
          
          list: async ({ context, api }) => {
            await api.runHooks('before:operation', context);
            
            const tenantStorage = tenantData.get(context.tenantId);
            const entries = Array.from(tenantStorage.entries());
            
            return entries.map(([key, value]) => ({ key, value }));
          },
          
          delete: async ({ params, context, api }) => {
            await api.runHooks('before:operation', context);
            
            const tenantStorage = tenantData.get(context.tenantId);
            const existed = tenantStorage.delete(params.key);
            
            return { deleted: existed };
          }
        }
      });

      // Add billing/usage tracking
      const usagePlugin = {
        name: 'usage',
        install: ({ api }) => {
          const usage = new Map();
          
          // Track API calls
          api.addHook('after:operation', 'trackUsage', ({ context }) => {
            if (!context.tenantId) return;
            
            const tenantUsage = usage.get(context.tenantId) || {
              apiCalls: 0,
              storage: 0,
              bandwidth: 0
            };
            
            tenantUsage.apiCalls++;
            usage.set(context.tenantId, tenantUsage);
          });
          
          api.implement('getUsage', ({ params }) => {
            return usage.get(params.tenantId) || {
              apiCalls: 0,
              storage: 0,
              bandwidth: 0
            };
          });
          
          api.implement('resetUsage', ({ params }) => {
            usage.set(params.tenantId, {
              apiCalls: 0,
              storage: 0,
              bandwidth: 0
            });
            return { reset: true };
          });
        }
      };
      
      saas.use(usagePlugin);

      // Add webhook system
      const webhooks = new Map();
      
      saas.addResource('webhooks', { perTenant: true }, {
        implementers: {
          register: async ({ params, context, api }) => {
            await api.runHooks('before:operation', context);
            
            const tenantWebhooks = webhooks.get(context.tenantId) || [];
            const webhook = {
              id: Date.now(),
              url: params.url,
              events: params.events,
              secret: `secret-${Math.random()}`,
              active: true
            };
            
            tenantWebhooks.push(webhook);
            webhooks.set(context.tenantId, tenantWebhooks);
            
            return webhook;
          },
          
          trigger: async ({ params, context, api }) => {
            await api.runHooks('before:operation', context);
            
            const tenantWebhooks = webhooks.get(context.tenantId) || [];
            const triggered = [];
            
            for (const webhook of tenantWebhooks) {
              if (webhook.active && webhook.events.includes(params.event)) {
                // In real app, would make HTTP request
                triggered.push({
                  webhookId: webhook.id,
                  url: webhook.url,
                  payload: params.payload
                });
              }
            }
            
            return { triggered: triggered.length, webhooks: triggered };
          }
        }
      });

      // Test multi-tenant flow
      
      // 1. Create tenants
      const tenant1 = await saas.run.createTenant({
        name: 'Acme Corp',
        plan: 'pro',
        settings: { theme: 'dark' }
      });
      
      const tenant2 = await saas.run.createTenant({
        name: 'Beta Inc',
        plan: 'free',
        settings: { theme: 'light' }
      });
      
      // 2. Store tenant-specific data
      const ctx1 = { tenantId: tenant1.id };
      const ctx2 = { tenantId: tenant2.id };
      
      await saas.resources.data.set({
        key: 'config',
        value: { apiKey: 'acme-key-123' }
      }, ctx1);
      
      await saas.resources.data.set({
        key: 'config',
        value: { apiKey: 'beta-key-456' }
      }, ctx2);
      
      // 3. Verify data isolation
      const acmeConfig = await saas.resources.data.get({ key: 'config' }, ctx1);
      const betaConfig = await saas.resources.data.get({ key: 'config' }, ctx2);
      
      assert.equal(acmeConfig.value.apiKey, 'acme-key-123');
      assert.equal(betaConfig.value.apiKey, 'beta-key-456');
      
      // 4. Register webhooks
      await saas.resources.webhooks.register({
        url: 'https://acme.com/webhook',
        events: ['data.created', 'data.updated']
      }, ctx1);
      
      // 5. Trigger webhook
      const triggered = await saas.resources.webhooks.trigger({
        event: 'data.created',
        payload: { key: 'newData', value: 'test' }
      }, ctx1);
      
      assert.equal(triggered.triggered, 1);
      
      // 6. Check usage
      const usage1 = await saas.run.getUsage({ tenantId: tenant1.id });
      assert.ok(usage1.apiCalls > 0);
      
      // 7. Test tenant validation
      await assert.rejects(
        saas.resources.data.get({ key: 'config' }, { tenantId: 'invalid' }),
        /Invalid tenant/
      );
      
      // 8. Test missing tenant context
      await assert.rejects(
        saas.resources.data.get({ key: 'config' }, {}),
        /Tenant context required/
      );
    });
  });

  describe('Real-time Collaboration System', () => {
    it('should implement collaborative document editing', async () => {
      const collab = new Api({
        name: 'collab-docs',
        version: '1.0.0'
      });

      // Document storage
      const documents = new Map();
      const documentVersions = new Map();
      const activeSessions = new Map();
      
      // Operational Transform for conflict resolution
      const otPlugin = {
        name: 'operational-transform',
        install: ({ api }) => {
          api.implement('transform', ({ params }) => {
            const { op1, op2 } = params;
            
            // Simplified OT - in real app would be more complex
            if (op1.type === 'insert' && op2.type === 'insert') {
              if (op1.position < op2.position) {
                return {
                  op1: op1,
                  op2: { ...op2, position: op2.position + op1.text.length }
                };
              } else {
                return {
                  op1: { ...op1, position: op1.position + op2.text.length },
                  op2: op2
                };
              }
            }
            
            return { op1, op2 };
          });
        }
      };
      
      collab.use(otPlugin);

      // Document resource
      collab.addResource('documents', {}, {
        implementers: {
          create: ({ params }) => {
            const doc = {
              id: `doc-${Date.now()}`,
              title: params.title,
              content: params.content || '',
              owner: params.owner,
              collaborators: [params.owner],
              version: 1,
              createdAt: new Date(),
              updatedAt: new Date()
            };
            
            documents.set(doc.id, doc);
            documentVersions.set(doc.id, [{
              version: 1,
              content: doc.content,
              timestamp: doc.createdAt,
              author: doc.owner
            }]);
            
            return doc;
          },
          
          get: ({ params }) => {
            const doc = documents.get(params.id);
            if (!doc) throw new Error('Document not found');
            return doc;
          },
          
          update: async ({ params, api }) => {
            const doc = documents.get(params.documentId);
            if (!doc) throw new Error('Document not found');
            
            // Apply operation
            const operation = params.operation;
            let newContent = doc.content;
            
            if (operation.type === 'insert') {
              newContent = 
                newContent.slice(0, operation.position) +
                operation.text +
                newContent.slice(operation.position);
            } else if (operation.type === 'delete') {
              newContent = 
                newContent.slice(0, operation.position) +
                newContent.slice(operation.position + operation.length);
            }
            
            // Save new version
            doc.content = newContent;
            doc.version++;
            doc.updatedAt = new Date();
            
            const versions = documentVersions.get(params.documentId);
            versions.push({
              version: doc.version,
              content: newContent,
              operation: operation,
              timestamp: doc.updatedAt,
              author: params.author
            });
            
            // Notify collaborators
            await api.runHooks('document:updated', {
              documentId: params.documentId,
              operation: operation,
              version: doc.version,
              author: params.author
            });
            
            return doc;
          },
          
          getVersions: ({ params }) => {
            return documentVersions.get(params.documentId) || [];
          },
          
          revert: ({ params }) => {
            const doc = documents.get(params.documentId);
            if (!doc) throw new Error('Document not found');
            
            const versions = documentVersions.get(params.documentId);
            const targetVersion = versions.find(v => v.version === params.toVersion);
            
            if (!targetVersion) throw new Error('Version not found');
            
            doc.content = targetVersion.content;
            doc.version++;
            doc.updatedAt = new Date();
            
            versions.push({
              version: doc.version,
              content: targetVersion.content,
              operation: { type: 'revert', toVersion: params.toVersion },
              timestamp: doc.updatedAt,
              author: params.author
            });
            
            return doc;
          }
        },
        
        hooks: {
          'document:updated': ({ documentId, operation, version, author }) => {
            // Broadcast to active sessions
            const sessions = activeSessions.get(documentId) || [];
            console.log(`Broadcasting update to ${sessions.length} active sessions`);
          }
        }
      });

      // Session management
      collab.addResource('sessions', {}, {
        implementers: {
          join: ({ params }) => {
            const doc = documents.get(params.documentId);
            if (!doc) throw new Error('Document not found');
            
            const session = {
              id: `session-${Date.now()}-${Math.random()}`,
              documentId: params.documentId,
              user: params.user,
              cursor: 0,
              selection: null,
              joinedAt: new Date()
            };
            
            const sessions = activeSessions.get(params.documentId) || [];
            sessions.push(session);
            activeSessions.set(params.documentId, sessions);
            
            return {
              session,
              document: doc,
              activePeers: sessions.length - 1
            };
          },
          
          leave: ({ params }) => {
            const sessions = activeSessions.get(params.documentId) || [];
            const index = sessions.findIndex(s => s.id === params.sessionId);
            
            if (index !== -1) {
              sessions.splice(index, 1);
              return { left: true };
            }
            
            return { left: false };
          },
          
          updateCursor: ({ params }) => {
            const sessions = activeSessions.get(params.documentId) || [];
            const session = sessions.find(s => s.id === params.sessionId);
            
            if (session) {
              session.cursor = params.cursor;
              session.selection = params.selection;
              return session;
            }
            
            throw new Error('Session not found');
          }
        }
      });

      // Conflict resolution
      collab.implement('resolveConflict', async ({ params, api }) => {
        const { documentId, localOp, remoteOp } = params;
        
        // Transform operations
        const transformed = await api.run.transform({
          op1: localOp,
          op2: remoteOp
        });
        
        // Apply both operations in order
        await api.resources.documents.update({
          documentId,
          operation: transformed.op2,
          author: remoteOp.author
        });
        
        await api.resources.documents.update({
          documentId,
          operation: transformed.op1,
          author: localOp.author
        });
        
        return { resolved: true, transformed };
      });

      // Test collaboration flow
      
      // 1. Create document
      const doc = await collab.resources.documents.create({
        title: 'Collaborative Document',
        content: 'Initial content.',
        owner: 'alice@example.com'
      });
      
      // 2. Multiple users join
      const aliceSession = await collab.resources.sessions.join({
        documentId: doc.id,
        user: 'alice@example.com'
      });
      
      const bobSession = await collab.resources.sessions.join({
        documentId: doc.id,
        user: 'bob@example.com'
      });
      
      assert.equal(bobSession.activePeers, 1);
      
      // 3. Concurrent edits
      const aliceEdit = {
        type: 'insert',
        position: 0,
        text: 'Hello! '
      };
      
      const bobEdit = {
        type: 'insert',
        position: 16, // After "Initial content."
        text: ' More text.'
      };
      
      // 4. Resolve conflict
      await collab.run.resolveConflict({
        documentId: doc.id,
        localOp: { ...aliceEdit, author: 'alice@example.com' },
        remoteOp: { ...bobEdit, author: 'bob@example.com' }
      });
      
      // 5. Check result
      const updated = await collab.resources.documents.get({ id: doc.id });
      assert.equal(updated.content, 'Hello! Initial content. More text.');
      assert.equal(updated.version, 3); // Two edits applied
      
      // 6. Get version history
      const versions = await collab.resources.documents.getVersions({ 
        documentId: doc.id 
      });
      assert.equal(versions.length, 3);
      
      // 7. Revert to previous version
      await collab.resources.documents.revert({
        documentId: doc.id,
        toVersion: 1,
        author: 'alice@example.com'
      });
      
      const reverted = await collab.resources.documents.get({ id: doc.id });
      assert.equal(reverted.content, 'Initial content.');
      
      // 8. Leave sessions
      await collab.resources.sessions.leave({
        documentId: doc.id,
        sessionId: aliceSession.session.id
      });
      
      await collab.resources.sessions.leave({
        documentId: doc.id,
        sessionId: bobSession.session.id
      });
      
      const remainingSessions = activeSessions.get(doc.id) || [];
      assert.equal(remainingSessions.length, 0);
    });
  });
});