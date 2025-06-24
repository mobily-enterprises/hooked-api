/**
 * @file A sophisticated library for creating versioned, pluggable, and resource-oriented APIs.
 * @author Created with Gemini
 * @version 1.0.0
 */

// The semver library is used for all version comparisons, ensuring that version
// ranges (e.g., '^1.2.3') are handled correctly and robustly according to the
// official Semantic Versioning specification.
import semver from 'semver'

/**
 * The single, central registry for all Api instances created during the application's lifecycle.
 *
 * It is structured as a Map where each key is an API's unique name (e.g., 'CRM_API')
 * and the value is another Map. This nested Map holds the actual Api instances, keyed
 * by their specific version string (e.g., '1.0.0').
 *
 * This structure enables efficient lookups for specific versions or the latest compatible version of any API.
 * Data structure: Map<API_Name: string, Map<API_Version: string, Api_Instance: Api>>
 * @type {Map<string, Map<string, Api>>}
 */
let globalRegistry = new Map()

/**
 * A proxy handler that intercepts property access on a specific resource.
 *
 * This is the core mechanism that allows for seamless access to both resource-specific
 * and API-level constants and implementers (methods). When a property is accessed on a
 * resource proxy (e.g., `myApi.users.create` or `myApi.users.placeholder`), this handler's
 * `get` method resolves the property based on a defined order of precedence.
 *
 * This architecture allows resources to override general API behavior or define their own unique
 * properties, creating a powerful and flexible layered system.
 *
 * The lookup priority is as follows:
 * 1. Resource-specific constant (data on the resource itself)
 * 2. Resource-specific implementer (function on the resource itself)
 * 3. API-level constant (global data on the API instance)
 * 4. API-level implementer (global function on the API instance)
 *
 * If an implementer (function) is found, this handler returns a new async function
 * that, when called, automatically injects the correct `context` and executes the
 * original handler. If a constant is found, its value is returned directly.
 *
 * The `get` method of this handler receives the following parameters from the Proxy:
 * @param {object} target - The proxy's internal target object, containing `_apiInstance` and `_resourceName`.
 * @param {string} prop - The name of the property being accessed (e.g., 'createUser').
 * @returns {*|Function|undefined} Returns the constant's value directly, an executable async function for an implementer, or `undefined` if the property is not found.
 */
const ResourceProxyHandler = {
  get(target, prop) {
    const apiInstance = target._apiInstance;
    const resourceName = target._resourceName;
    const resourceConfig = apiInstance._resources.get(resourceName);

    // Priority 1: Check for a resource-specific constant.
    // These are static values defined only on this resource.
    if (resourceConfig && resourceConfig.constants && resourceConfig.constants.has(prop)) {
      return resourceConfig.constants.get(prop);
    }

    // Priority 2: Check for a resource-specific implementer.
    // These are methods defined only on this resource.
    if (resourceConfig && resourceConfig.implementers && resourceConfig.implementers.has(prop)) {
      const resourceSpecificHandler = resourceConfig.implementers.get(prop);
      // We wrap the handler in an async function to provide a consistent execution context.
      // This handler is executed directly as it's not part of the main API's `execute` flow.
      return async (context = {}) => {
        context.resourceName = resourceName;
        context.apiInstance = apiInstance; // Add apiInstance to context for consistency.
        const result = await resourceSpecificHandler(context);
        delete context.apiInstance; // Clean up context to prevent side effects.
        delete context.resourceName;
        return result;
      };
    }

    // Priority 3: Check for an API-level constant.
    // If not found on the resource, we check for a global constant on the API instance.
    if (apiInstance.constants.has(prop)) {
        return apiInstance.constants.get(prop);
    }

    // Priority 4: Fallback to the general, API-level implementer.
    // This is the last check for a shared method on the API instance itself.
    if (apiInstance.implementers.has(prop)) {
      // We wrap this call to ensure the context is set correctly before calling the main execute method.
      return async (context = {}) => { // context here is the object passed by the caller (e.g., { data: { name: 'Jane' } })
        context.resourceName = resourceName; // Add resourceName to the context object
        const result = await apiInstance.execute(prop, context); // Use the central `execute` for consistency.
        delete context.resourceName; // Clean up the resourceName property from the context
        return result;
      };
    }

    // Priority 5: If the property is not found anywhere in the hierarchy, it's undefined.
    return undefined;
  }
}

