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

  install({ api, options }) {
    // Define default storage helpers that throw errors
    api.helpers.dataGet = async ({ id, resource }) => {
      throw new Error(`No storage implementation for get. Install a storage plugin.`);
    };
    
    api.helpers.dataQuery = async ({ params, resource }) => {
      throw new Error(`No storage implementation for query. Install a storage plugin.`);
    };
    
    api.helpers.dataCreate = async ({ data, resource }) => {
      throw new Error(`No storage implementation for create. Install a storage plugin.`);
    };
    
    api.helpers.dataUpdate = async ({ id, data, resource }) => {
      throw new Error(`No storage implementation for update. Install a storage plugin.`);
    };
    
    api.helpers.dataDelete = async ({ id, resource }) => {
      throw new Error(`No storage implementation for delete. Install a storage plugin.`);
    };

    api.helpers.checkPermissions = async ({ id, resource }) => {
      throw new Error(`No storage implementation for checkPermissions. Install a storage plugin.`);
    };
    
    // Add REST API methods as implementers
    api.implement('get', async ({ params, api, resource }) => {

      if (!resource) throw new Error('Must run with a resource (api.resources.someResource.get)')

      const context = {
        method: 'get',
        id: params.id,
        result: null,
        errors: [],
        // TODO: HOW ABOUT THESE?
        includes: params.include,
      };

      await api.runHooks('before-validation', context, resource);
      // TODO: Use jsonrestapi-schema to check the schema
      await api.runHooks('after-validation', context, resource);
    
      await api.runHooks('before-check-permissions', context, resource);
      context.result = await api.helpers.checkPermissions({ id: params.id, resource });
      await api.runHooks('after-check-permissions', context, resource);
    

      await api.runHooks('before-get', context, resource); 
      context.result = await api.helpers.dataGet({ id: params.id, resource });
      await api.runHooks('after-get', context, resource);       

      await api.runHooks('transform:result', context, resource);
      
      // TODO: convert to jsonrestapi

      return context.result;
    });
    
    api.implement('query', async ({ params, api, resource }) => {

      if (!resource) throw new Error('Must run with a resource (api.resources.someResource.get)')

      const context = {
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
      await api.runHooks('before:query', context, resource);
      await api.runHooks('before:operation', context, resource);
      
      // Call the storage helper
      const queryResult = await api.helpers.dataQuery({ params, resource });
      context.results = queryResult.results || [];
      context.meta = queryResult.meta || {};
      
      // Run after hooks
      await api.runHooks('after:operation', context, resource);
      await api.runHooks('after:query', context, resource);
      
      // Process each result through get hooks if enabled
      if (params.runGetHooksOnQuery !== false) {
        for (let i = 0; i < context.results.length; i++) {
          const getContext = {
            method: 'get',
            id: context.results[i].id,
            resource,
            params: { ...params, isQueryResult: true },
            result: context.results[i]
          };
          await api.runHooks('after:get', getContext, resource);
          context.results[i] = getContext.result;
        }
      }
      
      // Transform results
      for (let i = 0; i < context.results.length; i++) {
        const itemContext = { ...context, result: context.results[i] };
        await api.runHooks('transform:result', itemContext, resource);
        context.results[i] = itemContext.result;
      }
      
      return {
        data: context.results,
        meta: context.meta
      };
    });
    
    api.implement('create', async ({ params, api, resource }) => {
      const context = {
        method: 'create',
        resource,
        data: params.data,
        params,
        result: null,
        errors: []
      };
      
      // Validation hooks
      await api.runHooks('before:validate', context, resource);
      await api.runHooks('validate:create', context, resource);
      await api.runHooks('after:validate', context, resource);
      
      if (context.errors.length > 0) {
        const error = new Error('Validation failed');
        error.errors = context.errors;
        throw error;
      }
      
      // Run hooks
      await api.runHooks('before:create', context, resource);
      await api.runHooks('before:operation', context, resource);
      
      // Call the storage helper
      context.result = await api.helpers.dataCreate({ data: context.data, resource });
      
      // Run after hooks
      await api.runHooks('after:operation', context, resource);
      await api.runHooks('after:create', context, resource);
      await api.runHooks('transform:result', context, resource);
      
      return context.result;
    });
    
    api.implement('update', async ({ params, api, resource }) => {
      const context = {
        method: 'update',
        id: params.id,
        resource,
        data: params.data,
        params,
        result: null,
        errors: []
      };
      
      // Validation hooks
      await api.runHooks('before:validate', context, resource);
      await api.runHooks('validate:update', context, resource);
      await api.runHooks('after:validate', context, resource);
      
      if (context.errors.length > 0) {
        const error = new Error('Validation failed');
        error.errors = context.errors;
        throw error;
      }
      
      // Run hooks
      await api.runHooks('before:update', context, resource);
      await api.runHooks('before:operation', context, resource);
      
      // Call the storage helper
      context.result = await api.helpers.dataUpdate({ id: context.id, data: context.data, resource });
      
      // Run after hooks
      await api.runHooks('after:operation', context, resource);
      await api.runHooks('after:update', context, resource);
      await api.runHooks('transform:result', context, resource);
      
      return context.result;
    });
    
    api.implement('delete', async ({ params, api, resource }) => {
      const context = {
        method: 'delete',
        id: params.id,
        params,
        result: null,
        errors: []
      };
      
      // Run hooks
      await api.runHooks('before:delete', context, resource);
      await api.runHooks('before:operation', context, resource);
      
      // Call the storage helper
      await api.helpers.dataDelete({ id: context.id, resource });
      
      // Run after hooks
      await api.runHooks('after:operation', context, resource);
      await api.runHooks('after:delete', context, resource);
      

      // Format data in JSON:API
      return { data: null };
    });
    
    // Add convenience methods that map to the implementers
    api.implement('list', async ({ params, api, resource }) => {
      // 'list' is an alias for 'query'
      return await api.run.query(params);
    });
    
    // Add hooks for field validation, security, etc.
    api.addHook('validate:fields', 'validateFields', ({ context, api, resource }) => {
      // Field validation logic would go here
      // This is where you'd check field access permissions, etc.
    });
    
    
    });
    
    // Add REST API configuration
    api.vars.restDefaults = {
      pageSize: options.pageSize || 20,
      maxPageSize: options.maxPageSize || 100,
      idProperty: options.idProperty || 'id'
    };
  }
};

