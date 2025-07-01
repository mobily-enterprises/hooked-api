
/**
 * Validates a JSON:API resource identifier object
 * @param {Object} identifier - The resource identifier to validate
 * @param {string} context - Context for error messages
 * @param {Object} scopes - The scopes proxy object to check if type exists
 * @returns {boolean} True if valid
 * @throws {Error} If validation fails
 */
function validateResourceIdentifier(identifier, context, scopes = null) {
  if (!identifier || typeof identifier !== 'object') {
    throw new Error(`${context}: Resource identifier must be an object`);
  }
  
  if (typeof identifier.type !== 'string' || !identifier.type) {
    throw new Error(`${context}: Resource identifier must have a non-empty 'type' string`);
  }
  
  // Check if type is valid by checking if scope exists
  if (scopes && !scopes[identifier.type]) {
    throw new Error(`${context}: Unknown resource type '${identifier.type}'. No scope with this name exists.`);
  }
  
  if (!('id' in identifier)) {
    throw new Error(`${context}: Resource identifier must have an 'id' property`);
  }
  
  if (identifier.id !== null && typeof identifier.id !== 'string' && typeof identifier.id !== 'number') {
    throw new Error(`${context}: Resource identifier 'id' must be a string, number, or null`);
  }
  
  return true;
}

/**
 * Validates a relationship object
 * @param {Object} relationship - The relationship to validate
 * @param {string} relationshipName - Name of the relationship for error context
 * @param {Object} scopes - The scopes proxy object to check if type exists
 * @returns {boolean} True if valid
 * @throws {Error} If validation fails
 */
function validateRelationship(relationship, relationshipName, scopes = null) {
  if (!relationship || typeof relationship !== 'object') {
    throw new Error(`Relationship '${relationshipName}' must be an object`);
  }
  
  if (!('data' in relationship)) {
    throw new Error(`Relationship '${relationshipName}' must have a 'data' property`);
  }
  
  const { data } = relationship;
  
  // data can be null (empty to-one relationship)
  if (data === null) {
    return true;
  }
  
  // data can be a single resource identifier (to-one)
  if (!Array.isArray(data)) {
    validateResourceIdentifier(data, `Relationship '${relationshipName}'`, scopes);
    return true;
  }
  
  // data can be an array of resource identifiers (to-many)
  if (data.length === 0) {
    return true; // Empty to-many relationship is valid
  }
  
  data.forEach((identifier, index) => {
    validateResourceIdentifier(identifier, `Relationship '${relationshipName}[${index}]'`, scopes);
  });
  
  return true;
}

/**
 * Validates query parameters for GET requests
 * @param {Object} params - The parameters object containing id and queryParams
 * @returns {boolean} True if valid
 * @throws {Error} If validation fails
 */
export function validateGetPayload(params) {
  if (!params || typeof params !== 'object') {
    throw new Error('GET parameters must be an object');
  }
  
  // Validate ID
  if (!('id' in params)) {
    throw new Error('GET request must include an id parameter');
  }
  
  if (params.id === null || params.id === undefined || params.id === '') {
    throw new Error('GET request id cannot be null, undefined, or empty');
  }
  
  // Validate queryParams if present
  if (params.queryParams) {
    if (typeof params.queryParams !== 'object') {
      throw new Error('queryParams must be an object');
    }
    
    const { include, fields } = params.queryParams;
    
    // Validate include
    if (include !== undefined) {
      if (!Array.isArray(include)) {
        throw new Error('queryParams.include must be an array of strings');
      }
      
      include.forEach((path, index) => {
        if (typeof path !== 'string') {
          throw new Error(`queryParams.include[${index}] must be a string`);
        }
      });
    }
    
    // Validate fields
    if (fields !== undefined) {
      if (typeof fields !== 'object' || fields === null || Array.isArray(fields)) {
        throw new Error('queryParams.fields must be an object');
      }
      
      Object.entries(fields).forEach(([resourceType, fieldList]) => {
        if (typeof fieldList !== 'string') {
          throw new Error(`queryParams.fields['${resourceType}'] must be a comma-separated string`);
        }
      });
    }
  }
  
  return true;
}

