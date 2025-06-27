export const RestApiPlugin = {
  name: 'rest-api',

  /*
  static get sortableFields () { return [] }
  static get defaultSort () { return null } // If set, it will be applied to all getQuery calls
  static get insertSchema () { return null }
  static get updateSchema () { return null }
  static get schema () { return null }
  static get searchSchema () { return null } // If not set, worked out from `schema` by constructor
  static get handlePut () { return false }
  static get handlePost () { return false }
  static get handleGet () { return false }
  static get handleGetQuery () { return false }
  static get handleDelete () { return false }
  static get defaultLimitOnQueries () { return 1000 } //  Max number of records returned by default
  static get idProperty () { return null } // If not set, taken as last item of paramIds)
  */

  install({ helpers, addScopeMethod, vars, addHook, apiOptions, pluginOptions }) {
    // Define default storage helpers that throw errors
    helpers.dataGet = async ({ id, scopeName }) => {
      throw new Error(`No storage implementation for get. Install a storage plugin.`);
    };
    
    helpers.dataQuery = async ({ params, scopeName }) => {
      throw new Error(`No storage implementation for query. Install a storage plugin.`);
    };
    
    helpers.dataCreate = async ({ data, scopeName }) => {
      throw new Error(`No storage implementation for create. Install a storage plugin.`);
    };
    
    helpers.dataUpdate = async ({ id, data, scopeName }) => {
      throw new Error(`No storage implementation for update. Install a storage plugin.`);
    };
    
    helpers.dataDelete = async ({ id, scopeName }) => {
      throw new Error(`No storage implementation for delete. Install a storage plugin.`);
    };

    helpers.checkPermissions = async ({ id, scopeName }) => {
      throw new Error(`No storage implementation for checkPermissions. Install a storage plugin.`);
    };
    
    // Add REST API methods as resource methods
    addScopeMethod('get', async ({ params, context, vars, helpers, scopes, runHooks, apiOptions, pluginOptions, scopeOptions, scopeName }) => {

      if (!resource) throw new Error('Must run with a resource (api.resources.someResource.get)')

      const hookContext = {
        method: 'get',
        id: params.id,
        result: null,
        errors: [],
        // TODO: HOW ABOUT THESE?
        includes: params.include,
      };

      await runHooks('before-validation', hookContext, scopeName);
      // TODO: Use jsonrestapi-schema to check the schema
      await runHooks('after-validation', hookContext, scopeName);
    
      await runHooks('before-check-permissions', hookContext, scopeName);
      hookContext.result = await helpers.checkPermissions({ id: params.id, scopeName });
      await runHooks('after-check-permissions', hookContext, scopeName);
    

      await runHooks('before-get', hookContext, scopeName); 
      hookContext.result = await helpers.dataGet({ id: params.id, scopeName });
      await runHooks('after-get', hookContext, scopeName);       

      await runHooks('transform:result', hookContext, scopeName);
      
      // TODO: convert to jsonrestapi

      return hookContext.result;
    });
    
    addScopeMethod('query', async ({ params, context, vars, helpers, scopes, runHooks, apiOptions, pluginOptions, scopeOptions, scopeName }) => {

      if (!resource) throw new Error('Must run with a resource (api.resources.someResource.get)')

      const hookContext = {
        method: 'query',
        resource,
        params,
        results: [],
        meta: {},
        errors: []
      };
      
      // Validate pagination
      if (params.page) {
        if (params.page.size !== undefined) {
          const pageSize = parseInt(params.page.size, 10);
          if (isNaN(pageSize) || pageSize < 1) {
            throw new Error('Page size must be a positive integer');
          }
          params.page.size = pageSize;
        }
        
        if (params.page.number !== undefined) {
          const pageNumber = parseInt(params.page.number, 10);
          if (isNaN(pageNumber) || pageNumber < 1) {
            throw new Error('Page number must be a positive integer');
          }
          params.page.number = pageNumber;
        }
      }
      
      // Run hooks
      await runHooks('before:query', hookContext, scopeName);
      await runHooks('before:operation', hookContext, scopeName);
      
      // Call the storage helper
      const queryResult = await helpers.dataQuery({ params, scopeName });
      hookContext.results = queryResult.results || [];
      hookContext.meta = queryResult.meta || {};
      
      // Run after hooks
      await runHooks('after:operation', hookContext, scopeName);
      await runHooks('after:query', hookContext, scopeName);
      
      // Process each result through get hooks if enabled
      if (params.runGetHooksOnQuery !== false) {
        for (let i = 0; i < hookContext.results.length; i++) {
          const getContext = {
            method: 'get',
            id: hookContext.results[i].id,
            resource,
            params: { ...params, isQueryResult: true },
            result: hookContext.results[i]
          };
          await runHooks('after:get', getContext, scopeName);
          hookContext.results[i] = getContext.result;
        }
      }
      
      // Transform results
      for (let i = 0; i < hookContext.results.length; i++) {
        const itemContext = { ...hookContext, result: hookContext.results[i] };
        await runHooks('transform:result', itemContext, scopeName);
        hookContext.results[i] = itemContext.result;
      }
      
      return {
        data: hookContext.results,
        meta: hookContext.meta
      };
    });
    
    addScopeMethod('create', async ({ params, context, vars, helpers, scopes, runHooks, apiOptions, pluginOptions, scopeOptions, scopeName }) => {
      const hookContext = {
        method: 'create',
        resource,
        data: params.data,
        params,
        result: null,
        errors: []
      };
      
      // Validation hooks
      await runHooks('before:validate', hookContext, scopeName);
      await runHooks('validate:create', hookContext, scopeName);
      await runHooks('after:validate', hookContext, scopeName);
      
      if (hookContext.errors.length > 0) {
        const error = new Error('Validation failed');
        error.errors = hookContext.errors;
        throw error;
      }
      
      // Run hooks
      await runHooks('before:create', hookContext, scopeName);
      await runHooks('before:operation', hookContext, scopeName);
      
      // Call the storage helper
      hookContext.result = await helpers.dataCreate({ data: hookContext.data, scopeName });
      
      // Run after hooks
      await runHooks('after:operation', hookContext, scopeName);
      await runHooks('after:create', hookContext, scopeName);
      await runHooks('transform:result', hookContext, scopeName);
      
      return hookContext.result;
    });
    
    addScopeMethod('update', async ({ params, context, vars, helpers, scopes, runHooks, apiOptions, pluginOptions, scopeOptions, scopeName }) => {
      const hookContext = {
        method: 'update',
        id: params.id,
        resource,
        data: params.data,
        params,
        result: null,
        errors: []
      };
      
      // Validation hooks
      await runHooks('before:validate', hookContext, scopeName);
      await runHooks('validate:update', hookContext, scopeName);
      await runHooks('after:validate', hookContext, scopeName);
      
      if (hookContext.errors.length > 0) {
        const error = new Error('Validation failed');
        error.errors = hookContext.errors;
        throw error;
      }
      
      // Run hooks
      await runHooks('before:update', hookContext, scopeName);
      await runHooks('before:operation', hookContext, scopeName);
      
      // Call the storage helper
      hookContext.result = await helpers.dataUpdate({ id: hookContext.id, data: hookContext.data, scopeName });
      
      // Run after hooks
      await runHooks('after:operation', hookContext, scopeName);
      await runHooks('after:update', hookContext, scopeName);
      await runHooks('transform:result', hookContext, scopeName);
      
      return hookContext.result;
    });
    
    addScopeMethod('delete', async ({ params, context, vars, helpers, scopes, runHooks, apiOptions, pluginOptions, scopeOptions, scopeName }) => {
      const hookContext = {
        method: 'delete',
        id: params.id,
        params,
        result: null,
        errors: []
      };
      
      // Run hooks
      await runHooks('before:delete', hookContext, scopeName);
      await runHooks('before:operation', hookContext, scopeName);
      
      // Call the storage helper
      await helpers.dataDelete({ id: hookContext.id, scopeName });
      
      // Run after hooks
      await runHooks('after:operation', hookContext, scopeName);
      await runHooks('after:delete', hookContext, scopeName);
      

      // Format data in JSON:API
      return { data: null };
    });
    
    // Add convenience methods that map to the resource methods
    addScopeMethod('list', async ({ params, context, vars, helpers, scopes, runHooks, apiOptions, pluginOptions, scopeOptions, scopeName }) => {
      // 'list' is an alias for 'query'
      // We need to call the query method on the same resource
      return await resource.query(params);
    });
    
    // Add hooks for field validation, security, etc.
    addHook('validate:fields', 'validateFields', ({ context, vars, helpers, scopes, runHooks, apiOptions, pluginOptions, scopeOptions, scopeName }) => {
      // Field validation logic would go here
      // This is where you'd check field access permissions, etc.
    });
        
    // Add REST API configuration
    vars.restDefaults = {
      pageSize: pluginOptions['rest-api']?.pageSize || 20,
      maxPageSize: pluginOptions['rest-api']?.maxPageSize || 100,
      idProperty: pluginOptions['rest-api']?.idProperty || 'id'
    };
  }
};