/**
 * The core `Api` class provides a foundation for creating versioned, pluggable, and
 * resource-oriented APIs. An instance of this class represents a complete, self-contained
 * API with its own set of resources, hooks, methods, and configuration.
 */
export class Api {
  /**
   * Creates an instance of the Api class.
   * @param {object} [options={}] - Configuration options for this API instance.
   * @param {string} options.name - The unique name for this API (e.g., 'DATABASE_API').
   * @param {string} [options.version='1.0.0'] - The semantic version of this API instance.
   * @param {object} [options.hooks={}] - An object defining API-level hooks to register at construction.
   * @param {object} [options.implementers={}] - An object defining API-level methods to register at construction.
   * @param {object} [options.constants={}] - An object defining API-level constants to register at construction.
   */
  constructor(options = {}) {
    // Merge provided options with defaults to create the final configuration.
    this.options = {
      name: null,
      version: '1.0.0',
      hooks: {},
      implementers: {},
      constants: {},
      ...options
    }

    // --- Core Instance Properties ---

    // Every API instance must have a valid name and semver version.
    if (typeof this.options.name !== 'string' || this.options.name.trim() === '') {
      throw new Error('API instance must have a non-empty "name" property.');
    }
    if (!semver.valid(this.options.version)) {
      throw new Error(`Invalid version format '${this.options.version}' for API '${this.options.name}'.`);
    }

    /**
     * The hook system for this API instance.
     * Holds all registered hook handlers, both API-level and resource-specific.
     * @type {Map<string, Array<object>>}
     */
    this.hooks = new Map()

    /**
     * Storage for API-level constants. These are static values available to all
     * resources within this API instance unless shadowed by a resource-specific constant.
     * @type {Map<string, *>}
     */
    this.constants = new Map()

    /**
     * Storage for API-level implementers. These are methods available to all
     * resources within this API instance unless shadowed by a resource-specific implementer.
     * @type {Map<string, Function>}
     */
    this.implementers = new Map()

    /**
     * A set to track the names of plugins that have been installed on this instance
     * to prevent re-installation and to manage dependencies.
     * @type {Set<string>}
     * @private
     */
    this._installedPlugins = new Set()

    /**
     * The internal registry for all resources added to this specific API instance.
     * Each resource stores its own options, and its resource-specific implementers and constants.
     * @type {Map<string, {options: object, implementers: Map, constants: Map}>}
     * @private
     */
    this._resources = new Map()

    // --- Constructor Initialization Logic ---

    // Process and register any API-level hooks passed in the constructor options.
    if (this.options.hooks && typeof this.options.hooks === 'object') {
      for (const hookName in this.options.hooks) {
        if (Object.prototype.hasOwnProperty.call(this.options.hooks, hookName)) {
          const hookDefinition = this.options.hooks[hookName]

          let originalHandler, functionName, params = {};

          if (typeof hookDefinition === 'function') {
            originalHandler = hookDefinition
            functionName = hookName // Use the hook key as functionName
          } else if (typeof hookDefinition === 'object' && hookDefinition !== null) {
            if (typeof hookDefinition.handler !== 'function') {
              throw new Error(`Constructor hook '${hookName}' for API '${this.options.name}' must have a 'handler' function.`)
            }
            originalHandler = hookDefinition.handler
            functionName = hookDefinition.functionName || hookName
            params = { ...hookDefinition }
            delete params.handler
            delete params.functionName
          } else {
            throw new Error(`Constructor hook '${hookName}' for API '${this.options.name}' has an invalid definition type.`)
          }

          // These hooks are API-wide, so their handler doesn't need a resource-specific check.
          const wrappedHandler = async (context) => await originalHandler(context)
          this.hook(hookName, `api:${this.options.name}`, functionName, params, wrappedHandler)
        }
      }
    }

    // Process and register any API-level constants passed in the constructor options.
    if (this.options.constants && typeof this.options.constants === 'object') {
        for (const constantName in this.options.constants) {
            if (Object.prototype.hasOwnProperty.call(this.options.constants, constantName)) {
                this.addConstant(constantName, this.options.constants[constantName]);
            }
        }
    }

    // Process and register any API-level implementers (methods) passed in the constructor options.
    if (this.options.implementers && typeof this.options.implementers === 'object') {
      for (const methodName in this.options.implementers) {
        if (Object.prototype.hasOwnProperty.call(this.options.implementers, methodName)) {
          const handler = this.options.implementers[methodName];
          this.implement(methodName, handler);
        }
      }
    }

    // Automatically register this new instance in the global registry so it can be found by others.
    this.register()

    /**
     * A convenient proxy for accessing resources attached to *this specific* API instance.
     * For example: `myApi.localResources.users.create()`. This avoids having to use the
     * global `Api.resources` and ensures you are interacting with the intended instance.
     * @type {Proxy}
     */
    this.localResources = new Proxy({}, {
      get: (target, resourceName) => {
        if (typeof resourceName !== 'string') {
          return undefined; // Safety for non-string properties like `Symbol.iterator`.
        }
        return this._getResourceProxy(resourceName);
      }
    });
  }