/**
 * Validates query parameters for collection requests
 * @param {Object} params - The parameters object
 * @param {string[]} sortableFields - Array of fields that can be sorted
 * @returns {boolean} True if valid
 * @throws {Error} If validation fails
 */
export function validateQueryPayload(params, sortableFields = []) {
  if (!params || typeof params !== 'object') {
    throw new Error('Query parameters must be an object');
  }
  
  // queryParams is optional but if present must be an object
  if (params.queryParams) {
    if (typeof params.queryParams !== 'object') {
      throw new Error('queryParams must be an object');
    }
    
    const { include, fields, filter, sort, page } = params.queryParams;
    
    // Validate include
    if (include !== undefined) {
      if (!Array.isArray(include)) {
        throw new Error('queryParams.include must be an array of strings');
      }
      
      include.forEach((path, index) => {
        if (typeof path !== 'string') {
          throw new Error(`queryParams.include[${index}] must be a string`);
        }
      });
    }
    
    // Validate fields
    if (fields !== undefined) {
      if (typeof fields !== 'object' || fields === null || Array.isArray(fields)) {
        throw new Error('queryParams.fields must be an object');
      }
      
      Object.entries(fields).forEach(([resourceType, fieldList]) => {
        if (typeof fieldList !== 'string') {
          throw new Error(`queryParams.fields['${resourceType}'] must be a comma-separated string`);
        }
      });
    }
    
    // Validate filter
    if (filter !== undefined) {
      if (typeof filter !== 'object' || filter === null || Array.isArray(filter)) {
        throw new Error('queryParams.filter must be an object');
      }
    }
    
    // Validate sort
    if (sort !== undefined) {
      if (!Array.isArray(sort)) {
        throw new Error('queryParams.sort must be an array of strings');
      }
      
      sort.forEach((field, index) => {
        if (typeof field !== 'string') {
          throw new Error(`queryParams.sort[${index}] must be a string`);
        }
        
        // Check if field is sortable (remove leading - for descending sort)
        const fieldName = field.startsWith('-') ? field.substring(1) : field;
        if (sortableFields.length > 0 && !sortableFields.includes(fieldName)) {
          throw new Error(`Field '${fieldName}' is not sortable. Sortable fields are: ${sortableFields.join(', ')}`);
        }
      });
    }
    
    // Validate page
    if (page !== undefined) {
      if (typeof page !== 'object' || page === null || Array.isArray(page)) {
        throw new Error('queryParams.page must be an object');
      }
      
      // Common pagination parameters
      if ('number' in page && typeof page.number !== 'number' && typeof page.number !== 'string') {
        throw new Error('queryParams.page.number must be a number or string');
      }
      
      if ('size' in page && typeof page.size !== 'number' && typeof page.size !== 'string') {
        throw new Error('queryParams.page.size must be a number or string');
      }
      
      if ('limit' in page && typeof page.limit !== 'number' && typeof page.limit !== 'string') {
        throw new Error('queryParams.page.limit must be a number or string');
      }
      
      if ('offset' in page && typeof page.offset !== 'number' && typeof page.offset !== 'string') {
        throw new Error('queryParams.page.offset must be a number or string');
      }
    }
  }
  
  return true;
}

/**
 * Validates a JSON:API document for POST requests
 * @param {Object} inputRecord - The JSON:API document to validate
 * @param {Object} scopes - The scopes proxy object to check if type exists
 * @returns {boolean} True if valid
 * @throws {Error} If validation fails
 */
