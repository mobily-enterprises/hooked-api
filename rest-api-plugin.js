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

  install({ helpers, addResourceMethod, vars, addHook, apiOptions, pluginOptions }) {
    // Define default storage helpers that throw errors
    helpers.dataGet = async ({ id, resource }) => {
      throw new Error(`No storage implementation for get. Install a storage plugin.`);
    };
    
    helpers.dataQuery = async ({ params, resource }) => {
      throw new Error(`No storage implementation for query. Install a storage plugin.`);
    };
    
    helpers.dataCreate = async ({ data, resource }) => {
      throw new Error(`No storage implementation for create. Install a storage plugin.`);
    };
    
    helpers.dataUpdate = async ({ id, data, resource }) => {
      throw new Error(`No storage implementation for update. Install a storage plugin.`);
    };
    
    helpers.dataDelete = async ({ id, resource }) => {
      throw new Error(`No storage implementation for delete. Install a storage plugin.`);
    };

    helpers.checkPermissions = async ({ id, resource }) => {
      throw new Error(`No storage implementation for checkPermissions. Install a storage plugin.`);
    };
    
    // Add REST API methods as resource methods
    addResourceMethod('get', async ({ params, context, vars, helpers, resources, runHooks, apiOptions, pluginOptions, resourceOptions, resource }) => {

      if (!resource) throw new Error('Must run with a resource (api.resources.someResource.get)')

      const hookContext = {
        method: 'get',
        id: params.id,
        result: null,
        errors: [],
        // TODO: HOW ABOUT THESE?
        includes: params.include,
      };

      await runHooks('before-validation', hookContext, resource);
      // TODO: Use jsonrestapi-schema to check the schema
      await runHooks('after-validation', hookContext, resource);
    
      await runHooks('before-check-permissions', hookContext, resource);
      hookContext.result = await helpers.checkPermissions({ id: params.id, resource });
      await runHooks('after-check-permissions', hookContext, resource);
    

      await runHooks('before-get', hookContext, resource); 
      hookContext.result = await helpers.dataGet({ id: params.id, resource });
      await runHooks('after-get', hookContext, resource);       

      await runHooks('transform:result', hookContext, resource);
      
      // TODO: convert to jsonrestapi

      return hookContext.result;
    });
    
    addResourceMethod('query', async ({ params, context, vars, helpers, resources, runHooks, apiOptions, pluginOptions, resourceOptions, resource }) => {

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
      await runHooks('before:query', hookContext, resource);
      await runHooks('before:operation', hookContext, resource);
      
      // Call the storage helper
      const queryResult = await helpers.dataQuery({ params, resource });
      hookContext.results = queryResult.results || [];
      hookContext.meta = queryResult.meta || {};
      
      // Run after hooks
      await runHooks('after:operation', hookContext, resource);
      await runHooks('after:query', hookContext, resource);
      
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
          await runHooks('after:get', getContext, resource);
          hookContext.results[i] = getContext.result;
        }
      }
      
      // Transform results
      for (let i = 0; i < hookContext.results.length; i++) {
        const itemContext = { ...hookContext, result: hookContext.results[i] };
        await runHooks('transform:result', itemContext, resource);
        hookContext.results[i] = itemContext.result;
      }
      
      return {
        data: hookContext.results,
        meta: hookContext.meta
      };
    });
    
    addResourceMethod('create', async ({ params, context, vars, helpers, resources, runHooks, apiOptions, pluginOptions, resourceOptions, resource }) => {
      const hookContext = {
        method: 'create',
        resource,
        data: params.data,
        params,
        result: null,
        errors: []
      };
      
      // Validation hooks
      await runHooks('before:validate', hookContext, resource);
      await runHooks('validate:create', hookContext, resource);
      await runHooks('after:validate', hookContext, resource);
      
      if (hookContext.errors.length > 0) {
        const error = new Error('Validation failed');
        error.errors = hookContext.errors;
        throw error;
      }
      
      // Run hooks
      await runHooks('before:create', hookContext, resource);
      await runHooks('before:operation', hookContext, resource);
      
      // Call the storage helper
      hookContext.result = await helpers.dataCreate({ data: hookContext.data, resource });
      
      // Run after hooks
      await runHooks('after:operation', hookContext, resource);
      await runHooks('after:create', hookContext, resource);
      await runHooks('transform:result', hookContext, resource);
      
      return hookContext.result;
    });
    
    addResourceMethod('update', async ({ params, context, vars, helpers, resources, runHooks, apiOptions, pluginOptions, resourceOptions, resource }) => {
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
      await runHooks('before:validate', hookContext, resource);
      await runHooks('validate:update', hookContext, resource);
      await runHooks('after:validate', hookContext, resource);
      
      if (hookContext.errors.length > 0) {
        const error = new Error('Validation failed');
        error.errors = hookContext.errors;
        throw error;
      }
      
      // Run hooks
      await runHooks('before:update', hookContext, resource);
      await runHooks('before:operation', hookContext, resource);
      
      // Call the storage helper
      hookContext.result = await helpers.dataUpdate({ id: hookContext.id, data: hookContext.data, resource });
      
      // Run after hooks
      await runHooks('after:operation', hookContext, resource);
      await runHooks('after:update', hookContext, resource);
      await runHooks('transform:result', hookContext, resource);
      
      return hookContext.result;
    });
    
    addResourceMethod('delete', async ({ params, context, vars, helpers, resources, runHooks, apiOptions, pluginOptions, resourceOptions, resource }) => {
      const hookContext = {
        method: 'delete',
        id: params.id,
        params,
        result: null,
        errors: []
      };
      
      // Run hooks
      await runHooks('before:delete', hookContext, resource);
      await runHooks('before:operation', hookContext, resource);
      
      // Call the storage helper
      await helpers.dataDelete({ id: hookContext.id, resource });
      
      // Run after hooks
      await runHooks('after:operation', hookContext, resource);
      await runHooks('after:delete', hookContext, resource);
      

      // Format data in JSON:API
      return { data: null };
    });
    
    // Add convenience methods that map to the resource methods
    addResourceMethod('list', async ({ params, context, vars, helpers, resources, runHooks, apiOptions, pluginOptions, resourceOptions, resource }) => {
      // 'list' is an alias for 'query'
      // We need to call the query method on the same resource
      return await resource.query(params);
    });
    
    // Add hooks for field validation, security, etc.
    addHook('validate:fields', 'validateFields', ({ context, vars, helpers, resources, runHooks, apiOptions, pluginOptions, resourceOptions, resource }) => {
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