  /**
   * Registers this API instance in the `globalRegistry`, making it discoverable.
   * This method is called automatically by the constructor.
   * @returns {Api} The API instance for chaining.
   */
  register() {
    const { name, version } = this.options

    if (!globalRegistry.has(name)) {
      globalRegistry.set(name, new Map())
    }

    if (globalRegistry.get(name).has(version)) {
      console.warn(`API '${name}' version '${version}' is being re-registered. Overwriting existing instance.`);
    }

    globalRegistry.get(name).set(version, this)
    return this
  }

  /**
   * Adds a named resource to this API instance. A resource acts as a namespace for a collection
   * of specific options, data (constants), behaviors (implementers), and lifecycle hooks.
   * Resource names must be globally unique across all APIs to avoid ambiguity when using the
   * static `Api.resources` accessor.
   * @param {string} name - The globally unique name of the resource (e.g., 'books', 'users').
   * @param {object} [resourceOptions={}] - Any options or configuration specific to this resource.
   * @param {object} [resourceExtraHooks={}] - Hooks that only apply to this specific resource.
   * @param {object} [resourceImplementers={}] - Methods that only exist on this specific resource.
   * @param {object} [resourceConstants={}] - Constants that only exist on this specific resource.
   * @returns {Api} The API instance for chaining.
   */
  addResource(name, resourceOptions = {}, resourceExtraHooks = {}, resourceImplementers = {}, resourceConstants = {}) {
    if (typeof name !== 'string' || name.trim() === '') {
      throw new Error('Resource name must be a non-empty string.')
    }

    // A resource can only be added once to a given API instance.
    if (this._resources.has(name)) {
      throw new Error(`Resource '${name}' already exists on API '${this.options.name}'.`);
    }

    // To prevent confusion with the global `Api.resources` accessor, a resource name
    // must be unique across all registered API instances.
    for (const [apiName, versionsMap] of globalRegistry.entries()) {
      for (const [version, apiInstance] of versionsMap.entries()) {
        if (apiInstance !== this && apiInstance._resources.has(name)) {
          throw new Error(`Resource name '${name}' is already used by API '${apiName}' version '${version}'. Resource names must be globally unique.`);
        }
      }
    }

    // Process and store any implementers that are specific to this resource.
    const implementersMap = new Map();
    if (resourceImplementers && typeof resourceImplementers === 'object') {
      for (const methodName in resourceImplementers) {
        if (Object.prototype.hasOwnProperty.call(resourceImplementers, methodName)) {
          const handler = resourceImplementers[methodName];
          if (typeof handler !== 'function') {
            throw new Error(`Implementer '${methodName}' for resource '${name}' on API '${this.options.name}' must be a function.`);
          }
          if (this.implementers.has(methodName)) {
            console.warn(`Resource '${name}' is defining an implementer '${methodName}' which shadows an existing API-level implementer on '${this.options.name}'.`);
          }
          implementersMap.set(methodName, handler);
        }
      }
    }

    // Process and store any constants that are specific to this resource.
    const constantsMap = new Map();
    if (resourceConstants && typeof resourceConstants === 'object') {
        for (const constantName in resourceConstants) {
            if (Object.prototype.hasOwnProperty.call(resourceConstants, constantName)) {
                const value = resourceConstants[constantName];
                // Check for potential name collisions to help with debugging.
                if (this.implementers.has(constantName) || this.constants.has(constantName)) {
                    console.warn(`Resource '${name}' is defining a constant '${constantName}' which shadows an existing API-level property on '${this.options.name}'.`);
                }
                if (implementersMap.has(constantName)) {
                    console.warn(`Resource '${name}' has a constant '${constantName}' which shares a name with a resource-specific implementer. The constant will take priority.`);
                }
                constantsMap.set(constantName, value);
            }
        }
    }

    // Store the complete configuration for this resource.
    this._resources.set(name, {
        options: resourceOptions,
        implementers: implementersMap,
        constants: constantsMap
    });

    // Process and store any hooks that are specific to this resource.
    for (const hookName in resourceExtraHooks) {
      if (Object.prototype.hasOwnProperty.call(resourceExtraHooks, hookName)) {
        const hookDefinition = resourceExtraHooks[hookName]
        let originalHandler, functionName, params = {};

        if (typeof hookDefinition === 'function') {
          originalHandler = hookDefinition; functionName = hookName;
        } else if (typeof hookDefinition === 'object' && hookDefinition !== null) {
          if (typeof hookDefinition.handler !== 'function') throw new Error(`Resource hook '${hookName}' for resource '${name}' must have a 'handler' function.`)
          originalHandler = hookDefinition.handler; functionName = hookDefinition.functionName || hookName;
          params = { ...hookDefinition }; delete params.handler; delete params.functionName;
        } else {
          throw new Error(`Resource hook '${hookName}' for resource '${name}' has an invalid definition type.`)
        }

        // This wrapper is crucial. It ensures that a resource-specific hook *only* runs
        // when an operation is being performed on that exact resource.
        const wrappedHandler = async (context) => {
          if (context && context.resourceName === name) {
            return await originalHandler(context);
          }
          return undefined; // Do not execute if the context doesn't match.
        };

        this.hook(hookName, `resource:${name}`, functionName, params, wrappedHandler);
      }
    }
    return this;
  }