export function validatePostPayload(inputRecord, scopes = null) {
  if (!inputRecord || typeof inputRecord !== 'object') {
    throw new Error('POST request body must be a JSON:API document object');
  }
  
  // Validate required 'data' property
  if (!('data' in inputRecord)) {
    throw new Error('POST request body must have a "data" property');
  }
  
  const { data, included } = inputRecord;
  
  // Validate primary data
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('POST request "data" must be a single resource object');
  }
  
  if (typeof data.type !== 'string' || !data.type) {
    throw new Error('POST request "data" must have a non-empty "type" string');
  }
  
  // Check if primary resource type is valid
  if (scopes && !scopes[data.type]) {
    throw new Error(`POST request "data.type" '${data.type}' is not a valid resource type. No scope with this name exists.`);
  }
  
  // For POST, id is optional (server may generate it)
  if ('id' in data && data.id !== null && typeof data.id !== 'string' && typeof data.id !== 'number') {
    throw new Error('POST request "data.id" if present must be a string, number, or null');
  }
  
  // Validate attributes if present
  if ('attributes' in data) {
    if (typeof data.attributes !== 'object' || data.attributes === null || Array.isArray(data.attributes)) {
      throw new Error('POST request "data.attributes" must be an object');
    }
  }
  
  // Validate relationships if present
  if ('relationships' in data) {
    if (typeof data.relationships !== 'object' || data.relationships === null || Array.isArray(data.relationships)) {
      throw new Error('POST request "data.relationships" must be an object');
    }
    
    Object.entries(data.relationships).forEach(([relName, relationship]) => {
      validateRelationship(relationship, relName, scopes);
    });
  }
  
  // Validate included resources if present
  if (included !== undefined) {
    if (!Array.isArray(included)) {
      throw new Error('POST request "included" must be an array');
    }
    
    included.forEach((resource, index) => {
      if (!resource || typeof resource !== 'object') {
        throw new Error(`POST request "included[${index}]" must be a resource object`);
      }
      
      if (typeof resource.type !== 'string' || !resource.type) {
        throw new Error(`POST request "included[${index}]" must have a non-empty "type" string`);
      }
      
      // Check if included resource type is valid
      if (scopes && !scopes[resource.type]) {
        throw new Error(`POST request "included[${index}].type" '${resource.type}' is not a valid resource type. No scope with this name exists.`);
      }
      
      if (!('id' in resource) || resource.id === null || resource.id === undefined) {
        throw new Error(`POST request "included[${index}]" must have a non-null "id"`);
      }
      
      if (typeof resource.id !== 'string' && typeof resource.id !== 'number') {
        throw new Error(`POST request "included[${index}].id" must be a string or number`);
      }
      
      if ('attributes' in resource) {
        if (typeof resource.attributes !== 'object' || resource.attributes === null || Array.isArray(resource.attributes)) {
          throw new Error(`POST request "included[${index}].attributes" must be an object`);
        }
      }
    });
  }
  
  return true;
}

/**
 * Validates a JSON:API document for PUT requests
 * @param {Object} inputRecord - The JSON:API document to validate
 * @param {Object} scopes - The scopes proxy object to check if type exists
 * @returns {boolean} True if valid
 * @throws {Error} If validation fails
 */
