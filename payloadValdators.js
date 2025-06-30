/**
 * Validates the structural integrity of the relationships and included data in a JSON:API POST request.
 * It performs three key checks:
 * 1. Ensures the `included` array is well-formed and contains no duplicates.
 * 2. Ensures that any resource linked in `relationships` with a client-generated ID is present in the `included` array.
 * 3. Ensures that every resource in the `included` array is actually linked to from the `relationships` object (no dangling resources).
 *
 * @param {object} params - The parameters object from the request.
 * @param {object} [params.relationships={}] - The relationships object from the request body.
 * @param {object[]} [params.included=[]] - The included array from the request body.
 * @throws {Error} Throws an error with a specific message if validation fails. The message is designed to be mapped to a 409 Conflict or 400 Bad Request HTTP status.
 * @returns {true} Returns true if the payload is structurally valid.
 */
export function validatePostPayload(params) {
  const { relationships = {}, included = [] } = params;

  if (!Array.isArray(included)) {
    throw new Error("Invalid Payload: The 'included' member must be an array.");
  }

  const includedResources = new Map();

  // --- First Pass: Validate and index the `included` array ---
  for (const resource of included) {
    if (typeof resource !== 'object' || resource === null) {
      throw new Error("Invalid Payload: Each item in 'included' must be an object.");
    }

    const { type, id } = resource;
    if (typeof type !== 'string' || !type) {
      throw new Error("Invalid Payload: Each resource in 'included' must have a 'type'.");
    }
    // A temporary ID must be provided by the client
    if (typeof id !== 'string' || !id) {
      throw new Error("Invalid Payload: Each resource in 'included' must have a client-generated string 'id'.");
    }

    const uniqueKey = `${type}:${id}`;
    if (includedResources.has(uniqueKey)) {
      // This should be a 409 Conflict error
      throw new Error(`Conflict: Duplicate resource of type '${type}' with id '${id}' found in 'included' array.`);
    }
    includedResources.set(uniqueKey, { linked: false });
  }

  // --- Second Pass: Validate relationships and cross-check with `included` ---
  if (typeof relationships !== 'object' || relationships === null) {
    throw new Error("Invalid Payload: The 'relationships' member must be an object.");
  }

  for (const relName in relationships) {
    const relationship = relationships[relName];
    if (typeof relationship !== 'object' || relationship === null || !('data' in relationship)) {
      throw new Error(`Invalid Payload: Relationship '${relName}' must be an object with a 'data' member.`);
    }

    let linkageData = relationship.data;
    // Normalize to-one relationships into an array for consistent processing
    if (linkageData && !Array.isArray(linkageData)) {
      linkageData = [linkageData];
    }

    if (!Array.isArray(linkageData)) continue; // Can be `null` or empty array `[]` which is valid

    for (const identifier of linkageData) {
      if (typeof identifier !== 'object' || identifier === null) {
        throw new Error(`Invalid Payload: Each item in relationship '${relName}'.data must be an object.`);
      }

      const { type, id } = identifier;
      if (typeof type !== 'string' || !type || id === undefined) {
        throw new Error(`Invalid Payload: Each resource identifier in relationship '${relName}' must have a 'type' and 'id'.`);
      }

      // This is our rule: a string ID is a temporary ID for a new resource.
      if (typeof id === 'string') {
        const uniqueKey = `${type}:${id}`;
        if (!includedResources.has(uniqueKey)) {
          // This should be a 409 Conflict error
          throw new Error(`Conflict: Relationship '${relName}' links to a resource ('${type}:${id}') that is not present in the 'included' array.`);
        }
        // Mark this included resource as being properly linked
        includedResources.get(uniqueKey).linked = true;
      }
    }
  }

  // --- Final Check: Ensure no dangling resources in `included` ---
  for (const [key, value] of includedResources.entries()) {
    if (!value.linked) {
      // This should be a 409 Conflict error
      throw new Error(`Conflict: Resource '${key}' was present in the 'included' array but was not linked to from any relationship.`);
    }
  }

  return true;
}


/**
 * Validates the structural integrity of the query parameters for a GET request.
 *
 * @param {object} [queryParams={}] - The query parameters object to validate.
 * @param {string} [queryParams.include] - A comma-separated string of relationship paths.
 * @param {object} [queryParams.fields] - An object where keys are resource types and values are strings.
 * @param {string} [queryParams.sort] - A comma-separated string of sort fields.
 * @param {object} [queryParams.page] - An object for pagination parameters.
 * @param {object} [queryParams.filter] - An object for filter parameters.
 * @throws {Error} Throws a TypeError with a specific message if any part of the queryParams object is invalid.
 * @returns {true} Returns true if the queryParams object is structurally valid.
 */
export function validateGetPayload(queryParams = {}) {
  if (typeof queryParams !== 'object' || queryParams === null || Array.isArray(queryParams)) {
    throw new TypeError("The 'queryParams' argument must be an object.");
  }

  // Validate 'include'
  if ('include' in queryParams && typeof queryParams.include !== 'string') {
    throw new TypeError("The 'include' parameter must be a string.");
  }

  // Validate 'sort'
  if ('sort' in queryParams && typeof queryParams.sort !== 'string') {
    throw new TypeError("The 'sort' parameter must be a string.");
  }

  // Validate 'fields'
  if ('fields' in queryParams) {
    if (typeof queryParams.fields !== 'object' || queryParams.fields === null || Array.isArray(queryParams.fields)) {
      throw new TypeError("The 'fields' parameter must be an object.");
    }
    for (const resourceType in queryParams.fields) {
      if (typeof queryParams.fields[resourceType] !== 'string') {
        throw new TypeError(`The value for fields['${resourceType}'] must be a string.`);
      }
    }
  }

  // Validate 'page'
  if ('page' in queryParams && (typeof queryParams.page !== 'object' || queryParams.page === null || Array.isArray(queryParams.page))) {
    throw new TypeError("The 'page' parameter must be an object.");
  }
  
  // Validate 'filter'
  if ('filter' in queryParams && (typeof queryParams.filter !== 'object' || queryParams.filter === null || Array.isArray(queryParams.filter))) {
    throw new TypeError("The 'filter' parameter must be an object.");
  }

  return true;
}