  /**
   * Internal helper to create a resource proxy for a given resource name.
   * This is used by both the global `Api.resources` and the instance-local `this.localResources`.
   * @param {string} resourceName - The name of the resource.
   * @returns {Proxy|undefined} A proxy for the resource, or undefined if not found.
   * @private
   */
  _getResourceProxy(resourceName) {
    if (!this._resources.has(resourceName)) {
      console.warn(`Resource '${resourceName}' not found on API '${this.options.name}'.`);
      return undefined;
    }
    // This creates the proxy, arming it with the handler and the necessary context
    // (the API instance and the resource name).
    return new Proxy({ _apiInstance: this, _resourceName: resourceName }, ResourceProxyHandler);
  }

  /**
   * A static namespace for interacting with the `globalRegistry` of all APIs.
   * This provides a clean, public interface for finding and inspecting registered APIs
   * from anywhere in the application without needing a direct reference to an instance.
   */
  static registry = {
    /**
     * Finds and returns a compatible API instance from the registry.
     * @param {string} apiName - The name of the API to find.
     * @param {string} [version='latest'] - The desired version. Can be an exact version
     * string (e.g., '1.2.3') or a semver range (e.g., '^1.0.0'). Defaults to 'latest'.
     * @returns {Api|null} The matching API instance, or null if not found.
     */
    get(apiName, version = 'latest') {
      const versions = globalRegistry.get(apiName)
      if (!versions) return null;

      // Fast path for exact version matches.
      if (version !== 'latest' && versions.has(version)) {
        return versions.get(version);
      }

      // If we need 'latest' or a range, we must sort all available versions.
      const sortedVersions = Array.from(versions.entries())
        .sort(([a], [b]) => semver.compare(b, a)); // Sort descending

      if (version === 'latest') {
        return sortedVersions[0]?.[1] || null; // Return the highest version
      }

      // Find the best match for a semver range OR a "greater-than-or-equal-to" plain version string.
      for (const [ver, api] of sortedVersions) {
        // This block handles the case where a simple version string like "1.2.3" is passed.
        // It's treated as ">=1.2.3", returning the highest available version that satisfies this.
        if (!version.match(/[<>^~]/) && semver.valid(version)) {
          if (semver.gte(ver, version)) {
            return api;
          }
        // This handles standard semver ranges like "^1.2.3" or ">2.0.0".
        } else if (semver.satisfies(ver, version)) {
          return api;
        }
      }

      return null;
    },

    /**
     * An alias for `Api.registry.get()`.
     */
    find(apiName, version = 'latest') {
      return this.get(apiName, version);
    },

    /**
     * Lists all registered APIs and their available versions.
     * @returns {object} An object where keys are API names and values are arrays of
     * their versions, sorted in descending order.
     */
    list() {
      const registry = {}
      for (const [apiName, versionsMap] of globalRegistry) {
        registry[apiName] = Array.from(versionsMap.keys()).sort(semver.rcompare)
      }
      return registry
    },

    /**
     * Checks if an API is registered.
     * @param {string} apiName - The name of the API to check.
     * @param {string} [version] - An optional specific version to check for.
     * @returns {boolean} True if the API (and optionally version) exists.
     */
    has(apiName, version) {
      if (!apiName) return false;
      const versions = globalRegistry.get(apiName);
      if (!versions) return false;
      return version ? versions.has(version) : versions.size > 0;
    },

    /**
     * Retrieves all registered versions for a given API name.
     * @param {string} apiName - The name of the API.
     * @returns {string[]} An array of version strings, sorted in descending order.
     */
    versions(apiName) {
      const versions = globalRegistry.get(apiName);
      return versions ? Array.from(versions.keys()).sort(semver.rcompare) : [];
    }
  }

