
/**
 * Hooked API - A flexible API framework with hooks, plugins, and scopes
 * 
 * This library enables creation of extensible APIs where:
 * - Plugins can hook into any part of the API lifecycle
 * - Methods can be organized into logical scopes (like database tables)
 * - Every aspect can be customized and extended by users
 * 
 * Architecture overview:
 * - Api class: Main entry point, manages plugins, scopes, and methods
 * - Plugins: Reusable modules that extend API functionality
 * - Scopes: Logical groupings of methods (e.g., api.scopes.users.create())
 * - Hooks: Intercept points in method execution for customization
 * - Registry: Global storage for API instances with version management
 */

import semver from 'semver'

/**
 * Global registry stores all API instances by name
 * Enables cross-API communication and version management
 * Example: Api.registry.get('my-api') retrieves an API instance
 */
let globalRegistry = new Map()

/**
 * Validation patterns and security constants
 * These protect against code injection and ensure safe property names
 */
const VALID_JS_IDENTIFIER = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/
const DANGEROUS_PROPS = ['__proto__', 'constructor', 'prototype']
const isDangerousProp = (prop) => DANGEROUS_PROPS.includes(prop)

/**
 * Logging system configuration
 * 
 * The logging system is hierarchical - each level includes all lower levels:
 * - ERROR: Only critical errors that require immediate attention
 * - WARN: Warnings about potential issues
 * - INFO: General informational messages (default level)
 * - DEBUG: Detailed debugging information
 * - TRACE: Very detailed execution traces
 * 
 * Used throughout the system to provide insight into API operations,
 * hook execution, plugin loading, and method calls
 */
export const LogLevel = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
  TRACE: 4
}

/**
 * Mapping between numeric levels and their string names
 * Used for displaying human-readable log level names
 */
const LOG_LEVEL_NAMES = {
  0: 'ERROR',
  1: 'WARN',
  2: 'INFO',
  3: 'DEBUG',
  4: 'TRACE'
}

/**
 * Mapping from string names to numeric levels
 * Allows users to configure logging with strings like 'debug' or 'error'
 */
const LOG_LEVEL_VALUES = {
  'error': 0,
  'warn': 1,
  'info': 2,
  'debug': 3,
  'trace': 4
}

/**
 * ANSI color codes for terminal output
 * Makes logs more readable by color-coding different log levels
 * Can be disabled by setting environment variables or using custom loggers
 */
const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
}

/**
 * Maps log levels to their display colors
 * ERROR=red, WARN=yellow, etc. for quick visual identification
 */
const LOG_COLORS = {
  ERROR: COLORS.red,
  WARN: COLORS.yellow,
  INFO: COLORS.blue,
  DEBUG: COLORS.magenta,
  TRACE: COLORS.gray
}

/**
 * Custom error hierarchy for precise error handling
 * 
 * All Hooked API errors extend from HookedApiError, allowing:
 * - Catch all library errors with `catch (e instanceof HookedApiError)`
 * - Specific error handling based on error type
 * - Rich error context with additional properties
 * - Consistent error codes for programmatic handling
 */

/**
 * Base error class for all Hooked API errors
 * Provides consistent error structure with name, message, code, and stack trace
 */
