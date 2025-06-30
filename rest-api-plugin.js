import CreateSchema from 'json-rest-api-schema'
import { validateGetPayload, validateGetPayload } from './payloadValdators';

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


    /**
     * Retrieves a single resource by its type and ID.
     * @param {string} resourceType - The type of resource to fetch (e.g., "articles").
     * @param {(string|number)} id - The unique ID of the resource to fetch.
     * @param {object} [queryParams={}] - Optional. An object to customize the query.
     * @param {string} [queryParams.include] - A comma-separated string of relationship paths to sideload (e.g., "authors,publisher").
     * @param {object} [queryParams.fields] - An object to request only specific fields (sparse fieldsets). Keys are resource types, values are comma-separated field names.
     * @returns {Promise<object>} A Promise that resolves to the JSON:API response document.
     *
     * @example
     * // Example 1: Get a single article with its to-one 'author' relationship
     * const articleResponse = await api.get('articles', '123', {
     * include: 'author',
     * fields: {
     * articles: 'title,body,published-date',
     * people: 'name'
     * }
     * });
     * @see GET /api/articles/123?include=author&fields[articles]=title,body,published-date&fields[people]=name
     * // Example Return Value for articleResponse:
     * // {
     * //   "links": { "self": "/api/articles/123" },
     * //   "data": {
     * //     "type": "articles",
     * //     "id": "123",
     * //     "attributes": {
     * //       "title": "JSON:API paints my bikeshed!",
     * //       "body": "The shortest article. Ever.",
     * //       "published-date": "2015-05-22T14:56:29.000Z"
     * //     },
     * //     "relationships": {
     * //       "author": { "data": { "type": "people", "id": "9" } }
     * //     }
     * //   },
     * //   "included": [
     * //     { "type": "people", "id": "9", "attributes": { "name": "John Doe" } }
     * //   ]
     * // }
     *
     * @example
     * // Example 2: Get a single article with deep, multi-level relationships
     * const complexArticle = await api.get('articles', '1', {
     * // Include authors and their aliases, AND the publisher and its country
     * include: 'authors.aliases,publisher.country',
     * // Specify exact fields for each type to keep the response lean
     * fields: {
     * articles: 'title',
     * people: 'name',
     * aliases: 'pen-name',
     * publishers: 'name',
     * countries: 'iso-code'
     * }
     * });
     * @see GET /api/articles/1?include=authors.aliases,publisher.country&fields[articles]=title&fields[people]=name&fields[aliases]=pen-name&fields[publishers]=name&fields[countries]=iso-code
     * // Example Return Value for complexArticle:
     * // {
     * //   "data": {
     * //     "type": "articles",
     * //     "id": "1",
     * //     "attributes": { "title": "Advanced API Design" },
     * //     "relationships": {
     * //       "authors": {
     * //         "data": [ { "type": "people", "id": "9" } ]
     * //       },
     * //       "publisher": {
     * //         "data": { "type": "publishers", "id": "pub-1" }
     * //       }
     * //     }
     * //   },
     * //   "included": [
     * //     {
     * //       "type": "people", "id": "9", "attributes": { "name": "John Doe" },
     * //       "relationships": {
     * //         "aliases": {
     * //           "data": [ { "type": "aliases", "id": "alias-jd" } ]
     * //         }
     * //       }
     * //     },
     * //     {
     * //       "type": "aliases", "id": "alias-jd", "attributes": { "pen-name": "JD" }
     * //     },
     * //     {
     * //       "type": "publishers", "id": "pub-1", "attributes": { "name": "Awesome Books Inc." },
     * //       "relationships": {
     * //         "country": {
     * //           "data": { "type": "countries", "id": 1 }
     * //         }
     * //       }
     * //     },
     * //     {
     * //       "type": "countries", "id": 1, "attributes": { "iso-code": "US" }
     * //     }
     * //   ]
     * // }
     */
    addScopeMethod('query', async ({ params, context, vars, helpers, scopes, runHooks, apiOptions, pluginOptions, scopeOptions, scopeName }) => {
      // Implementation would serialize queryParams into a URL query string
      // and make a `fetch` call to /api/{resourceName}.
      console.log(`GET /api/${scopeName}`, { queryParams });
      return Promise.resolve({});
    })


    /**
   * Retrieves a single resource by its type and ID.
   * @param {(string|number)} id - The unique ID of the resource to fetch.
   * @param {object} [queryParams={}] - Optional. An object to customize the query.
   * @param {string} [queryParams.include] - A comma-separated string of relationship paths to sideload (e.g., "authors,publisher").
   * @param {object} [queryParams.fields] - An object to request only specific fields (sparse fieldsets). Keys are resource types, values are comma-separated field names.
   * @returns {Promise<object>} A Promise that resolves to the JSON:API response document.
   *
   * @example
   * // Example 1: Get a single article with its to-one 'author' relationship
   * const articleResponse = await api.get('articles', '123', {
   *   include: 'author',
   *   fields: {
   *     articles: 'title,body,published-date',
   *     people: 'name'
   *   }
   * });
   * @see GET /api/articles/123?include=author&fields[articles]=title,body,published-date&fields[people]=name
   * // Example Return Value for articleResponse:
   * // {
   * //   "links": { "self": "/api/articles/123" },
   * //   "data": {
   * //     "type": "articles", "id": "123",
   * //     "attributes": { "title": "...", "body": "...", "published-date": "..." },
   * //     "relationships": { "author": { "data": { "type": "people", "id": "9" } } }
   * //   },
   * //   "included": [{ "type": "people", "id": "9", "attributes": { "name": "John Doe" } }]
   * // }
   *
   * @example
   * // Example 2: Get a single article with both to-many 'authors' and to-one 'publisher'
   * const complexArticle = await api.get('articles', '123', {
   * include: 'authors,publisher',
   *   fields: {
   *     articles: 'title',
   *     people: 'name',
   *     publishers: 'name,country-code'
   *   }
   * });
   * @see GET /api/articles/123?include=authors,publisher&fields[articles]=title&fields[people]=name&fields[publishers]=name,country-code
   * // Example Return Value for complexArticle:
   * // {
   * //   "links": { "self": "/api/articles/123" },
   * //   "data": {
   * //     "type": "articles",
   * //     "id": "123",
   * //     "attributes": { "title": "A Joint Effort" },
   * //     "relationships": {
   * //       "authors": {
   * //         "data": [
   * //           { "type": "people", "id": "9" },
   * //           { "type": "people", "id": "10" }
   * //         ]
   * //       },
   * //       "publisher": {
   * //         "data": { "type": "publishers", "id": "pub-1" }
   * //       }
   * //     }
   * //   },
   * //   "included": [
   * //     { "type": "people", "id": "9", "attributes": { "name": "John Doe" } },
   * //     { "type": "people", "id": "10", "attributes": { "name": "Richard Roe" } },
   * //     { "type": "publishers", "id": "pub-1", "attributes": { "name": "Awesome Books Inc.", "country-code": "US" } }
   * //   ]
   * // }
   */
    addScopeMethod('get', async ({ params, context, vars, helpers, scopes, runHooks, apiOptions, pluginOptions, scopeOptions, scopeName }) => {

      // Make the method available to all hooks
      context.method = 'get'

      // Sanitise parameters
      params.queryParams = params.queryParams || {}
      params.queryParams.include = params.queryParams.include || ''
      params.queryParams.fields = params.queryParams.fields || {}
      
      // Check payload
      validateGetPayload(params.queryParams);

      // Set the context
      context.schema = createSchema(params.schema)
      context.record = {}
      
      runHooks('checkPermissions')
      runHooks('checkPermissionsGet')
      
      runHooks('beforeData')
      runHooks('beforeDataGet')
      context.record = await helpers.dataGet({scopeName, schema: context.schema, id: params.id, queryParams: params.queryParams })
    
      // Implementation calls GET /api/{resourceName}
      console.log(`GET /api/${scopeName}/${params.id}`, params.queryParams );

      // Make a backup
      context.originalRecord = structuredClone(context.record)

      // This will enhance record, which is the WHOLE JSON:API record
      runHooks('enrichRecord')

      // Run enrichAttributes on the main attribute (will fire the hook `enrichAttributes`)
      context.record.data.attributes = await scope.enrichAttributes({attributes: context.record.data.attributes, parentContext: context})
      // ...TODO: Also do this for all items in context.record.included

      runHooks('finish')
      runHooks('finishGet')
      return context.record
    })

    addScopeMethod('enrichAttributes', async ({ params, context, vars, helpers, scope, scopes, runHooks, apiOptions, pluginOptions, scopeOptions, scopeName }) => {
      
      // This will make sure that when this method calls "runHooks", the hooks will have the same context as api.post()
      // although it will be a COPY 
      context.parentContext = params.parentContext
      context.attributes = params.attributes

      // Hooks will receive enrichRecord's context as context, and their jobs is to change context.record
      runHooks('enrichAttributes')

      return context.attributes
    })

    /**
     * Creates a new top-level resource. Can also create related resources in the same request.
     * This function sends a POST request to /api/{resourceType}.
     * @param {object} attributes - A key-value map of the resource's data.
     * @param {object} [relationships={}] - An optional object defining links to other resources. These can be existing resources or new resources defined in the `included` array.
     * @param {object[]} [included=[]] - An optional array of full resource objects to create and link in the same transaction. Each object needs a temporary, client-generated ID.
     * @returns {Promise<object>} A Promise that resolves to the JSON:API document containing the newly created resource.
     *
     * @example
     * // Case 1: Create a simple resource with only attributes.
     * const simpleArticle = await api.post('articles', {
     *   "title": "Standalone Post",
     *   "body": "This article has no relationships."
     * });
     * @see POST /api/articles
     * // Example Return Value for simpleArticle:
     * // {
     * //   "data": {
     * //     "type": "articles",
     * //     "id": "123",
     * //     "attributes": {
     * //       "title": "Standalone Post",
     * //       "body": "This article has no relationships."
     * //     }
     * //   }
     * // }
     *
     * @example
     * // Case 2: Create a resource and link it to MULTIPLE EXISTING relationships.
     * const linkedArticle = await api.post(
     *   'articles',
     *   { "title": "Post by an Existing Team" },
     *   {
     *     "authors": {
     *       "data": [
     *         { "type": "people", "id": "9" },
     *         { "type": "people", "id": "10" }
     *       ]
     *     },
     *     "publisher": {
     *       "data": { "type": "publishers", "id": "pub-1" }
     *     }
     *   }
     * );
     * @see POST /api/articles
     * // Example Return Value for linkedArticle:
     * // {
     * //   "data": {
     * //     "type": "articles",
     * //     "id": "124",
     * //     "attributes": { "title": "Post by an Existing Team" },
     * //     "relationships": {
     * //       "authors": {
     * //         "data": [
     * //           { "type": "people", "id": "9" },
     * //           { "type": "people", "id": "10" }
     * //         ]
     * //       },
     * //       "publisher": {
     * //         "data": { "type": "publishers", "id": "pub-1" }
     * //       }
     * //     }
     * //   }
     * // }
     * // There is NO 'included' because all related resources were already existing.
     *
     * @example
     * // Case 3: Create a resource AND MULTIPLE NEW related resources at the same time.
     *   const compoundArticle = await api.post(
     *     'articles',
     * 
     *     // Attributes
     *     { "title": "A New Team's First Post" },
     * 
     *     // Relationships
     *     {
     *       "authors": {
     *         "data": [
     *           { "type": "people", "id": "temp-author-1" },
     *           { "type": "people", "id": "temp-author-2" }
     *         ]
     *       },
     *       "publisher": {
     *         "data": { "type": "publishers", "id": "temp-pub-xyz" }
     *       }
     *     },
     *     // Included
     *     [
     *       { "type": "people", "id": "temp-author-1", "attributes": { "name": "Jane Doe" } },
     *       { "type": "people", "id": "temp-author-2", "attributes": { "name": "Richard Roe" } },
     *       { "type": "publishers", "id": "temp-pub-xyz", "attributes": { "name": "Awesome Books Inc." } }
     *     ]
     *   );
     * @see POST /api/articles
     * // Example Return Value for compoundArticle:
     * // {
     * //   "data": {
     * //     "type": "articles",
     * //     "id": "125",
     * //     "attributes": { ... },
     * //     "relationships": {
     * //       "authors": {
     * //         "data": [
     * //           { "type": "people", "id": "11" },
     * //           { "type": "people", "id": "12" }
     * //         ]
     * //       },
     * //       "publisher": {
     * //         "data": { "type": "publishers", "id": "55" }
     * //       }
     * //     }
     * //   },
     * //   "included": [
     * //     { "type": "people", "id": "11", "attributes": { "name": "Jane Doe" } },
     * //     { "type": "people", "id": "12", "attributes": { "name": "Richard Roe" } },
     * //     { "type": "publishers", "id": "55", "attributes": { "name": "Awesome Books Inc." } }
     * //   ]
     * // }
     *
     * @example
     * // Case 4: Create a resource and link to both NEW and EXISTING resources (Mixed Lookup).
     * const mixedArticle = await api.post(
     * 
     *   // Resource name
     *   'articles',
     * 
     *   // Attributes
     *   { "title": "A New Member Joins the Team" },
     *   {
     *     "authors": {
     *       "data": [
     *         { "type": "people", "id": "9" },             // Existing author
     *         { "type": "people", "id": "temp-author-3" }  // New author
     *       ]
     *     }
     *   },
     * 
     *   // Included
     *   [
     *     { "type": "people", "id": "temp-author-3", "attributes": { "name": "Sam Smith" } }
     *   ]
     * );
     * @see POST /api/articles
     */
    addScopeMethod('post', async ({ params, context, vars, helpers, scope, scopes, runHooks, apiOptions, pluginOptions, scopeOptions, scopeName }) => {

      // Make the method available to all hooks
      context.method = 'post'

      // Sanitise parameters
      params.attributes = params.attributes  || {}
      params.relationships = params.relationships  || {}
      params.included = params.included || []
      
      // Check payload
      validatePostPayload(params);

      // Set the context
      params.scopeName = scopeName
      context.schema = createSchema(params.schema)
      context.attributes = params.attributes
      context.record = {}
      
      runHooks('beforeSchemaValidate')
      runHooks('beforeSchemaValidatePost')
      context.schema.validate(context.attributes)
      runHooks('afterSchemaValidatePost')
      runHooks('afterSchemaValidate')

      runHooks('checkPermissions')
      runHooks('checkPermissionsPost')
      
      runHooks('beforeData')
      runHooks('beforeDataPost')
      context.record = await helpers.dataPost({
        scopeName,
        schema: context.schema,
        record: context.record,
        relationships: params.relationships,
        included: params.included
      });

      const changedRecord = await helpers.dataGet({
        scopeName,
        schema: context.schema,
        record: context.record,
        relationships: params.relationships,
        included: params.included
      });

      // Implementation calls POST /api/{resourceName}
      console.log(`POST /api/${scopeName}`, { data: { type: scopeName, attributes: params.attributes, relationships: params.relationships, included: params.included } });

      runHooks('finish')
      runHooks('finishPost')
      return context.record
    })

 /**
     * Updates an existing top-level resource by completely replacing it.
     * This function sends a PUT request to /api/{resourceType}/{id}.
     *
     * It's important to note that PUT is for *replacement* of the primary resource.
     * While you can update relationships by including their identifiers in the `relationships`
     * object of the primary resource, this method does NOT support creating new related
     * resources via an `included` array in the request body, unlike POST.
     *
     * To fetch related resources in the response, use the `include` query parameter.
     *
     * @param {string} resourceType - The type of the resource to update (e.g., 'articles').
     * @param {string} id - The ID of the resource to update.
     * @param {object} attributes - A key-value map of the resource's attributes to set.
     * These attributes will completely replace the existing attributes on the server.
     * @param {object} [relationships={}] - An optional object defining links to other EXISTING resources.
     * Each key is a relationship name, and its value is an object with a `data` property
     * containing a single resource identifier object or an array of resource identifier objects.
     * Example: `{ "author": { "data": { "type": "people", "id": "123" } } }`
     * @param {string[]} [include=[]] - An optional array of relationship paths to include
     * in the returned compound document. These paths will be appended to the URL as
     * `?include=path1,path2`. E.g., `['author', 'comments.user']`.
     * @returns {Promise<object>} A Promise that resolves to the JSON:API document
     * containing the updated resource, potentially with included related resources
     * if `include` was specified.
     *
     * @example
     * // Case 1: Update an article's attributes.
     * const updatedArticleAttributes = await api.put(
     *   'articles',
     *   '123',
     *   { "title": "My Updated Article", "body": "This is the new content." }
     * );
     * // Expected Return Value (example):
     * // {
     * //   "data": {
     * //     "type": "articles",
     * //     "id": "123",
     * //     "attributes": { "title": "My Updated Article", "body": "This is the new content." }
     * //   }
     * // }
     *
     * @example
     * // Case 2: Update an article's relationships (linking to existing author).
     * const updatedArticleRelationships = await api.put(
     *   'articles',
     *   '124',
     *   { "title": "Article with a New Author" },
     *   {
     *     "author": { "data": { "type": "people", "id": "456" } } // Link to existing author
     *   }
     * );
     * // Expected Return Value (example):
     * // {
     * //   "data": {
     * //     "type": "articles",
     * //     "id": "124",
     * //     "attributes": { "title": "Article with a New Author" },
     * //     "relationships": {
     * //       "author": { "data": { "type": "people", "id": "456" } }
     * //     }
     * //   }
     * // }
     *
     * @example
     * // Case 3: Update an article and get its author included in the response.
     * const updatedArticleWithAuthor = await api.put(
     *   'articles',
     *   '125',
     *   { "title": "Updated Article (with author)" },
     *   {}, // No relationship changes in this example
     *   ['author'] // Request to include the author in the response
     * );
     * // Expected Return Value (example):
     * // {
     * //   "data": {
     * //     "type": "articles",
     * //     "id": "125",
     * //     "attributes": { "title": "Updated Article (with author)" },
     * //     "relationships": {
     * //       "author": { "data": { "type": "people", "id": "789" } }
     * //     }
     * //   },
     * //   "included": [
     * //     { "type": "people", "id": "789", "attributes": { "name": "Jane Smith" } }
     * //   ]
     * // }
     */
    addScopeMethod('put', async ({ params, context, vars, helpers, scopes, runHooks, apiOptions, pluginOptions, scopeOptions, scopeName }) => {
      // Implementation calls PUT /api/{resourceName}/{id}
      console.log(`PUT /api/${scopeName}/${id}`, { data: { type: scopeName, id:params.id, attributes:params.attributes, relationships:params.relationships } });
      return Promise.resolve({});
    })

    /**
     * Performs a partial update on a specific resource's attributes or relationships.
     * This function sends a PATCH request to /api/{resourceName}/{id}.
     * @param {(string|number)} id - The unique ID of the resource.
     * @param {object} attributes - An object containing only the attributes to change.
     * @param {object} [relationships={}] - An optional object containing only the relationships to change.
     * @returns {Promise<object>} A Promise that resolves to the JSON:API document containing the updated resource.
     *
     * @example
     * // Change the title of article "123" and update its author
     * const updatedArticleResponse = await api.patch(
     * 'articles',
     * '123',
     * { "title": "A Revised Title" },
     * { "author": { "data": { "type": "people", "id": "10" } } }
     * );
     * @see PATCH /api/articles/123
     * // Example Return Value for updatedArticleResponse:
     * // {
     * //   "data": {
     * //     "type": "articles", "id": "123",
     * //     "attributes": { "title": "A Revised Title", "body": "...", ... },
     * //     "relationships": { "author": { "data": { "type": "people", "id": "10" } } }
     * //   }
     * // }
     */
    addScopeMethod('patch', async ({ params, context, vars, helpers, scopes, runHooks, apiOptions, pluginOptions, scopeOptions, scopeName }) => {
      // Implementation calls PATCH /api/{resourceName}/{id}
      console.log(`PATCH /api/${scopeName}/${id}`, { data: { type: scopeName, id, attributes:params.attributes, relationships:params.relationships } });
      return Promise.resolve({});
    })

    /**
     * Permanently deletes a resource. Note: the function is named `del` because `delete` is a reserved keyword in JavaScript.
     * This function sends a DELETE request to /api/{resourceName}/{id}.
     * @param {(string|number)} id - The unique ID of the resource.
     * @returns {Promise<void>} A Promise that resolves when the deletion is complete. Server returns 204 No Content.
     *
     * @example
     * // Permanently delete article "123"
     * await api.del('articles', '123');
     * @see DELETE /api/articles/123
     */
    addScopeMethod('del', async ({ params, context, vars, helpers, scopes, runHooks, apiOptions, pluginOptions, scopeOptions, scopeName }) => {
      // Implementation calls DELETE /api/{resourceName}/{id}
      console.log(`DELETE /api/${scopeName}/${params.id}`);
      return Promise.resolve();
    })


    // Define default storage helpers that throw errors
    helpers.dataGet = async ({ scopeName, params }) => {
      throw new Error(`No storage implementation for get. Install a storage plugin.`);
    };
    
    helpers.dataQuery = async ({ scopeName, params }) => {
      throw new Error(`No storage implementation for query. Install a storage plugin.`);
    };
    
    helpers.dataPost = async ({ scopeName, params }) => {
      throw new Error(`No storage implementation for post. Install a storage plugin.`);
    };

    helpers.dataPatch = async ({ scopeName, params }) => {
      throw new Error(`No storage implementation for patch. Install a storage plugin.`);
    };

    helpers.dataPutExisting = async ({ scopeName, params }) => {
      throw new Error(`No storage implementation for put (existing). Install a storage plugin.`);
    };
    helpers.dataPutNew = async ({ scopeName, params }) => {
      throw new Error(`No storage implementation for put (new). Install a storage plugin.`);
    };
    
    helpers.dataDel = async ({ scopeName, params }) => {
      throw new Error(`No storage implementation for delete. Install a storage plugin.`);
    };


    

      
    // Add REST API configuration
    vars.restDefaults = {
      pageSize: pluginOptions['rest-api']?.pageSize || 20,
      maxPageSize: pluginOptions['rest-api']?.maxPageSize || 100,
      idProperty: pluginOptions['rest-api']?.idProperty || 'id'
    };
  }
};