  /**
   * Internal helper to find an API instance that contains a given resource.
   * This is critical for the `Api.resources` proxy to function.
   * @param {string} resourceName - The name of the resource to find.
   * @param {string} [versionRange='latest'] - An optional semver range for the API version.
   * @returns {Api|null} The highest-versioned matching API instance, or null.
   * @private
   */
  static _findApiInstanceByResourceName(resourceName, versionRange = 'latest') {
    // We must check every registered API.
    for (const [apiName, versionsMap] of globalRegistry.entries()) {
      // Sort to ensure we find the highest compatible version first.
      const sortedVersions = Array.from(versionsMap.entries())
        .sort(([a], [b]) => semver.rcompare(b, a));

      for (const [ver, apiInstance] of sortedVersions) {
        // Filter by the version range if one is provided.
        if (versionRange !== 'latest' && !semver.satisfies(ver, versionRange)) {
          continue;
        }

        // If this instance has the resource, we've found our match.
        if (apiInstance._resources && apiInstance._resources.has(resourceName)) {
          return apiInstance;
        }
      }
    }
    return null; // Not found in any API.
  }

  /**
   * A static, global entry point for accessing any resource on any registered API.
   * This provides extreme convenience, allowing code to access resources without needing
   * a direct reference to the API instance it lives on.
   *
   * Usage:
   * `Api.resources.users.create(...)` - Finds the latest API with a 'users' resource.
   * `Api.resources.version('^1.0.0').users.create(...)` - Finds the latest v1 API.
   * @type {Proxy}
   */
  static resources = new Proxy({}, {
    get(target, prop) {
      // The `version()` method returns a new proxy that has the version range "baked in".
      if (prop === 'version') {
        return (range = 'latest') => {
          return new Proxy({ _versionRange: range }, {
            get(versionedTarget, resourceName) {
              if (typeof resourceName !== 'string') return undefined;
              const apiInstance = Api._findApiInstanceByResourceName(resourceName, versionedTarget._versionRange);
              if (!apiInstance) {
                console.warn(`Resource '${resourceName}' not found in any API instance matching version range '${versionedTarget._versionRange}'.`);
                return undefined;
              }
              return apiInstance._getResourceProxy(resourceName);
            }
          });
        };
      }

      // Direct property access defaults to finding the resource on the 'latest' API version.
      const resourceName = String(prop);
      const apiInstance = Api._findApiInstanceByResourceName(resourceName, 'latest');
      if (!apiInstance) {
        console.warn(`Resource '${resourceName}' not found in any registered API instance.`);
        return undefined;
      }
      return apiInstance._getResourceProxy(resourceName);
    }
  });