export function validatePutPayload(inputRecord, scopes = null) {
  if (!inputRecord || typeof inputRecord !== 'object') {
    throw new Error('PUT request body must be a JSON:API document object');
  }
  
  // Validate required 'data' property
  if (!('data' in inputRecord)) {
    throw new Error('PUT request body must have a "data" property');
  }
  
  const { data, included } = inputRecord;
  
  // PUT cannot have included array
  if (included !== undefined) {
    throw new Error('PUT requests cannot include an "included" array for creating new resources');
  }
  
  // Validate primary data
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('PUT request "data" must be a single resource object');
  }
  
  if (typeof data.type !== 'string' || !data.type) {
    throw new Error('PUT request "data" must have a non-empty "type" string');
  }
  
  // Check if resource type is valid
  if (scopes && !scopes[data.type]) {
    throw new Error(`PUT request "data.type" '${data.type}' is not a valid resource type. No scope with this name exists.`);
  }
  
  // For PUT, id is required
  if (!('id' in data)) {
    throw new Error('PUT request "data" must have an "id" property');
  }
  
  if (data.id === null || data.id === undefined || data.id === '') {
    throw new Error('PUT request "data.id" cannot be null, undefined, or empty');
  }
  
  if (typeof data.id !== 'string' && typeof data.id !== 'number') {
    throw new Error('PUT request "data.id" must be a string or number');
  }
  
  // Validate attributes if present
  if ('attributes' in data) {
    if (typeof data.attributes !== 'object' || data.attributes === null || Array.isArray(data.attributes)) {
      throw new Error('PUT request "data.attributes" must be an object');
    }
  }
  
  // Validate relationships if present
  if ('relationships' in data) {
    if (typeof data.relationships !== 'object' || data.relationships === null || Array.isArray(data.relationships)) {
      throw new Error('PUT request "data.relationships" must be an object');
    }
    
    Object.entries(data.relationships).forEach(([relName, relationship]) => {
      validateRelationship(relationship, relName, scopes);
    });
  }
  
  return true;
}

/**
 * Validates a JSON:API document for PATCH requests
 * @param {Object} inputRecord - The JSON:API document to validate
 * @param {Object} scopes - The scopes proxy object to check if type exists
 * @returns {boolean} True if valid
 * @throws {Error} If validation fails
 */
export function validatePatchPayload(inputRecord, scopes = null) {
  if (!inputRecord || typeof inputRecord !== 'object') {
    throw new Error('PATCH request body must be a JSON:API document object');
  }
  
  // Validate required 'data' property
  if (!('data' in inputRecord)) {
    throw new Error('PATCH request body must have a "data" property');
  }
  
  const { data, included } = inputRecord;
  
  // PATCH cannot have included array
  if (included !== undefined) {
    throw new Error('PATCH requests cannot include an "included" array for creating new resources');
  }
  
  // Validate primary data
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('PATCH request "data" must be a single resource object');
  }
  
  if (typeof data.type !== 'string' || !data.type) {
    throw new Error('PATCH request "data" must have a non-empty "type" string');
  }
  
  // Check if resource type is valid
  if (scopes && !scopes[data.type]) {
    throw new Error(`PATCH request "data.type" '${data.type}' is not a valid resource type. No scope with this name exists.`);
  }
  
  // For PATCH, id is required
  if (!('id' in data)) {
    throw new Error('PATCH request "data" must have an "id" property');
  }
  
  if (data.id === null || data.id === undefined || data.id === '') {
    throw new Error('PATCH request "data.id" cannot be null, undefined, or empty');
  }
  
  if (typeof data.id !== 'string' && typeof data.id !== 'number') {
    throw new Error('PATCH request "data.id" must be a string or number');
  }
  
  // For PATCH, at least one of attributes or relationships should be present
  if (!('attributes' in data) && !('relationships' in data)) {
    throw new Error('PATCH request "data" must have at least one of "attributes" or "relationships"');
  }
  
  // Validate attributes if present
  if ('attributes' in data && data.attributes !== undefined) {
    if (typeof data.attributes !== 'object' || data.attributes === null || Array.isArray(data.attributes)) {
      throw new Error('PATCH request "data.attributes" must be an object');
    }
  }
  
  // Validate relationships if present
  if ('relationships' in data && data.relationships !== undefined) {
    if (typeof data.relationships !== 'object' || data.relationships === null || Array.isArray(data.relationships)) {
      throw new Error('PATCH request "data.relationships" must be an object');
    }
    
    Object.entries(data.relationships).forEach(([relName, relationship]) => {
      validateRelationship(relationship, relName, scopes);
    });
  }
  
  return true;
}