export class HookedApiError extends Error {
  constructor(message, code = 'HOOKED_API_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Thrown when API configuration is invalid
 * 
 * Common scenarios:
 * - Invalid API name or version format
 * - Missing required configuration options
 * - Type mismatches in configuration objects
 * 
 * Provides 'received', 'expected', and 'example' properties to help
 * developers quickly identify and fix configuration issues
 */
export class ConfigurationError extends HookedApiError {
  constructor(message, { received, expected, example } = {}) {
    super(message, 'CONFIGURATION_ERROR');
    this.received = received;
    this.expected = expected;
    this.example = example;
  }
}

/**
 * Thrown when a plugin requires npm packages that aren't installed
 * 
 * Provides actionable error messages with install commands for both npm and yarn.
 * Can include context about which plugin method or feature requires the dependency.
 * 
 * Example error message:
 * ```
 * ExpressPlugin requires additional dependencies.
 * 
 * Please install:
 *   npm install express
 * 
 * Or with yarn:
 *   yarn add express
 * 
 * Express framework for creating HTTP endpoints
 * ```
 */
export class PluginDependencyError extends HookedApiError {
  constructor(pluginName, packages, description = '', context = {}) {
    const packageList = Array.isArray(packages) ? packages : [packages];
    const npmInstall = `npm install ${packageList.join(' ')}`;
    const yarnAdd = `yarn add ${packageList.join(' ')}`;
    
    let message = `${pluginName} plugin requires additional dependencies.\n\n`;
    message += `Please install:\n`;
    message += `  ${npmInstall}\n\n`;
    message += `Or with yarn:\n`;
    message += `  ${yarnAdd}\n`;
    
    if (description) {
      message += `\n${description}\n`;
    }
    
    if (context.method) {
      message += `\nRequired by: ${pluginName}.${context.method}()`;
    }
    
    if (context.feature) {
      message += `\nNeeded for: ${context.feature}`;
    }

    super(message, 'PLUGIN_DEPENDENCY_ERROR');
    this.pluginName = pluginName;
    this.packages = packageList;
    this.context = context;
  }
}

/**
 * Thrown when input validation fails
 * 
 * Used throughout the system to validate:
 * - Method names (must be valid JavaScript identifiers)
 * - Scope names (cannot use dangerous properties)
 * - Hook names and placements
 * - Parameter types and values
 * 
 * Includes the invalid field, value, and list of valid values when applicable
 */
export class ValidationError extends HookedApiError {
  constructor(message, { field, value, validValues } = {}) {
    super(message, 'VALIDATION_ERROR');
    this.field = field;
    this.value = value;
    this.validValues = validValues;
  }
}

/**
 * Thrown when plugin operations fail
 * 
 * Common causes:
 * - Missing plugin dependencies
 * - Duplicate plugin names
 * - Invalid plugin structure (missing name or install function)
 * - Plugin installation errors
 * 
 * Provides context about which plugin failed and what plugins are installed
 */
export class PluginError extends HookedApiError {
  constructor(message, { pluginName, installedPlugins } = {}) {
    super(message, 'PLUGIN_ERROR');
    this.pluginName = pluginName;
    this.installedPlugins = installedPlugins;
  }
}

/**
 * Thrown when scope operations fail
 * 
 * Typical scenarios:
 * - Accessing a scope that doesn't exist
 * - Creating a scope with an invalid name
 * - Scope method execution failures
 * 
 * Lists available scopes to help developers identify typos or missing scopes
 */
export class ScopeError extends HookedApiError {
  constructor(message, { scopeName, availableScopes } = {}) {
    super(message, 'SCOPE_ERROR');
    this.scopeName = scopeName;
    this.availableScopes = availableScopes;
  }
}

/**
 * Thrown when method operations fail
 * 
 * Common issues:
 * - Calling a method that doesn't exist
 * - Method execution errors
 * - Invalid method names during creation
 * 
 * Includes suggestions for fixing the error when possible
 */
export class MethodError extends HookedApiError {
  constructor(message, { methodName, suggestion } = {}) {
    super(message, 'METHOD_ERROR');
    this.methodName = methodName;
    this.suggestion = suggestion;
  }
}

/**
 * Main API class - the entry point for creating extensible APIs
 * 
 * The Api class orchestrates the entire system:
 * - Manages plugins and their lifecycle
 * - Organizes methods into scopes
 * - Handles hook registration and execution
 * - Provides logging and error handling
 * - Maintains state through vars and helpers
 * 
 * Usage:
 * ```javascript
 * const api = new Api({ name: 'my-api', version: '1.0.0' });
 * api.customize({ ... });  // Add methods, hooks, vars
 * await api.use(plugin);   // Install plugins
 * api.addScope('users');   // Create scopes
 * ```
 */
export class Api {
  /**
   * Creates a new API instance
   * 
   * @param {Object} options - Configuration options
   * @param {string} options.name - Unique name for this API (required)
   * @param {string} options.version - Semantic version (default: '1.0.0')
   * @param {Object} options.logging - Logging configuration
   * 
   * The constructor:
   * 1. Validates configuration (name and version)
   * 2. Sets up internal state management
   * 3. Initializes the logging system
   * 4. Registers the API in the global registry
   * 5. Sets up proxy for scope access (api.scopes.xxx)
   */
  constructor(options = {}) {
    /**
     * Default logging configuration
     * Can be overridden via options.logging
     */
    const defaultLogging = {
      level: 'info',
      format: 'pretty',
      timestamp: true,
      colors: true,
      logger: console
    };
    
    /**
     * Merge user options with defaults
     * Ensures all required options are present
     */
    this.options = {
      name: null,
      version: '1.0.0',
      ...options
    }
    
    /**
     * Deep merge logging options to preserve defaults
     * while allowing partial overrides
     */
    this.options.logging = { ...defaultLogging, ...(options.logging || {}) }

    /**
     * Validate API name - required for registry and identification
     * The name is used to:
     * - Register the API globally
     * - Generate plugin names
     * - Create meaningful error messages
     */
    if (typeof this.options.name !== 'string' || this.options.name.trim() === '') {
      const received = this.options.name === undefined ? 'undefined' : 
                      this.options.name === null ? 'null' : 
                      this.options.name === '' ? 'empty string' :
                      `${typeof this.options.name} "${this.options.name}"`;
      throw new ConfigurationError(
        `API instance must have a non-empty name property. Received: ${received}. Example: new Api({ name: 'my-api', version: '1.0.0' })`,
        { 
          received: this.options.name,
          expected: 'non-empty string',
          example: "new Api({ name: 'my-api', version: '1.0.0' })"
        }
      );
    }
    /**
     * Validate version format using semver
     * Semantic versioning enables:
     * - Version compatibility checks
     * - Registry version management
     * - Plugin dependency resolution
     */
    if (!semver.valid(this.options.version)) {
      const versionType = typeof this.options.version;
      const suggestion = versionType === 'string' ? 
        `Did you mean '${this.options.version}.0' or '${this.options.version}.0.0'?` :
        `Version must be a string in semver format (e.g., '1.0.0', '2.1.3').`;
      throw new ConfigurationError(
        `Invalid version format for API '${this.options.name}'. Received: ${versionType === 'string' ? `'${this.options.version}'` : versionType}. ${suggestion}`,
        {
          received: this.options.version,
          expected: 'semver format (e.g., 1.0.0)',
          example: "{ version: '1.0.0' }"
        }
      );
    }

    /**
     * Initialize internal state management
     * All internal properties use underscore prefix to:
     * - Avoid conflicts with user-defined properties
     * - Clearly separate internal vs public API
     * - Enable proxy-based access control
     */
    
    /** Hook storage: Map<hookName, Array<{plugin, name, priority, handler}>> */
    this._hooks = new Map()
    
    /** Variable storage for shared state across methods */
    this._vars = new Map()
    
    /** Helper function storage for reusable logic */
    this._helpers = new Map()
    
    /** API-level methods (e.g., api.create(), api.update()) */
    this._apiMethods = new Map()
    
    /** Scope-level method templates (applied to all scopes) */
    this._scopeMethods = new Map()
    
    /** Track installed plugins to prevent duplicates */
    this._installedPlugins = new Set()
    
    /** Scope instances with their own vars, helpers, and methods */
    this._scopes = new Map()
    
    /** Frozen copy of API options for secure context passing */
    this._apiOptions = { ...this.options }
    
    /** Mutable plugin options that plugins can modify */
    this._pluginOptions = {}
    
    /** Custom scope property name (e.g., 'tables' instead of 'scopes') */
    this._scopeAlias = null
    
    /** Custom addScope method name (e.g., 'addTable' instead of 'addScope') */
    this._addScopeAlias = null
    
    /**
     * Initialize the logging system
     * Supports both string ('debug', 'info') and numeric (0-4) log levels
     * Falls back to INFO level if invalid
     */
    let logLevel;
    if (typeof this.options.logging.level === 'string') {
      logLevel = LOG_LEVEL_VALUES[this.options.logging.level.toLowerCase()];
      if (logLevel === undefined) {
        logLevel = LogLevel.INFO;
      }
    } else if (typeof this.options.logging.level === 'number') {
      // Validate numeric log level is in valid range
      if (this.options.logging.level >= 0 && this.options.logging.level <= 4) {
        logLevel = this.options.logging.level;
      } else {
        throw new ConfigurationError(
          `Log level must be between 0 (ERROR) and 4 (TRACE). Received: ${this.options.logging.level}`,
          {
            received: this.options.logging.level,
            expected: '0-4 or error/warn/info/debug/trace',
            example: "{ logging: { level: 'debug' } }"
          }
        );
      }
    } else {
      logLevel = LogLevel.INFO;
    }
    this._logLevel = logLevel;
    this._logger = this._createLogger()
    
    /**
     * Create secure proxy objects for vars and helpers
     * 
     * These proxies:
     * - Provide object-like access to Map storage (vars.myVar instead of vars.get('myVar'))
     * - Prevent prototype pollution by filtering dangerous properties
     * - Are used internally when building method contexts
     * - Enable clean, intuitive API for plugins and methods
     */
    this._varsProxy = new Proxy({}, {
      get: (target, prop) => this._vars.get(prop),
      set: (target, prop, value) => {
        // Prevent prototype pollution
        if (isDangerousProp(prop)) {
          return true; // Silently ignore but return true to prevent TypeError
        }
        this._vars.set(prop, value);
        return true;
      }
    })
    this._helpersProxy = new Proxy({}, {
      get: (target, prop) => this._helpers.get(prop),
      set: (target, prop, value) => {
        // Prevent prototype pollution
        if (isDangerousProp(prop)) {
          return true; // Silently ignore but return true to prevent TypeError
        }
        this._helpers.set(prop, value);
        return true;
      }
    })
    
    /**
     * Create the main scopes proxy for intuitive API access
     * 
     * This enables the elegant syntax: api.scopes.users.create()
     * The proxy chain works as follows:
     * 1. api.scopes[scopeName] returns a scope proxy
     * 2. scope[methodName] returns the bound method
     * 3. method(params) executes with full context
     * 
     * Security features:
     * - Filters out symbols and dangerous properties
     * - Returns undefined for non-existent scopes
     * - Provides helpful error messages for misuse
     */
    this.scopes = new Proxy({}, {
      get: (target, scopeName) => {
        // Prevent prototype pollution and symbol-based bypasses
        if (typeof scopeName === 'symbol' || isDangerousProp(scopeName)) {
          return undefined;
        }
        
        if (!this._scopes.has(scopeName)) return undefined;
        
        /**
         * Return a scope proxy that handles method access
         * The function wrapper provides a helpful error if someone
         * tries to call the scope directly: api.scopes.users()
         */
        return new Proxy((...args) => {
          throw new MethodError(
            `Direct scope call not supported. Use api.scopes.${scopeName}.methodName() instead`,
            {
              methodName: scopeName,
              suggestion: `api.scopes.${scopeName}.methodName()`
            }
          );
        }, {
          get: (target, prop) => {
            /**
             * Handle method access on a scope
             * Filters numeric properties to prevent array-like access
             * Prioritizes scope-specific methods over global scope methods
             */
            if (typeof prop === 'string' && !prop.match(/^\d+$/)) {
              const scopeConfig = this._scopes.get(scopeName);
              if (!scopeConfig) {
                return undefined;
              }
              
              // Check for vars and helpers access
              if (prop === 'vars') {
                return scopeConfig._varsProxy;
              }
              if (prop === 'helpers') {
                return scopeConfig._helpersProxy;
              }
              
              // Find handler - check scope-specific methods first, then global scope methods
              const handler = scopeConfig._scopeMethods?.get(prop) || this._scopeMethods.get(prop);
              if (!handler) {
                return undefined; // No method found
              }
              
              /**
               * Return the bound method function
               * This function executes when the user calls api.scopes.users.create()
               * It sets up the execution context and handles the entire method lifecycle
               */
              return async (params = {}, initialContext = {}) => {
                const startTime = Date.now();
                
                // Disabled due to circular reference issues when params contain non-serializable objects
                // console.log(`🚀 [HOOKED-API-PROXY] Scope method '${prop}' called on '${scopeName}' with params:`, JSON.stringify(params, null, 2));
                this._logger.debug(`Scope method '${prop}' called on '${scopeName}'`, { params });
                
                /**
                 * Create a fresh context object for this method call
                 * This context is passed through hooks and to the method handler
                 * Allows data sharing between hooks and methods
                 */
                const context = initialContext;
                
                /**
                 * Build a scope-aware context that includes:
                 * - Merged vars (global + scope-specific)
                 * - Merged helpers (global + scope-specific)
                 * - Scope-specific options and metadata
                 */
                const scopeContext = this._buildScopeContext(scopeName);
                
                /**
                 * Prepare the complete parameter object for the method handler
                 * This provides everything a method needs to execute:
                 * - User inputs (params, context)
                 * - Data access (vars, helpers, scopes)
                 * - Capabilities (runHooks, log)
                 * - Metadata (names, options)
                 */
                const handlerParams = { 
                  // User data
                  params,           // Method parameters from the caller
                  context,          // Mutable context for hook/method communication
                  
                  // Data access (scope-aware)
                  vars: scopeContext.vars,                 // Merged variables (global + scope)
                  helpers: scopeContext.helpers,           // Merged helpers (global + scope)
                  scope: scopeContext.scopes[scopeName],   // The current scope object
                  scopes: scopeContext.scopes,             // All scopes proxy
                  
                  // Capabilities
                  runHooks: (name) => scopeContext.runHooks(name, context),  // Hook execution
                  log: scopeContext.log,                   // Logging function
                  
                  // Metadata
                  name: prop,                              // Method name
                  apiOptions: scopeContext.apiOptions,     // Frozen API configuration
                  pluginOptions: scopeContext.pluginOptions, // Mutable plugin options
                  scopeOptions: scopeContext.scopeOptions, // Scope-specific options
                  scopeName: scopeName                     // Current scope name
                };
                
                /**
                 * Add scope alias if configured
                 * Example: If scopeAlias is 'tables', adds handlerParams.tables = scopes
                 * Allows plugins to use custom terminology
                 */
                if (this._scopeAlias) {
                  handlerParams[this._scopeAlias] = scopeContext.scopes;
                }
                
                /**
                 * Execute the method with error handling and performance tracking
                 * Logs both successful completions and failures with timing info
                 */
                try {
                  const result = await handler(handlerParams);
                  const duration = Date.now() - startTime;
                  this._logger.debug(`Scope method '${prop}' on '${scopeName}' completed`, { duration: `${duration}ms` });
                  return result;
                } catch (error) {
                  const duration = Date.now() - startTime;
                  this._logger.error(`Scope method '${prop}' on '${scopeName}' failed`, { error: error.message, duration: `${duration}ms` });
                  throw error;
                }
              };
            }
            return target[prop];
          },
          apply: (target, thisArg, args) => {
            return target(...args);
          }
        });
      }
    });

    /**
     * Register this API instance in the global registry
     * Enables cross-API communication and version management
     */
    this._register()
    
    /**
     * Expose certain internal methods as public API
     * These are core functionality that users need direct access to
     */
    this.addScope = this._addScope;
    this.setScopeAlias = this._setScopeAlias;
    
    /**
     * Create the main API proxy
     * 
     * This proxy enables dynamic method access:
     * - API methods take precedence (api.create(), api.update())
     * - Falls back to regular properties (api.use, api.customize)
     * - Provides clean API surface without exposing internals
     * 
     * The proxy is returned instead of 'this' to control access
     */
    const proxy = new Proxy(this, {
      get(target, prop, receiver) {
        /**
         * Check for API methods first
         * These are dynamically added methods like api.create(), api.find()
         */
        // Check for vars and helpers access
        if (prop === 'vars') {
          return target._varsProxy;
        }
        if (prop === 'helpers') {
          return target._helpersProxy;
        }
        
        if (target._apiMethods.has(prop)) {
          /**
           * Return a bound async function that executes the method
           * with full context, logging, and error handling
           */
          return async (params = {}, initialContext = {}) => {
            const startTime = Date.now();
            const handler = target._apiMethods.get(prop);
            
            target._logger.debug(`API method '${prop}' called`, { params });
            
            /**
             * Create a fresh context for this API method call
             * Similar to scope methods, this enables hook/method communication
             */
            const context = initialContext;
            
            /**
             * Create a bound logger for this method's context
             * Includes method name in all log messages
             */
            const log = target._createContextLogger(prop);
            
            // Create flattened handler context
            const handlerParams = { 
              // User data
              params,
              context,
              
              // Data access
              vars: target._varsProxy,
              helpers: target._helpersProxy,
              scope: null,           // No current scope for global methods
              scopes: target.scopes,  // All scopes proxy
              
              // Capabilities
              runHooks: (name) => target._runHooks(name, context, null),
              log,
              
              // Metadata
              name: prop,
              apiOptions: Object.freeze({ ...target._apiOptions }),
              pluginOptions: Object.freeze({ ...target._pluginOptions })
              // No scopeName or scopeOptions for global methods
            };
            
            // Add alias if one is set
            if (target._scopeAlias) {
              handlerParams[target._scopeAlias] = target.scopes;
            }
            
            try {
              const result = await handler(handlerParams);
              const duration = Date.now() - startTime;
              target._logger.debug(`API method '${prop}' completed`, { duration: `${duration}ms` });
              return result;
            } catch (error) {
              const duration = Date.now() - startTime;
              target._logger.error(`API method '${prop}' failed`, { error: error.message, duration: `${duration}ms` });
              throw error;
            }
          };
        }
        // Fall back to actual properties
        return Reflect.get(target, prop, receiver);
      }
    });
    
    /*
    // Apply customize options if provided
    const { hooks, apiMethods, scopeMethods, vars, helpers } = customizeOptions;
    if (hooks || apiMethods || scopeMethods || vars || helpers) {
      proxy.customize(customizeOptions);
    }
    */

    return proxy;
  }
  
  /**
   * Sanitizes objects for logging to prevent verbose output from function-heavy objects
   * 
   * @private
   * @param {*} obj - Object to sanitize
   * @param {Set} [visited=new Set()] - Set to track visited objects (prevents circular references)
   * @param {number} [depth=0] - Current recursion depth
   * @param {number} [maxDepth=5] - Maximum recursion depth
   * @returns {*} Sanitized version of the object
   * 
   * This method:
   * - Replaces functions with "[Function]"
   * - Replaces objects with many function properties with "[Object with methods]"
   * - Preserves primitive values and simple objects
   * - Handles circular references
   * - Limits recursion depth for performance
   */
  _sanitizeForLogging(obj, visited = new Set(), depth = 0, maxDepth = 5) {
    // Handle primitives and null
    if (obj === null || typeof obj !== 'object') {
      return typeof obj === 'function' ? '[Function]' : obj;
    }
    
    // Handle circular references
    if (visited.has(obj)) {
      return '[Circular]';
    }
    
    // Limit recursion depth
    if (depth > maxDepth) {
      return '[Object too deep]';
    }
    
    visited.add(obj);
    
    // Handle arrays
    if (Array.isArray(obj)) {
      const result = obj.map(item => this._sanitizeForLogging(item, visited, depth + 1, maxDepth));
      visited.delete(obj);
      return result;
    }
    
    // Handle objects
    const keys = Object.keys(obj);
    const functionCount = keys.filter(key => typeof obj[key] === 'function').length;
    
    // If more than 50% of properties are functions, it's likely a class instance
    if (functionCount > 0 && functionCount >= keys.length * 0.5) {
      visited.delete(obj);
      return '[Object with methods]';
    }
    
    // Otherwise, recursively sanitize properties
    const result = {};
    for (const key of keys) {
      try {
        const value = obj[key];
        result[key] = typeof value === 'function' 
          ? '[Function]' 
          : this._sanitizeForLogging(value, visited, depth + 1, maxDepth);
      } catch (error) {
        // Handle getters that throw
        result[key] = '[Error reading property]';
      }
    }
    
    visited.delete(obj);
    return result;
  }
  
  /**
   * Formats and outputs log messages with appropriate styling
   * 
   * @private
   * @param {number} level - Log level (0-4)
   * @param {string} message - Log message
   * @param {*} data - Optional data to log
   * @param {string} context - Optional context (e.g., 'users.create')
   * @param {string} apiName - Name of the API instance
   * @param {Object} loggingOpts - Logging configuration
   * @param {Object} customLogger - Logger instance (console or custom)
   * 
   * Features:
   * - Color coding for different log levels (when colors enabled)
   * - Timestamp support (ISO format)
   * - JSON format option for structured logging
   * - Context-aware prefixes for tracking log sources
   */
  _formatAndOutput(level, message, data, context, apiName, loggingOpts, customLogger) {
    const levelName = LOG_LEVEL_NAMES[level];
    const timestamp = loggingOpts.timestamp ? new Date().toISOString() : '';
    
    /**
     * Build the log prefix with optional colors and context
     * Format: [TIMESTAMP] [LEVEL] [API:CONTEXT] MESSAGE
     */
    let prefix = '';
    if (loggingOpts.format === 'pretty' && loggingOpts.colors && customLogger === console) {
      const color = LOG_COLORS[levelName];
      prefix = `${color}[${levelName}]${COLORS.reset}`;
      if (context) {
        prefix += ` ${COLORS.cyan}[${apiName}${context ? ':' + context : ''}]${COLORS.reset}`;
      } else {
        prefix += ` ${COLORS.cyan}[${apiName}]${COLORS.reset}`;
      }
    } else {
      prefix = `[${levelName}] [${apiName}${context ? ':' + context : ''}]`;
    }
    
    if (timestamp) {
      prefix = `${timestamp} ${prefix}`;
    }
    
    // Format the message
    let output = `${prefix} ${message}`;
    
    /**
     * Output the log message using the appropriate method
     * - JSON format: Always use log() with structured data
     * - Pretty format: Use error(), warn(), or log() based on level
     * - Includes data parameter when provided
     */
    if (data !== undefined) {
      // Sanitize the data before logging
      const sanitizedData = this._sanitizeForLogging(data);
      
      if (loggingOpts.format === 'json') {
        customLogger.log(JSON.stringify({ level: levelName, api: apiName, context, message, data: sanitizedData, timestamp }));
      } else {
        if (level === LogLevel.ERROR) {
          customLogger.error(output, sanitizedData);
        } else if (level === LogLevel.WARN) {
          customLogger.warn(output, sanitizedData);
        } else {
          customLogger.log(output, sanitizedData);
        }
      }
    } else {
      if (loggingOpts.format === 'json') {
        customLogger.log(JSON.stringify({ level: levelName, api: apiName, context, message, timestamp }));
      } else {
        if (level === LogLevel.ERROR) {
          customLogger.error(output);
        } else if (level === LogLevel.WARN) {
          customLogger.warn(output);
        } else {
          customLogger.log(output);
        }
      }
    }
  }

  /**
   * Creates a logger instance for this API
   * 
   * @private
   * @returns {Object} Logger with error, warn, info, debug, trace methods
   * 
   * The logger:
   * - Respects the configured log level (only logs at or below the level)
   * - Supports custom loggers (must have log, error, warn methods)
   * - Provides context-aware logging for better debugging
   * - Handles both pretty (colored) and JSON output formats
   */
  _createLogger() {
    const apiName = this.options.name;
    const loggingOpts = this.options.logging;
    const customLogger = loggingOpts.logger;
    
    /**
     * Core logging function used by all log level methods
     * Checks log level before processing to avoid unnecessary work
     */
    const log = (level, message, data, context) => {
      // Check if this log level is enabled FIRST, before any work
      if (level > this._logLevel) return;
      
      // Delegate formatting and output to shared function
      this._formatAndOutput(level, message, data, context, apiName, loggingOpts, customLogger);
    };
    
    return {
      error: (msg, data, ctx) => log(LogLevel.ERROR, msg, data, ctx),
      warn: (msg, data, ctx) => log(LogLevel.WARN, msg, data, ctx),
      info: (msg, data, ctx) => log(LogLevel.INFO, msg, data, ctx),
      debug: (msg, data, ctx) => log(LogLevel.DEBUG, msg, data, ctx),
      trace: (msg, data, ctx) => log(LogLevel.TRACE, msg, data, ctx)
    };
  }
  
  /**
   * Creates a context-aware logger for specific operations
   * 
   * @private
   * @param {string} contextName - Context identifier (e.g., 'users.create', 'plugin:auth')
   * @param {number|null} scopeLogLevel - Optional scope-specific log level
   * @returns {Function} Logger function with level-specific methods
   * 
   * Context loggers are used to:
   * - Add context information to all log messages
   * - Support scope-specific log levels (different scopes can have different verbosity)
   * - Track operations through complex execution paths
   * - Provide consistent logging interface across all components
   */
  _createContextLogger(contextName, scopeLogLevel = null) {
    // Check if we should use scope-specific log level
    const effectiveLogLevel = scopeLogLevel !== null ? scopeLogLevel : this._logLevel;
    const apiName = this.options.name;
    const loggingOpts = this.options.logging;
    const customLogger = loggingOpts.logger;
    
    const log = (level, msg, data) => {
      // Check against the EFFECTIVE level, not the API level
      if (level > effectiveLogLevel) return;
      
      // Delegate formatting and output to shared function
      this._formatAndOutput(level, msg, data, contextName, apiName, loggingOpts, customLogger);
    };
    
    const logger = (msg, data) => log(LogLevel.INFO, msg, data);
    logger.error = (msg, data) => log(LogLevel.ERROR, msg, data);
    logger.warn = (msg, data) => log(LogLevel.WARN, msg, data);
    logger.info = (msg, data) => log(LogLevel.INFO, msg, data);
    logger.debug = (msg, data) => log(LogLevel.DEBUG, msg, data);
    logger.trace = (msg, data) => log(LogLevel.TRACE, msg, data);
    
    return logger;
  }

  /**
   * Registers this API instance in the global registry
   * 
   * @private
   * @returns {Api} This instance for chaining
   * @throws {ConfigurationError} If the API name/version combination already exists
   * 
   * Registration enables:
   * - Cross-API communication via Api.registry.get()
   * - Version management with semver support
   * - Plugin dependency resolution across APIs
   * - Global API discovery and introspection
   */
  _register() {
    const { name, version } = this.options

    // Ensure the API name has a version map
    if (!globalRegistry.has(name)) {
      globalRegistry.set(name, new Map())
    }

    // Check for duplicate registrations
    if (globalRegistry.get(name).has(version)) {
      const existingVersions = Array.from(globalRegistry.get(name).keys()).sort(semver.rcompare);
      throw new ConfigurationError(
        `API '${name}' version '${version}' is already registered. Existing versions: ${existingVersions.join(', ')}. Use a different version number or get the existing instance with Api.registry.get('${name}', '${version}').`,
        {
          received: version,
          expected: 'unique version number',
          example: `Api.registry.get('${name}', '${version}')`
        }
      );
    }

    // Register this instance
    globalRegistry.get(name).set(version, this)
    return this
  }

  /**
   * Static registry for global API instance management
   * 
   * The registry provides:
   * - API instance retrieval by name and version
   * - Semver range queries (e.g., '^1.0.0', '~2.1.0')
   * - 'latest' version selection
   * - API discovery and listing
   * 
   * This enables plugins and external code to access APIs
   * without direct references, supporting loose coupling
   */
  static registry = {
    /**
     * Retrieves an API instance by name and version
     * 
     * @param {string} apiName - Name of the API to retrieve
     * @param {string} version - Version or range (default: 'latest')
     * @returns {Api|null} The API instance or null if not found
     * 
     * Version can be:
     * - 'latest' - Returns the highest version
     * - Exact version - '1.0.0' returns that specific version
     * - Semver range - '^1.0.0' returns highest matching version
     */
    get(apiName, version = 'latest') {
      const versions = globalRegistry.get(apiName)
      if (!versions) return null;

      // Try exact match first
      if (version !== 'latest' && versions.has(version)) {
        return versions.get(version);
      }

      // Special case for 'latest' - return highest version
      if (version === 'latest') {
        const sortedVersions = Array.from(versions.entries())
          .sort(([a], [b]) => semver.compare(b, a));
        return sortedVersions[0]?.[1] || null;
      }

      // Handle empty string explicitly
      if (version === '') {
        return null;
      }
      
      // Validate the version string
      if (!semver.validRange(version)) {
        return null;
      }

      // Check if this is an exact version request
      if (semver.valid(version)) {
        // Exact version was requested but doesn't exist
        return null;
      }

      // Handle semver range queries
      const sortedVersions = Array.from(versions.entries())
        .sort(([a], [b]) => semver.compare(b, a));
      
      for (const [ver, api] of sortedVersions) {
        if (semver.satisfies(ver, version)) {
          return api;
        }
      }

      return null;
    },

    /**
     * Lists all registered APIs and their versions
     * 
     * @returns {Object} Map of API names to sorted version arrays
     * 
     * Example return value:
     * {
     *   'my-api': ['2.0.0', '1.5.0', '1.0.0'],
     *   'auth-api': ['1.0.0']
     * }
     */
    list() {
      const registry = {}
      for (const [apiName, versionsMap] of globalRegistry) {
        registry[apiName] = Array.from(versionsMap.keys()).sort(semver.rcompare)
      }
      return registry
    },

    /**
     * Checks if an API (and optionally specific version) exists
     * 
     * @param {string} apiName - Name of the API
     * @param {string} [version] - Optional specific version
     * @returns {boolean} True if exists
     */
    has(apiName, version) {
      if (!apiName) return false;
      const versions = globalRegistry.get(apiName);
      if (!versions) return false;
      return version ? versions.has(version) : versions.size > 0;
    },

    /**
     * Gets all versions for a specific API
     * 
     * @param {string} apiName - Name of the API
     * @returns {string[]} Array of versions sorted newest first
     */
    versions(apiName) {
      const versions = globalRegistry.get(apiName);
      return versions ? Array.from(versions.keys()).sort(semver.rcompare) : [];
    }
  }

  /**
   * Adds a hook handler to the hook execution chain
   * 
   * @private
   * @param {string} hookName - Name of the hook (e.g., 'beforeCreate')
   * @param {string} pluginName - Name of the plugin adding the hook
   * @param {string} functionName - Name of the function for debugging
   * @param {Object} hookAddOptions - Placement options
   * @param {Function} handler - The hook handler function
   * @returns {Api} This instance for chaining
   * 
   * Hook placement options:
   * - beforePlugin: Insert before all hooks from specified plugin
   * - afterPlugin: Insert after all hooks from specified plugin
   * - beforeFunction: Insert before specific function
   * - afterFunction: Insert after specific function
   * - No option: Append to end of chain
   * 
   * Hooks are the core extensibility mechanism, allowing plugins
   * to intercept and modify behavior at defined points
   */
  _addHook(hookName, pluginName, functionName, hookAddOptions, handler) {
    // Validate plugin name is provided
    if (!pluginName?.trim()) {
      const received = pluginName === undefined ? 'undefined' : pluginName === null ? 'null' : `empty string "${pluginName}"`;
      throw new ValidationError(
        `Hook '${hookName}' requires a valid plugin name. Received: ${received}. Plugin name must be a non-empty string.`,
        {
          field: 'pluginName',
          value: pluginName,
          validValues: 'non-empty string'
        }
      );
    }
    if (!functionName?.trim()) {
      const received = functionName === undefined ? 'undefined' : functionName === null ? 'null' : `empty string "${functionName}"`;
      throw new ValidationError(
        `Hook '${hookName}' requires a valid function name. Received: ${received}. Function name must be a non-empty string.`,
        {
          field: 'functionName',
          value: functionName,
          validValues: 'non-empty string'
        }
      );
    }
    if (typeof handler !== 'function') {
      throw new ValidationError(
        `Hook '${hookName}' handler must be a function. Received: ${typeof handler}. Example: addHook('hookName', 'pluginName', 'functionName', {}, async (context) => { /* handler code */ })`,
        {
          field: 'handler',
          value: handler,
          validValues: 'function'
        }
      );
    }

    /**
     * Validate that only one placement option is specified
     * Multiple placement options would be ambiguous
     */
    const placements = [hookAddOptions.beforePlugin, hookAddOptions.afterPlugin, hookAddOptions.beforeFunction, hookAddOptions.afterFunction].filter(Boolean);
    if (placements.length > 1) {
      const specified = [];
      if (hookAddOptions.beforePlugin) specified.push(`beforePlugin: '${hookAddOptions.beforePlugin}'`);
      if (hookAddOptions.afterPlugin) specified.push(`afterPlugin: '${hookAddOptions.afterPlugin}'`);
      if (hookAddOptions.beforeFunction) specified.push(`beforeFunction: '${hookAddOptions.beforeFunction}'`);
      if (hookAddOptions.afterFunction) specified.push(`afterFunction: '${hookAddOptions.afterFunction}'`);
      throw new ValidationError(
        `Hook '${hookName}' can only specify one placement parameter, but got ${placements.length}: ${specified.join(', ')}. Use only one of: beforePlugin, afterPlugin, beforeFunction, or afterFunction.`,
        {
          field: 'placement',
          value: specified,
          validValues: ['beforePlugin', 'afterPlugin', 'beforeFunction', 'afterFunction']
        }
      );
    }

    /**
     * Initialize hook array if needed and create handler entry
     * Each hook name maps to an array of handler objects
     */
    if (!this._hooks.has(hookName)) {
      this._hooks.set(hookName, [])
    }
    
    const handlers = this._hooks.get(hookName)
    const entry = { handler, pluginName, functionName }

    // No placement specified - append to end
    if (placements.length === 0) {
      handlers.push(entry)
      return this
    }

    /**
     * Helper functions for finding hook positions
     * findIndex: First occurrence (for 'before' placements)
     * findLastIndex: Last occurrence (for 'after' placements)
     */
    const findIndex = (arr, key, value) => arr.findIndex(h => h[key] === value)
    const findLastIndex = (arr, key, value) => {
      for (let i = arr.length - 1; i >= 0; i--) {
        if (arr[i][key] === value) return i
      }
      return -1
    }

    /**
     * Calculate insertion index based on placement options
     * - beforePlugin: Insert before first hook from that plugin
     * - afterPlugin: Insert after last hook from that plugin
     * - beforeFunction: Insert before specific function
     * - afterFunction: Insert after specific function
     */
    let index = -1
    if (hookAddOptions.beforePlugin) {
      index = findIndex(handlers, 'pluginName', hookAddOptions.beforePlugin)
    } else if (hookAddOptions.afterPlugin) {
      index = findLastIndex(handlers, 'pluginName', hookAddOptions.afterPlugin)
      if (index !== -1) index++ // Insert after the found position
    } else if (hookAddOptions.beforeFunction) {
      index = findIndex(handlers, 'functionName', hookAddOptions.beforeFunction)
    } else if (hookAddOptions.afterFunction) {
      index = findIndex(handlers, 'functionName', hookAddOptions.afterFunction)
      if (index !== -1) index++ // Insert after the found position
    }

    /**
     * Insert the hook at the calculated position
     * If placement target not found, append to end as fallback
     */
    if (index === -1) {
      handlers.push(entry)
    } else {
      handlers.splice(index, 0, entry)
    }
    return this
  }

  /**
   * Builds a context object for scope-aware method execution
   * 
   * @private
   * @param {string} scopeName - Name of the scope
   * @returns {Object} Context with merged vars, helpers, and scope-specific settings
   * @throws {ScopeError} If scope doesn't exist
   * 
   * This method creates a specialized context that:
   * - Merges global and scope-specific vars (scope takes precedence)
   * - Merges global and scope-specific helpers (scope takes precedence)
   * - Provides scope-aware logging with optional custom log levels
   * - Freezes options to prevent modification during execution
   * 
   * The context is rebuilt for each method call to ensure isolation
   */
  _buildScopeContext(scopeName) {
    const scopeConfig = this._scopes.get(scopeName);
    if (!scopeConfig) {
      const availableScopes = Array.from(this._scopes.keys());
      const suggestion = availableScopes.length > 0 ? 
        `Available scopes: ${availableScopes.join(', ')}` : 
        'No scopes have been defined. Use api.addScope(name, options) to create a scope first.';
      throw new ScopeError(
        `Scope '${scopeName}' not found. ${suggestion}`,
        {
          scopeName,
          availableScopes
        }
      );
    }
    
    /**
     * Handle scope-specific logging configuration
     * Scopes can have their own log levels for fine-grained control
     * Example: Set 'debug' for problematic scopes while keeping global at 'info'
     */
    const scopeLogLevel = scopeConfig.options?.logging?.level;
    const effectiveLogLevel = scopeLogLevel !== undefined ? 
      (typeof scopeLogLevel === 'string' ? LOG_LEVEL_VALUES[scopeLogLevel.toLowerCase()] : scopeLogLevel) :
      null;
    
    // Create logger for scope context
    const log = this._createContextLogger(scopeName, effectiveLogLevel);
    
    // Return flattened context for scope handlers - now using pre-built proxies
    return {
      vars: scopeConfig._varsProxy,      // Use pre-built proxy
      helpers: scopeConfig._helpersProxy, // Use pre-built proxy
      scopes: this.scopes,
      runHooks: (name, context) => this._runHooks(name, context, scopeName),
      log,
      apiOptions: Object.freeze({ ...this._apiOptions }),
      pluginOptions: Object.freeze({ ...this._pluginOptions }),
      scopeOptions: scopeConfig.options
    };
  }
  
  /**
   * Builds a context object for global (non-scope) operations
   * 
   * @private
   * @returns {Object} Context for global method execution
   * 
   * Similar to scope context but without scope-specific data:
   * - Uses global vars and helpers directly
   * - No scope merging or precedence
   * - Used for API-level methods and global hooks
   */
  _buildGlobalContext() {
    // Create logger for global context
    const log = this._createContextLogger('global');
    
    // Return flattened context for global handlers - already using proxies
    return {
      vars: this._varsProxy,      // Already a proxy
      helpers: this._helpersProxy, // Already a proxy
      scopes: this.scopes,
      runHooks: this._runHooks.bind(this),
      log,
      apiOptions: Object.freeze({ ...this._apiOptions }),
      pluginOptions: Object.freeze({ ...this._pluginOptions })
    };
  }

  /**
   * Executes all handlers for a specific hook
   * 
   * @private
   * @param {string} name - Hook name (e.g., 'beforeCreate')
   * @param {Object} context - Mutable context object shared between hooks
   * @param {Object} params - Method parameters
   * @param {string|null} scopeName - Current scope name if applicable
   * @returns {Promise<boolean>} True if all hooks passed, false if chain was stopped
   * 
   * Hook execution features:
   * - Sequential execution in registration order
   * - Chain stopping: Return false to prevent further hooks
   * - Error propagation: Thrown errors stop execution
   * - Performance tracking: Logs timing for each handler
   * - Context sharing: All hooks receive the same context object
   */
  async _runHooks(name, context, scopeName = null) {
    const handlers = this._hooks.get(name) || []
    if (handlers.length === 0) {
      this._logger.trace(`No handlers for hook '${name}'${scopeName ? ` in scope '${scopeName}'` : ''}`);
      return true;
    }
    
    const hookContext = scopeName ? `${scopeName}:${name}` : name;
    this._logger.debug(`Running hook '${name}'${scopeName ? ` for scope '${scopeName}'` : ''}`, { handlerCount: handlers.length });
    
    const handlerContext = scopeName ? this._buildScopeContext(scopeName) : this._buildGlobalContext();
    
    /**
     * Execute each hook handler in sequence
     * Track success and allow chain interruption
     */
    let handlerIndex = 0;
    let allSuccessful = true;
    for (const { handler, pluginName, functionName } of handlers) {
      const startTime = Date.now();
      this._logger.trace(`Hook handler '${functionName}' starting`, { plugin: pluginName, hook: name, scope: scopeName });
        
        /**
         * Prepare comprehensive parameters for hook handlers
         * Provides everything a hook might need to modify behavior
         */
        const handlerParams = { 
          // User data
          context,
          
          // Data access
          vars: handlerContext.vars,
          helpers: handlerContext.helpers,
          scope: scopeName ? handlerContext.scopes[scopeName] : null,  // Current scope if in scope context
          scopes: handlerContext.scopes,                        // All scopes proxy
          
          // Capabilities
          runHooks: handlerContext.runHooks,
          log: handlerContext.log,
          
          // Metadata
          name,
          apiOptions: handlerContext.apiOptions,
          pluginOptions: handlerContext.pluginOptions,
          scopeOptions: handlerContext.scopeOptions,
          scopeName
        };
        
        // Add alias if one is set
        if (this._scopeAlias) {
          handlerParams[this._scopeAlias] = handlerContext.scopes;
        }
        
        /**
         * Execute hook with error handling
         * - False return value stops the chain
         * - Exceptions propagate and stop execution
         * - All other returns continue the chain
         */
        try {
          const result = await handler(handlerParams);
          const duration = Date.now() - startTime;
          
          if (result === false) {
            this._logger.debug(`Hook handler '${functionName}' stopped chain`, { plugin: pluginName, hook: name, duration: `${duration}ms` });
            allSuccessful = false;
            break; // Stop processing further hooks
          } else {
            this._logger.trace(`Hook handler '${functionName}' completed`, { plugin: pluginName, hook: name, duration: `${duration}ms` });
          }
        } catch (error) {
          const duration = Date.now() - startTime;
          this._logger.error(`Hook handler '${functionName}' failed`, { 
            plugin: pluginName, 
            hook: name, 
            error: error.message, 
            duration: `${duration}ms` 
          });
          throw error; // Propagate error to method caller
        }
        
        handlerIndex++;
    }
    
    this._logger.debug(`Hook '${name}' completed${scopeName ? ` for scope '${scopeName}'` : ''}`, { handlersRun: handlerIndex });
    return allSuccessful;
  }

  
  /**
   * Adds a method directly to the API instance
   * 
   * @private
   * @param {string} method - Method name
   * @param {Function} handler - Method implementation
   * @returns {Api} This instance for chaining
   * @throws {ValidationError} If method name is invalid
   * @throws {MethodError} If method conflicts with existing property
   * 
   * API methods are accessible directly on the API instance:
   * api.myMethod() instead of api.scopes.something.myMethod()
   * 
   * Used for global operations that don't belong to a specific scope
   */
  async _addApiMethod(method, handler) {
    if (!method || typeof method !== 'string') {
      const received = method === undefined ? 'undefined' : 
                      method === null ? 'null' : 
                      method === '' ? 'empty string' :
                      `${typeof method} "${method}"`;
      throw new ValidationError(
        `Method name must be a non-empty string. Received: ${received}. Example: addApiMethod('getData', async (context) => { /* handler */ })`,
        {
          field: 'method',
          value: method,
          validValues: 'non-empty string'
        }
      );
    }
    if (!VALID_JS_IDENTIFIER.test(method)) {
      const invalidChars = method.match(/[^a-zA-Z0-9_$]/g);
      const suggestion = invalidChars ? 
        `Remove invalid characters: ${[...new Set(invalidChars)].join(', ')}` :
        'Method name must start with a letter, underscore, or $';
      throw new ValidationError(
        `Method name '${method}' is not a valid JavaScript identifier. ${suggestion}. Valid examples: getData, _private, $special, method123`,
        {
          field: 'method',
          value: method,
          validValues: 'valid JavaScript identifier'
        }
      );
    }
    if (isDangerousProp(method)) {
      throw new ValidationError(
        `Method name '${method}' is reserved for security reasons. These names can lead to prototype pollution vulnerabilities. Choose a different name.`,
        {
          field: 'method',
          value: method,
          validValues: 'non-dangerous JavaScript identifier'
        }
      );
    }
    if (typeof handler !== 'function') {
      throw new ValidationError(
        `Implementation for '${method}' must be a function. Received: ${typeof handler}. Example: addApiMethod('${method}', async (context) => { /* handler code */ })`,
        {
          field: 'handler',
          value: handler,
          validValues: 'function'
        }
      );
    }
    
    /**
     * Check for property conflicts
     * API methods become properties on the proxy, so they can't
     * conflict with existing properties or methods
     */
    if (method in this) {
      const propertyType = typeof this[method];
      const suggestion = this._apiMethods.has(method) ? 
        'This method was already defined. Use a different name or remove the previous definition.' :
        `This conflicts with an existing ${propertyType} property. Choose a different method name.`;
      throw new MethodError(
        `Cannot define API method '${method}': property already exists on API instance. ${suggestion}`,
        {
          methodName: method,
          suggestion
        }
      );
    }
    
    this._apiMethods.set(method, handler)
    this._logger.trace(`Added API method '${method}'`);
    
    // Run hook for plugins to react to method creation, passing mutable context
    // Hooks can potentially wrap or replace the handler here.
    const hookContext = {
      methodName: method,
      handler: handler // Pass the handler in context for potential modification
    };
    await this._runHooks('method:api:added', hookContext);

    // Apply any handler mutations made by hooks back to the stored method
    this._apiMethods.set(method, hookContext.handler);
    
    return this
  }

  /**
   * Adds a method template that will be available on all scopes
   * 
   * @private
   * @param {string} method - Method name
   * @param {Function} handler - Method implementation
   * @returns {Api} This instance for chaining
   * @throws {ValidationError} If method name is invalid
   * 
   * Scope methods are templates that get applied to every scope:
   * - api.scopes.users.list()
   * - api.scopes.posts.list()
   * - api.scopes.comments.list()
   * 
   * The handler receives scopeName in its context to know which
   * scope it's operating on
   */
  async _addScopeMethod(method, handler) {
    if (!method || typeof method !== 'string') {
      const received = method === undefined ? 'undefined' : 
                      method === null ? 'null' : 
                      method === '' ? 'empty string' :
                      `${typeof method} "${method}"`;
      throw new ValidationError(
        `Scope method name must be a non-empty string. Received: ${received}. Example: addScopeMethod('list', async (context) => { /* handler */ })`,
        {
          field: 'method',
          value: method,
          validValues: 'non-empty string'
        }
      );
    }
    if (!VALID_JS_IDENTIFIER.test(method)) {
      const invalidChars = method.match(/[^a-zA-Z0-9_$]/g);
      const suggestion = invalidChars ? 
        `Remove invalid characters: ${[...new Set(invalidChars)].join(', ')}` :
        'Method name must start with a letter, underscore, or $';
      throw new ValidationError(
        `Scope method name '${method}' is not a valid JavaScript identifier. ${suggestion}. Valid examples: getData, _private, $special, method123`,
        {
          field: 'method', 
          value: method,
          validValues: 'valid JavaScript identifier'
        }
      );
    }
    if (isDangerousProp(method)) {
      throw new ValidationError(
        `Scope method name '${method}' is reserved for security reasons. These names can lead to prototype pollution vulnerabilities. Choose a different name.`,
        {
          field: 'method',
          value: method,
          validValues: 'non-dangerous JavaScript identifier'
        }
      );
    }
    if (typeof handler !== 'function') {
      throw new ValidationError(
        `Implementation for scope method '${method}' must be a function. Received: ${typeof handler}. Example: addScopeMethod('${method}', async (context) => { /* handler code */ })`,
        {
          field: 'handler',
          value: handler,
          validValues: 'function'
        }
      )
    }
    
    // Run hook before adding the scope method, allowing mutation or checks
    const hookContext = {
      methodName: method,
      handler: handler // Pass the handler in context for potential modification
    };
    await this._runHooks('method:scope:adding', hookContext);

    // Scope methods don't need property conflict checking since they're not on the main API
    this._scopeMethods.set(method, handler)
    this._logger.trace(`Added scope method '${method}'`);
    
    // Run hook after adding the scope method
    await this._runHooks('method:scope:added', hookContext);

    return this
  }

  /**
   * Customizes the API with hooks, methods, vars, and helpers
   * 
   * @param {Object} options - Customization options
   * @param {Object} options.hooks - Hook definitions
   * @param {Object} options.apiMethods - API-level methods
   * @param {Object} options.scopeMethods - Scope method templates
   * @param {Object} options.vars - Shared variables
   * @param {Object} options.helpers - Helper functions
   * @returns {Api} This instance for chaining
   * 
   * This is the main method for extending an API without plugins.
   * It's used internally by plugins and can be called directly:
   * 
   * api.customize({
   *   hooks: { beforeCreate: async (ctx) => {...} },
   *   apiMethods: { backup: async (ctx) => {...} },
   *   scopeMethods: { count: async (ctx) => {...} },
   *   vars: { config: { timeout: 5000 } },
   *   helpers: { validate: (data) => {...} }
   * })
   */
  async customize({ hooks = {}, apiMethods = {}, scopeMethods = {}, vars = {}, helpers = {} } = {}) {
    /**
     * Process hook definitions
     * Hooks can be functions or objects with handler and placement options
     */
    for (const [hookName, hookDef] of Object.entries(hooks)) {
      let handler, functionName, hookAddOptions
      
      if (typeof hookDef === 'function') {
        handler = hookDef
        functionName = hookName
        hookAddOptions = {}
      } else if (hookDef && typeof hookDef === 'object') {
        handler = hookDef.handler
        functionName = hookDef.functionName || hookName
        const { handler: _, functionName: __, ...rest } = hookDef
        hookAddOptions = rest
      } else {
        const received = hookDef === undefined ? 'undefined' : 
                        hookDef === null ? 'null' : 
                        `${typeof hookDef}`;
        throw new ValidationError(
          `Hook '${hookName}' must be a function or object. Received: ${received}. Examples:\n` +
          `  As function: hooks: { myHook: async (context) => { /* code */ } }\n` +
          `  As object: hooks: { myHook: { handler: async (context) => { /* code */ }, beforePlugin: 'other-plugin' } }`,
          {
            field: 'hookDef',
            value: hookDef,
            validValues: 'function or object'
          }
        )
      }
      
      if (typeof handler !== 'function') {
        const received = handler === undefined ? 'undefined' : `${typeof handler}`;
        throw new ValidationError(
          `Hook '${hookName}' must have a function handler. Received: ${received}. ` +
          `When using object syntax, provide: { handler: async (context) => { /* code */ } }`,
          {
            field: 'handler',
            value: handler,
            validValues: 'function'
          }
        )
      }
      
      /**
       * Add hook with special plugin name for customize() calls
       * This helps identify hooks added via customize vs plugins
       */
      this._addHook(hookName, `api-custom:${this.options.name}`, functionName, hookAddOptions, handler)
    }

    /**
     * Process variables - stored in Map for efficient access
     * Variables are shared state accessible in all methods and hooks
     */
    for (const [varName, value] of Object.entries(vars)) {
      this._vars.set(varName, value);
    }

    /**
     * Process helpers - reusable functions available in methods
     * Helpers don't receive context automatically, they're just functions
     */
    for (const [helperName, value] of Object.entries(helpers)) {
      this._helpers.set(helperName, value);
    }

    /**
     * Process API methods - become available on the API instance
     */
    for (const [methodName, handler] of Object.entries(apiMethods)) {
      await this._addApiMethod(methodName, handler);
    }

    /**
     * Process scope methods - become available on all scopes
     */
    for (const [methodName, handler] of Object.entries(scopeMethods)) {
      await this._addScopeMethod(methodName, handler);
    }

    return this;
  }






  
  /**
   * Creates a new scope with its own methods, vars, and configuration
   * 
   * @private
   * @param {string} name - Scope name (e.g., 'users', 'posts')
   * @param {Object} options - Scope configuration (frozen and stored)
   * @param {Object} extras - Additional customizations
   * @returns {Api} This instance for chaining
   * @throws {ValidationError} If scope name is invalid
   * @throws {ScopeError} If scope already exists
   * 
   * Scopes are the primary organizational unit in Hooked API:
   * - Each scope represents a logical grouping (often a database table)
   * - Scopes have their own vars, helpers, and methods
   * - Scope methods have access to both global and scope-specific data
   * - Scopes can have custom logging levels and configuration
   */
async _addScope(name, options = {}, extras = {}) {
  // Initial validation - This block remains exactly as it was.
    if (!name || typeof name !== 'string') {
      const received = name === undefined ? 'undefined' :
                      name === null ? 'null' :
                      name === '' ? 'empty string' :
                      `${typeof name} "${name}"`;
      throw new ValidationError(
        `Scope name must be a non-empty string. Received: ${received}. Example: api.addScope('users', { /* options */ })`,
        {
          field: 'name',
          value: name,
          validValues: 'non-empty string'
        }
      );
    }
    if (!VALID_JS_IDENTIFIER.test(name)) {
      const invalidChars = name.match(/[^a-zA-Z0-9_$]/g);
      const suggestion = invalidChars ?
        `Remove invalid characters: ${[...new Set(invalidChars)].join(', ')}` :
        'Scope name must start with a letter, underscore, or $';
      throw new ValidationError(
        `Scope name '${name}' is not a valid JavaScript identifier. ${suggestion}. Valid examples: users, _private, $special, scope123`,
        {
          field: 'name',
          value: name,
          validValues: 'valid JavaScript identifier'
        }
      );
    }
    if (isDangerousProp(name)) {
      throw new ValidationError(
        `Scope name '${name}' is reserved for security reasons. These names can lead to prototype pollution vulnerabilities. Choose a different name.`,
        {
          field: 'name',
          value: name,
          validValues: 'non-dangerous JavaScript identifier'
        }
      );
    }
    if (this._scopes.has(name)) {
      const existingScopes = Array.from(this._scopes.keys());
      throw new ScopeError(
        `Scope '${name}' already exists. Existing scopes: ${existingScopes.join(', ')}. Use a different name or remove the existing scope first.`,
        {
          scopeName: name,
          availableScopes: existingScopes
        }
      );
    }

    // Extract extras at the beginning of the logic block
    const { hooks = {}, apiMethods = {}, scopeMethods = {}, vars = {}, helpers = {} } = extras;

    // Log what's being added
    const additions = [];
    if (Object.keys(hooks).length > 0) additions.push(`${Object.keys(hooks).length} hooks`);
    if (Object.keys(apiMethods).length > 0) additions.push(`${Object.keys(apiMethods).length} api methods`);
    if (Object.keys(scopeMethods).length > 0) additions.push(`${Object.keys(scopeMethods).length} scope methods`);
    if (Object.keys(vars).length > 0) additions.push(`${Object.keys(vars).length} vars`);
    if (Object.keys(helpers).length > 0) additions.push(`${Object.keys(helpers).length} helpers`);

    if (additions.length > 0) {
      this._logger.trace(`Scope '${name}' includes: ${additions.join(', ')}`);
    }

    /**
     * Initialize scope configuration.
     * Options are frozen after setup, but internal maps are mutable through their proxies.
     */
    const scopeConfig = {
      options: { ...options }, // User-provided options (will be frozen after hooks)
      _apiMethods: new Map(Object.entries(apiMethods)),
      _scopeMethods: new Map(Object.entries(scopeMethods)),
      _vars: new Map(Object.entries(vars)),
      _helpers: new Map(Object.entries(helpers))
    };

    /**
     * Create scope-specific vars proxy.
     * Checks scope vars first, then falls back to global vars.
     * This proxy interacts directly with `scopeConfig._vars`.
     */
    scopeConfig._varsProxy = new Proxy({}, {
      get: (target, prop) => {
        if (isDangerousProp(prop)) return undefined;
        if (scopeConfig._vars.has(prop)) {
          return scopeConfig._vars.get(prop);
        }
        return this._vars.get(prop); // Fallback to global vars
      },
      set: (target, prop, value) => {
        if (isDangerousProp(prop)) {
          this._logger.warn(`Attempted to set dangerous property '${prop}' on scope '${name}' vars. Ignored.`);
          return true; // Silently ignore but return true to prevent TypeError
        }
        scopeConfig._vars.set(prop, value);
        return true;
      },
      // Ensure iteration/inspection works for proxies
      ownKeys: (target) => Array.from(new Set([...scopeConfig._vars.keys(), ...this._vars.keys()])),
      getOwnPropertyDescriptor: (target, prop) => {
        if (isDangerousProp(prop)) return undefined;
        if (scopeConfig._vars.has(prop)) {
          return { value: scopeConfig._vars.get(prop), enumerable: true, configurable: true };
        }
        // Fallback to global proxy's descriptor if it's there
        return Object.getOwnPropertyDescriptor(this._varsProxy, prop);
      }
    });

    /**
     * Create scope-specific helpers proxy.
     * Checks scope helpers first, then falls back to global helpers.
     * This proxy interacts directly with `scopeConfig._helpers`.
     */
    scopeConfig._helpersProxy = new Proxy({}, {
      get: (target, prop) => {
        if (isDangerousProp(prop)) return undefined;
        if (scopeConfig._helpers.has(prop)) {
          return scopeConfig._helpers.get(prop);
        }
        return this._helpers.get(prop); // Fallback to global helpers
      },
      set: (target, prop, value) => {
        if (isDangerousProp(prop)) {
          this._logger.warn(`Attempted to set dangerous property '${prop}' on scope '${name}' helpers. Ignored.`);
          return true;
        }
        scopeConfig._helpers.set(prop, value);
        return true;
      },
      // Ensure iteration/inspection works for proxies
      ownKeys: (target) => Array.from(new Set([...scopeConfig._helpers.keys(), ...this._helpers.keys()])),
      getOwnPropertyDescriptor: (target, prop) => {
        if (isDangerousProp(prop)) return undefined;
        if (scopeConfig._helpers.has(prop)) {
          return { value: scopeConfig._helpers.get(prop), enumerable: true, configurable: true };
        }
        // Fallback to global proxy's descriptor if it's there
        return Object.getOwnPropertyDescriptor(this._helpersProxy, prop);
      }
    });

    // Add the scope configuration to the scopes map NOW.
    // This makes it discoverable by _buildScopeContext and future lookups.
    this._scopes.set(name, scopeConfig);

    this._logger.info(`Scope '${name}' added successfully`);

    // Build scope context for the informational hook.
    // This context contains proxies for vars/helpers and basic info.
    const informationalScopeContext = {
        scopeName: name, // Main piece of info
        scopeOptions: { ...options }, // Immutable copy of initial options
        scopeExtras: { ...extras },   // Immutable copy of initial extras (for informational purposes)
        vars: scopeConfig._varsProxy,    // Proxy for current scope vars (can be mutated via proxy methods)
        helpers: scopeConfig._helpersProxy, // Proxy for current scope helpers (can be mutated via proxy methods)
        // Note: Direct access to _vars, _helpers, _scopeMethods Maps is intentionally NOT provided here,
        // aligning with the "informational only" and no direct internal mutation principle for system hooks.
    };

    // Run the 'scope:added' hook. The context is an informational object.
    await this._runHooks('scope:added', informationalScopeContext);

    // Freeze the original options of the scopeConfig *after* the informational hook has run.
    // This doesn't apply to `informationalScopeContext.scopeOptions` as that's a copy.
    scopeConfig.options = Object.freeze(scopeConfig.options);

    /**
     * Process scope-specific hooks defined in `extras.hooks`.
     * This needs to be done *after* the scope is added to `this._scopes`
     * so that the `_addHook` method can correctly find and attribute them.
     */
    for (const [hookName, hookDef] of Object.entries(hooks)) {
      let handler, functionName, hookAddOptions

      if (typeof hookDef === 'function') {
        handler = hookDef
        functionName = hookName
        hookAddOptions = {}
      } else if (hookDef && typeof hookDef === 'object') {
        handler = hookDef.handler
        functionName = hookDef.functionName || hookName
        const { handler: _, functionName: __, ...rest } = hookDef
        hookAddOptions = rest
      } else {
        const received = hookDef === undefined ? 'undefined' :
                         hookDef === null ? 'null' :
                         `${typeof hookDef}`;
        throw new ValidationError(
          `Hook '${hookName}' in scope '${name}' must be a function or object. Received: ${received}. Examples:\n` +
          `  As function: hooks: { myHook: async (context) => { /* code */ } }\n` +
          `  As object: hooks: { myHook: { handler: async (context) => { /* code */ }, beforePlugin: 'other-plugin' } }`,
          {
            field: 'hookDef',
            value: hookDef,
            validValues: 'function or object'
          }
        )
      }

      if (typeof handler !== 'function') {
        const received = handler === undefined ? 'undefined' : `${typeof handler}`;
        throw new ValidationError(
          `Hook '${hookName}' in scope '${name}' must have a function handler. Received: ${received}. ` +
          `When using object syntax, provide: { handler: async (context) => { /* code */ } }`,
          {
            field: 'handler',
            value: handler,
            validValues: 'function'
          }
        )
      }

      // Use the 'name' from the _addScope parameters as the scopeName for the wrapper
      const hookTargetScopeName = name;
      const wrappedHandler = (handlerParams) => {
        if (handlerParams.scopeName === hookTargetScopeName) {
          return handler(handlerParams);
        }
        // Return undefined (not false) to continue chain for other scopes
      };

      this._addHook(hookName, `scope-custom:${name}`, functionName, hookAddOptions, wrappedHandler)
      this._logger.trace(`Added scope-specific hook '${hookName}' for scope '${name}'`);
    }

    return this;
  }

  /**
   * Sets custom aliases for scope access and creation
   * 
   * @private
   * @param {string|null} aliasName - Alias for api.scopes (e.g., 'tables')
   * @param {string|null} addScopeAlias - Alias for api.addScope (e.g., 'addTable')
   * @returns {Api} This instance for chaining
   * @throws {ValidationError} If alias names are invalid
   * @throws {ConfigurationError} If aliases conflict with existing properties
   * 
   * This allows domain-specific naming:
   * - api.tables.users.find() instead of api.scopes.users.find()
   * - api.addTable('orders') instead of api.addScope('orders')
   * 
   * Aliases make APIs more intuitive for specific domains
   */
  _setScopeAlias(aliasName, addScopeAlias = null) {
    if (aliasName !== null || addScopeAlias !== null) {
      this._logger.debug(`Setting scope aliases`, { scopeAlias: aliasName, addScopeAlias });
    }
    
    // Handle scopes alias
    if (aliasName !== null) {
      if (typeof aliasName !== 'string' || !aliasName.trim()) {
        const received = aliasName === undefined ? 'undefined' : 
                        aliasName === '' ? 'empty string' :
                        `${typeof aliasName} "${aliasName}"`;
        throw new ValidationError(
          `Alias name must be a non-empty string. Received: ${received}. Example: api.setScopeAlias('resources')`,
          {
            field: 'aliasName',
            value: aliasName,
            validValues: 'non-empty string'
          }
        );
      }
      if (aliasName in this) {
        const propertyType = typeof this[aliasName];
        throw new ConfigurationError(
          `Cannot set scope alias '${aliasName}': property already exists on API instance (${propertyType}). Choose a different alias name.`,
          {
            received: aliasName,
            expected: 'unique property name',
            example: "api.setScopeAlias('resources')"
          }
        );
      }
      // Store the alias name
      this._scopeAlias = aliasName;
      // Create alias that points to the same proxy
      Object.defineProperty(this, aliasName, {
        get: () => this.scopes,
        enumerable: true,
        configurable: true
      });
    }
    
    // Handle addScope alias
    if (addScopeAlias !== null) {
      if (typeof addScopeAlias !== 'string' || !addScopeAlias.trim()) {
        const received = addScopeAlias === undefined ? 'undefined' : 
                        addScopeAlias === '' ? 'empty string' :
                        `${typeof addScopeAlias} "${addScopeAlias}"`;
        throw new ValidationError(
          `addScope alias must be a non-empty string. Received: ${received}. Example: api.setScopeAlias('resources', 'addResource')`,
          {
            field: 'addScopeAlias',
            value: addScopeAlias,
            validValues: 'non-empty string'
          }
        );
      }
      if (addScopeAlias in this) {
        const propertyType = typeof this[addScopeAlias];
        throw new ConfigurationError(
          `Cannot set addScope alias '${addScopeAlias}': property already exists on API instance (${propertyType}). Choose a different alias name.`,
          {
            received: addScopeAlias,
            expected: 'unique property name',
            example: "api.setScopeAlias('resources', 'addResource')"
          }
        );
      }
      // Store the addScope alias name
      this._addScopeAlias = addScopeAlias;
      // Create alias that points to the addScope method
      Object.defineProperty(this, addScopeAlias, {
        get: () => this.addScope,
        enumerable: true,
        configurable: true
      });
    }
    
    return this;
  }



  /**
   * Installs a plugin to extend the API functionality
   * 
   * @param {Object} plugin - Plugin object with name and install function
   * @param {string} plugin.name - Unique plugin identifier
   * @param {Function} plugin.install - Installation function (can be async)
   * @param {string[]} [plugin.dependencies] - Required plugin names
   * @param {Object} [options={}] - Plugin-specific options
   * @returns {Promise<Api>} This instance for chaining
   * @throws {PluginError} If plugin is invalid or dependencies missing
   * 
   * Plugins are the primary extension mechanism:
   * - Encapsulate related functionality
   * - Can depend on other plugins
   * - Receive a rich context during installation
   * - Can add hooks, methods, scopes, vars, and helpers
   * 
   * Example:
   * await api.use({
   *   name: 'auth',
   *   dependencies: ['session'],
   *   install: (ctx) => {
   *     ctx.addHook('beforeCreate', 'validateUser', {}, handler)
   *     ctx.addApiMethod('login', loginHandler)
   *   }
   * })
   */
  async use(plugin, options = {}) {
    if (typeof plugin !== 'object' || plugin === null) {
      const received = plugin === undefined ? 'undefined' : 
                      plugin === null ? 'null' : 
                      `${typeof plugin}`;
      throw new PluginError(
        `Plugin must be an object. Received: ${received}. Example: api.use({ name: 'my-plugin', install: (context) => { /* setup */ } })`,
        {
          pluginName: 'unknown',
          installedPlugins: Array.from(this._installedPlugins)
        }
      );
    }
    if (typeof plugin.name !== 'string' || plugin.name.trim() === '') {
      const received = plugin.name === undefined ? 'undefined (missing name property)' : 
                      plugin.name === null ? 'null' : 
                      plugin.name === '' ? 'empty string' :
                      `${typeof plugin.name} "${plugin.name}"`;
      throw new PluginError(
        `Plugin must have a non-empty name property. Received: ${received}. Example: { name: 'my-plugin', install: (context) => { /* setup */ } }`,
        {
          pluginName: 'unknown',
          installedPlugins: Array.from(this._installedPlugins)
        }
      );
    }
    if (typeof plugin.install !== 'function') {
      const received = plugin.install === undefined ? 'undefined (missing install property)' : `${typeof plugin.install}`;
      throw new PluginError(
        `Plugin '${plugin.name}' must have an install function. Received: ${received}. Example: { name: '${plugin.name}', install: (context) => { /* setup code */ } }`,
        {
          pluginName: plugin.name,
          installedPlugins: Array.from(this._installedPlugins)
        }
      );
    }

    /**
     * Check for reserved plugin names that would conflict
     * with core API properties
     */
    if (plugin.name === 'api' || plugin.name === 'scopes') {
      throw new PluginError(
        `Plugin name '${plugin.name}' is reserved. These names are used internally by the API. Choose a different name like '${plugin.name}-plugin' or 'custom-${plugin.name}'.`,
        {
          pluginName: plugin.name,
          installedPlugins: Array.from(this._installedPlugins)
        }
      );
    }

    if (this._installedPlugins.has(plugin.name)) {
      const installedPlugins = Array.from(this._installedPlugins);
      throw new PluginError(
        `Plugin '${plugin.name}' is already installed on API '${this.options.name}'. Installed plugins: ${installedPlugins.join(', ')}. Each plugin can only be installed once.`,
        {
          pluginName: plugin.name,
          installedPlugins
        }
      );
    }

    /**
     * Validate plugin dependencies are satisfied
     * This ensures plugins are installed in the correct order
     * and prevents runtime errors from missing dependencies
     */
    const dependencies = plugin.dependencies || []
    if (dependencies.length > 0) {
      this._logger.debug(`Checking dependencies for plugin '${plugin.name}'`, { dependencies });
    }
    
    for (const depName of dependencies) {
      if (!this._installedPlugins.has(depName)) {
        const installedPlugins = Array.from(this._installedPlugins);
        const suggestion = installedPlugins.length > 0 ? 
          `Installed plugins: ${installedPlugins.join(', ')}` : 
          'No plugins are currently installed';
        throw new PluginError(
          `Plugin '${plugin.name}' requires dependency '${depName}' which is not installed. ${suggestion}. Install '${depName}' first using api.use(${depName}Plugin).`,
          {
            pluginName: plugin.name,
            installedPlugins
          }
        );
      }
    }

    this._logger.info(`Installing plugin '${plugin.name}'`, { options });
    const startTime = Date.now();
    
    try {
      /**
       * Store plugin options in a frozen object
       * These are accessible to the plugin and other code
       * via apiOptions.pluginOptions[pluginName]
       */
      this._pluginOptions[plugin.name] = Object.freeze(options)
      
      // Create logger for plugin context
      const log = this._createContextLogger(`plugin:${plugin.name}`);
      
      /**
       * Create the installation context
       * This provides all the capabilities a plugin needs to
       * extend the API during its install phase
       */
      const api = this; // Capture this reference for closures
      const installContext = {
        /**
         * Setup methods - wrapped versions that log plugin attribution
         * This helps track which plugin added what functionality
         */
        addApiMethod: async (method, handler) => {
          if (api._logger) {
            api._logger.trace(`Plugin '${plugin.name}' adding API method '${method}'`);
          }
          return await api._addApiMethod.call(api, method, handler);
        },
        addScopeMethod: async (method, handler) => {
          api._logger.trace(`Plugin '${plugin.name}' adding scope method '${method}'`);
          return await api._addScopeMethod(method, handler);
        },
        addScope: async (name, options, extras) => {
          api._logger.trace(`Plugin '${plugin.name}' adding scope '${name}'`);
          return await api._addScope(name, options, extras);
        },
        setScopeAlias: (aliasName, addScopeAlias) => {
          api._logger.trace(`Plugin '${plugin.name}' setting scope alias '${aliasName}'`);
          return api._setScopeAlias(aliasName, addScopeAlias);
        },
        
        /**
         * Special addHook that automatically injects the plugin name
         * This ensures all hooks can be traced back to their source plugin
         */
        addHook: (hookName, functionName, hookAddOptions, handler) => {
          this._logger.trace(`Plugin '${plugin.name}' adding hook '${hookName}' with function '${functionName}'`);
          return this._addHook(hookName, plugin.name, functionName, hookAddOptions || {}, handler);
        },
        
        /**
         * Run hooks from plugin context
         * Allows plugins to create their own hookable operations
         */
        runHooks: (hookName, context = {}) => {
          api._logger.trace(`Plugin '${plugin.name}' running hooks for '${hookName}'`);
          return api._runHooks(hookName, context, null); // Pass context and scopeName
        },
        
        /**
         * Data access - plugins can read/write vars and helpers
         * during installation
         */
        vars: this._varsProxy,
        helpers: this._helpersProxy,
        scopes: this.scopes,
        
        // Plugin-specific logger
        log,
        
        /**
         * Plugin information and options
         * Options are frozen to prevent modification after installation
         */
        name: plugin.name,
        apiOptions: Object.freeze({ ...this._apiOptions }),
        pluginOptions: Object.freeze(options),
        context: {}, // Mutable context for plugin's internal use
        
        // Pass the API instance so plugins can create namespaces
        api: this
      };
      
      
      /**
       * Execute the plugin's install function
       * This is where the plugin sets up all its functionality
       */
      await plugin.install(installContext)
      
      // Mark plugin as installed to prevent duplicates and satisfy dependencies
      this._installedPlugins.add(plugin.name)
      
      const duration = Date.now() - startTime;
      this._logger.info(`Plugin '${plugin.name}' installed successfully`, { duration: `${duration}ms` });
      
      // Run hook for other plugins to react to this plugin installation
      await this._runHooks('plugin:installed', {
        pluginName: plugin.name,
        pluginOptions: options,
        plugin: plugin // The plugin object itself is informational context
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      this._logger.error(`Failed to install plugin '${plugin.name}'`, { error: error.message, duration: `${duration}ms` });
      
      /**
       * Wrap the error to provide plugin context
       * This helps developers identify which plugin caused the issue
       */
      throw new PluginError(
        `Failed to install plugin '${plugin.name}': ${error.message}`,
        {
          pluginName: plugin.name,
          installedPlugins: Array.from(this._installedPlugins)
        }
      )
    }
    return this
  }


  // Add this new public method to your Api class
  /**
   * Executes a system-wide hook, triggering all registered handlers for that hook.
   *
   * This method allows any part of your application or another plugin to initiate
   * a hook chain for a custom event or operation.
   *
   * @param {string} hookName - The name of the hook to run (e.g., 'beforeShutdown', 'dataImported').
   * @param {object} contextObject - A mutable object passed to all hook handlers.
   * Handlers can read from and modify this object to share state or influence subsequent hooks.
   * @returns {Promise<boolean>} True if all hooks completed successfully, false if a hook stopped the chain.
   * @throws {Error} If any hook handler throws an error, it will propagate.
   */
  async runHooks(hookName, contextObject) {
    if (typeof hookName !== 'string' || hookName.trim() === '') {
        throw new ValidationError('Hook name must be a non-empty string.', { field: 'hookName', value: hookName, validValues: 'non-empty string' });
    }
    if (typeof contextObject !== 'object' || contextObject === null) {
        throw new ValidationError('Context object must be a non-null object.', { field: 'contextObject', value: contextObject, validValues: 'object' });
    }
    return this._runHooks(hookName, contextObject, null);
  }

}

/**
 * Utility function to reset the global registry
 * 
 * This is primarily used for testing to ensure a clean state
 * between test runs. In production, the registry persists for
 * the lifetime of the process.
 * 
 * @example
 * import { resetGlobalRegistryForTesting } from 'hooked-api'
 * 
 * beforeEach(() => {
 *   resetGlobalRegistryForTesting()
 * })
 */
export const resetGlobalRegistryForTesting = () => {
  globalRegistry = new Map()
}

/**
 * Helper function for plugins to throw consistent dependency errors
 * 
 * @param {string} packageName - The npm package that's missing
 * @param {string} pluginName - The plugin that requires it
 * @param {string} [description] - Optional description of what the package is used for
 * @returns {never} Always throws PluginDependencyError
 * 
 * @example
 * try {
 *   const express = await import('express');
 * } catch (e) {
 *   throw requirePackage('express', 'Express');
 * }
 */
export function requirePackage(packageName, pluginName, description = '') {
  throw new PluginDependencyError(
    pluginName,
    packageName,
    description || `Required for ${pluginName} plugin to function`
  );
}