  /**
   * Registers a hook handler for a specific event. The hook system allows for powerful
   * customization by letting plugins insert logic at key points in the execution flow.
   * The placement parameters allow for fine-grained control over the order of execution.
   * @param {string} hookName - The name of the hook to attach to (e.g., 'beforeCreate').
   * @param {string} pluginName - The name of the plugin or component registering this hook.
   * @param {string} functionName - A unique name for this specific handler function for identification.
   * @param {object} [params={}] - Parameters for controlling execution order.
   * @param {string} [params.beforePlugin] - Run this handler before any from the named plugin.
   * @param {string} [params.afterPlugin] - Run this handler after all from the named plugin.
   * @param {string} [params.beforeFunction] - Run this handler before a specific named function.
   * @param {string} [params.afterFunction] - Run this handler after a specific named function.
   * @param {Function} handler - The async function to execute when the hook is triggered.
   * @returns {Api} The API instance for chaining.
   */
  hook(hookName, pluginName, functionName, params = {}, handler) {
    if (typeof pluginName !== 'string' || pluginName.trim() === '') throw new Error(`Hook '${hookName}' requires a valid 'pluginName' to be specified.`)
    if (typeof functionName !== 'string' || functionName.trim() === '') throw new Error(`Hook '${hookName}' from plugin '${pluginName}' requires a valid 'functionName'.`)
    if (typeof handler !== 'function') throw new Error(`Hook handler for '${hookName}' from plugin '${pluginName}' (function: '${functionName}') must be a function.`)

    // Ensure placement parameters are not used in a conflicting way.
    const hasPluginPlacement = (params.beforePlugin || params.afterPlugin)
    const hasFunctionPlacement = (params.beforeFunction || params.afterFunction)
    if (hasPluginPlacement && hasFunctionPlacement) throw new Error(`Hook '${hookName}' from plugin '${pluginName}' (function: '${functionName}') cannot specify both plugin-level and function-level placement parameters.`)
    if (params.beforePlugin && params.afterPlugin) throw new Error(`Hook '${hookName}' from plugin '${pluginName}' (function: '${functionName}') cannot specify both 'beforePlugin' and 'afterPlugin'.`)
    if (params.beforeFunction && params.afterFunction) throw new Error(`Hook '${hookName}' from plugin '${pluginName}' (function: '${functionName}') cannot specify both 'beforeFunction' and 'afterFunction'.`)

    if (!this.hooks.has(hookName)) {
      this.hooks.set(hookName, [])
    }
    const handlers = this.hooks.get(hookName)
    const newHandlerEntry = { handler, pluginName, functionName }

    let inserted = false;
    // This logic allows handlers to be spliced into the array at a specific location.
    if (params.beforePlugin) {
      const targetPluginName = params.beforePlugin
      const index = handlers.findIndex(h => h.pluginName === targetPluginName)
      if (index !== -1) {
        handlers.splice(index, 0, newHandlerEntry)
        inserted = true
      } else {
        throw new Error(`Hook '${hookName}' from plugin '${pluginName}' (function: '${functionName}'): 'beforePlugin' target plugin '${targetPluginName}' not found among existing handlers.`)
      }
    } else if (params.afterPlugin) {
      const targetPluginName = params.afterPlugin
      let lastIndex = -1
      for (let i = handlers.length - 1; i >= 0; i--) {
        if (handlers[i].pluginName === targetPluginName) {
          lastIndex = i
          break
        }
      }
      if (lastIndex !== -1) {
        handlers.splice(lastIndex + 1, 0, newHandlerEntry)
        inserted = true
      } else {
        throw new Error(`Hook '${hookName}' from plugin '${pluginName}' (function: '${functionName}'): 'afterPlugin' target plugin '${targetPluginName}' not found among existing handlers.`)
      }
    } else if (params.beforeFunction) {
      const targetFunctionName = params.beforeFunction
      const index = handlers.findIndex(h => h.functionName === targetFunctionName)
      if (index !== -1) {
        handlers.splice(index, 0, newHandlerEntry)
        inserted = true
      } else {
        throw new Error(`Hook '${hookName}' from plugin '${pluginName}' (function: '${functionName}'): 'beforeFunction' target function '${targetFunctionName}' not found among existing handlers.`)
      }
    } else if (params.afterFunction) {
      const targetFunctionName = params.afterFunction
      const index = handlers.findIndex(h => h.functionName === targetFunctionName)
      if (index !== -1) {
        handlers.splice(index + 1, 0, newHandlerEntry)
        inserted = true
      } else {
        throw new Error(`Hook '${hookName}' from plugin '${pluginName}' (function: '${functionName}'): 'afterFunction' target function '${targetFunctionName}' not found among existing handlers.`)
      }
    }
    // [FIX ENDS HERE]

    // If no placement is specified, simply add the handler to the end of the chain.
    if (!inserted) {
      handlers.push(newHandlerEntry)
    }

    return this
  }

  /**
   * Executes all registered handlers for a given hook name in sequence.
   * @param {string} name - The name of the hook to execute.
   * @param {object} context - The context object to pass to each handler. It will be
   * mutated by handlers as the chain progresses.
   * @returns {Promise<object>} The final, potentially modified context object.
   */
  async executeHook(name, context) {
    const handlers = this.hooks.get(name) || []
    context.apiInstance = this; // Add a temporary reference to the API instance in the context.
    for (const { handler, pluginName, functionName } of handlers) {
      const result = await handler(context);
      // A handler can stop the execution of subsequent handlers by returning `false`.
      if (result === false) {
        console.log(`Hook '${name}' handler from plugin '${pluginName}' (function: '${functionName}') stopped the chain.`)
        break
      }
    }
    delete context.apiInstance; // Clean up the context.
    return context;
  }

  /**
   * Registers a constant on this API instance. Constants are static values that can be
   * accessed from any resource. They take priority over implementers with the same name.
   * @param {string} name - The unique name of the constant.
   * @param {*} value - The value of the constant.
   * @returns {Api} The API instance for chaining.
   */
  addConstant(name, value) {
    if (this.implementers.has(name)) {
        console.warn(`Constant '${name}' is shadowing an implementer with the same name. The constant will take priority.`);
    }
    this.constants.set(name, value);
    return this;
  }

  /**
   * Registers an implementer (a method) on this API instance. This makes the method
   * available to be called on any resource of this API.
   * @param {string} method - The name of the method to implement (e.g., 'get', 'query').
   * @param {Function} handler - The function that provides the implementation.
   * @returns {Api} The API instance for chaining.
   */
  implement(method, handler) {
    if (typeof handler !== 'function') {
      throw new Error(`Implementation for '${method}' must be a function.`)
    }
    if (this.constants.has(method)) {
        console.warn(`Implementer '${method}' is being shadowed by a constant with the same name. The constant will take priority.`);
    }
    this.implementers.set(method, handler)
    return this
  }

  /**
   * Executes a registered implementer (method) by name.
   * @param {string} method - The name of the method to execute.
   * @param {object} [context={}] - The context object to pass to the method's handler.
   * @returns {Promise<any>} The result of the executed method.
   * @throws {Error} If no implementation is found for the given method.
   */
  async execute(method, context = {}) {
    const handler = this.implementers.get(method)
    if (!handler) {
      throw new Error(`No implementation found for method: ${method}`)
    }
    context.apiInstance = this;
    const result = await handler(context);
    delete context.apiInstance;
    return result;
  }

  /**
   * Applies a plugin to this API instance. Plugins are the primary way to add
   * shared, reusable functionality like logging, caching, or authentication.
   * @param {object} plugin - The plugin object to install.
   * @param {string} plugin.name - A unique name for the plugin.
   * @param {string[]} [plugin.dependencies=[]] - An array of other plugin names that must be installed first.
   * @param {Function} plugin.install - The function called to install the plugin, receiving `(apiInstance, options, pluginName)`.
   * @param {object} [options={}] - Options to pass to the plugin's install function.
   * @returns {Api} The API instance for chaining.
   */
  use(plugin, options = {}) {
    if (typeof plugin !== 'object' || plugin === null) throw new Error('Plugin must be an object.')
    if (typeof plugin.name !== 'string' || plugin.name.trim() === '') throw new Error('Plugin must have a non-empty "name" property.')
    if (typeof plugin.install !== 'function') throw new Error(`Plugin '${plugin.name}' must have an 'install' function.`)

    if (this._installedPlugins.has(plugin.name)) {
      throw new Error(`Plugin '${plugin.name}' is already installed on API '${this.options.name}'.`)
    }

    // Ensure all dependencies are met before installing.
    const dependencies = plugin.dependencies || []
    for (const depName of dependencies) {
      if (!this._installedPlugins.has(depName)) {
        throw new Error(`Plugin '${plugin.name}' requires dependency '${depName}' which is not installed.`)
      }
    }

    try {
      // Execute the plugin's main installation logic.
      plugin.install(this, options, plugin.name)
      this._installedPlugins.add(plugin.name)
    } catch (error) {
      console.error(`Error installing plugin '${plugin.name}' on API '${this.options.name}':`, error)
      throw new Error(`Failed to install plugin '${plugin.name}': ${error.message}`)
    }
    return this
  }
}

/**
 * A utility function for testing environments to clear the global state between tests,
 * ensuring that tests are isolated and do not interfere with each other.
 */
export const resetGlobalRegistryForTesting = () => {
  globalRegistry = new Map()
}