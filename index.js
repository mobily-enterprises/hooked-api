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
 * api.use(plugin);         // Install plugins
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
              return async (params = {}) => {
                const startTime = Date.now();
                const methodContext = `${scopeName}.${prop}`;
                
                this._logger.debug(`Scope method '${prop}' called on '${scopeName}'`, { params });
                
                /**
                 * Create a fresh context object for this method call
                 * This context is passed through hooks and to the method handler
                 * Allows data sharing between hooks and methods
                 */
                const context = {};
                
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
                  runHooks: (name) => scopeContext.runHooks(name, context, params),  // Hook execution
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
        if (target._apiMethods.has(prop)) {
          /**
           * Return a bound async function that executes the method
           * with full context, logging, and error handling
           */
          return async (params = {}) => {
            const startTime = Date.now();
            const handler = target._apiMethods.get(prop);
            
            target._logger.debug(`API method '${prop}' called`, { params });
            
            /**
             * Create a fresh context for this API method call
             * Similar to scope methods, this enables hook/method communication
             */
            const context = {};
            
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
              runHooks: (name) => target._runHooks(name, context, params),
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
      if (loggingOpts.format === 'json') {
        customLogger.log(JSON.stringify({ level: levelName, api: apiName, context, message, data, timestamp }));
      } else {
        if (level === LogLevel.ERROR) {
          customLogger.error(output, data);
        } else if (level === LogLevel.WARN) {
          customLogger.warn(output, data);
        } else {
          customLogger.log(output, data);
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

  _register() {
    const { name, version } = this.options

    if (!globalRegistry.has(name)) {
      globalRegistry.set(name, new Map())
    }

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

    globalRegistry.get(name).set(version, this)
    return this
  }

  static registry = {
    get(apiName, version = 'latest') {
      const versions = globalRegistry.get(apiName)
      if (!versions) return null;

      if (version !== 'latest' && versions.has(version)) {
        return versions.get(version);
      }

      // Special case for 'latest'
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

      // Handle range queries
      const sortedVersions = Array.from(versions.entries())
        .sort(([a], [b]) => semver.compare(b, a));
      
      for (const [ver, api] of sortedVersions) {
        if (semver.satisfies(ver, version)) {
          return api;
        }
      }

      return null;
    },

    list() {
      const registry = {}
      for (const [apiName, versionsMap] of globalRegistry) {
        registry[apiName] = Array.from(versionsMap.keys()).sort(semver.rcompare)
      }
      return registry
    },

    has(apiName, version) {
      if (!apiName) return false;
      const versions = globalRegistry.get(apiName);
      if (!versions) return false;
      return version ? versions.has(version) : versions.size > 0;
    },

    versions(apiName) {
      const versions = globalRegistry.get(apiName);
      return versions ? Array.from(versions.keys()).sort(semver.rcompare) : [];
    }
  }

  _addHook(hookName, pluginName, functionName, hookAddOptions, handler) {
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

    if (!this._hooks.has(hookName)) {
      this._hooks.set(hookName, [])
    }
    
    const handlers = this._hooks.get(hookName)
    const entry = { handler, pluginName, functionName }

    if (placements.length === 0) {
      handlers.push(entry)
      return this
    }

    const findIndex = (arr, key, value) => arr.findIndex(h => h[key] === value)
    const findLastIndex = (arr, key, value) => {
      for (let i = arr.length - 1; i >= 0; i--) {
        if (arr[i][key] === value) return i
      }
      return -1
    }

    let index = -1
    if (hookAddOptions.beforePlugin) {
      index = findIndex(handlers, 'pluginName', hookAddOptions.beforePlugin)
    } else if (hookAddOptions.afterPlugin) {
      index = findLastIndex(handlers, 'pluginName', hookAddOptions.afterPlugin)
      if (index !== -1) index++
    } else if (hookAddOptions.beforeFunction) {
      index = findIndex(handlers, 'functionName', hookAddOptions.beforeFunction)
    } else if (hookAddOptions.afterFunction) {
      index = findIndex(handlers, 'functionName', hookAddOptions.afterFunction)
      if (index !== -1) index++
    }

    if (index === -1) {
      // Placement target not found - add to end
      handlers.push(entry)
    } else {
      handlers.splice(index, 0, entry)
    }
    return this
  }

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
    
    // Merge vars: scope vars take precedence
    const mergedVars = new Map([
      ...this._vars,
      ...scopeConfig._vars
    ]);
    const varsProxy = new Proxy({}, {
      get: (target, prop) => mergedVars.get(prop),
      set: (target, prop, value) => {
        // Prevent prototype pollution
        if (isDangerousProp(prop)) {
          return true; // Silently ignore but return true to prevent TypeError
        }
        mergedVars.set(prop, value);
        return true;
      }
    });
    
    // Merge helpers: scope helpers take precedence
    const mergedHelpers = new Map([
      ...this._helpers,
      ...scopeConfig._helpers
    ]);
    const helpersProxy = new Proxy({}, {
      get: (target, prop) => mergedHelpers.get(prop),
      set: (target, prop, value) => {
        // Prevent prototype pollution
        if (isDangerousProp(prop)) {
          return true; // Silently ignore but return true to prevent TypeError
        }
        mergedHelpers.set(prop, value);
        return true;
      }
    });
    
    // Keep options separate and frozen
    
    // Check for scope-specific log level
    const scopeLogLevel = scopeConfig.options?.logging?.level;
    const effectiveLogLevel = scopeLogLevel !== undefined ? 
      (typeof scopeLogLevel === 'string' ? LOG_LEVEL_VALUES[scopeLogLevel.toLowerCase()] : scopeLogLevel) :
      null;
    
    // Create logger for scope context
    const log = this._createContextLogger(scopeName, effectiveLogLevel);
    
    // Return flattened context for scope handlers
    return {
      vars: varsProxy,
      helpers: helpersProxy,
      scopes: this.scopes,
      runHooks: (name, context, params) => this._runHooks(name, context, params, scopeName),
      log,
      apiOptions: Object.freeze({ ...this._apiOptions }),
      pluginOptions: Object.freeze({ ...this._pluginOptions }),
      scopeOptions: scopeConfig.options
    };
  }
  
  _buildGlobalContext() {
    // Create logger for global context
    const log = this._createContextLogger('global');
    
    // Return flattened context for global handlers
    return {
      vars: this._varsProxy,
      helpers: this._helpersProxy,
      scopes: this.scopes,
      runHooks: this._runHooks.bind(this),
      log,
      apiOptions: Object.freeze({ ...this._apiOptions }),
      pluginOptions: Object.freeze({ ...this._pluginOptions })
    };
  }

  async _runHooks(name, context, params = {}, scopeName = null) {
    const handlers = this._hooks.get(name) || []
    if (handlers.length === 0) {
      this._logger.trace(`No handlers for hook '${name}'${scopeName ? ` in scope '${scopeName}'` : ''}`);
      return true;
    }
    
    const hookContext = scopeName ? `${scopeName}:${name}` : name;
    this._logger.debug(`Running hook '${name}'${scopeName ? ` for scope '${scopeName}'` : ''}`, { handlerCount: handlers.length });
    
    const handlerContext = scopeName ? this._buildScopeContext(scopeName) : this._buildGlobalContext();
    
    let handlerIndex = 0;
    let allSuccessful = true;
    for (const { handler, pluginName, functionName } of handlers) {
      const startTime = Date.now();
      this._logger.trace(`Hook handler '${functionName}' starting`, { plugin: pluginName, hook: name, scope: scopeName });
        // Flatten the handler parameters
        const handlerParams = { 
          // User data
          methodParams: params,
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
        
        try {
          const result = await handler(handlerParams);
          const duration = Date.now() - startTime;
          
          if (result === false) {
            this._logger.debug(`Hook handler '${functionName}' stopped chain`, { plugin: pluginName, hook: name, duration: `${duration}ms` });
            allSuccessful = false;
            break;
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
          throw error;
        }
        
        handlerIndex++;
    }
    
    this._logger.debug(`Hook '${name}' completed${scopeName ? ` for scope '${scopeName}'` : ''}`, { handlersRun: handlerIndex });
    return allSuccessful;
  }


  _addApiMethod(method, handler) {
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
    
    // Check if property already exists on the instance or prototype chain
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
    return this
  }

  _addScopeMethod(method, handler) {
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
    
    // Scope methods don't need property conflict checking since they're not on the main API
    this._scopeMethods.set(method, handler)
    this._logger.trace(`Added scope method '${method}'`);
    return this
  }

  customize({ hooks = {}, apiMethods = {}, scopeMethods = {}, vars = {}, helpers = {} } = {}) {
    // Process hooks
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
      
      this._addHook(hookName, `api-custom:${this.options.name}`, functionName, hookAddOptions, handler)
    }

    // Process vars
    for (const [varName, value] of Object.entries(vars)) {
      this._vars.set(varName, value);
    }

    // Process helpers
    for (const [helperName, value] of Object.entries(helpers)) {
      this._helpers.set(helperName, value);
    }

    // Process apiMethods
    for (const [methodName, handler] of Object.entries(apiMethods)) {
      this._addApiMethod(methodName, handler);
    }

    // Process scopeMethods
    for (const [methodName, handler] of Object.entries(scopeMethods)) {
      this._addScopeMethod(methodName, handler);
    }

    return this;
  }

  _addScope(name, options = {}, extras = {}) {
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
    
    // Process scope hooks - wrap them to only run for this scope
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
      
      // Wrap handler to only run for this scope
      const scopeName = name; // Capture scope name in closure
      const wrappedHandler = (handlerParams) => {
        if (handlerParams.scopeName === scopeName) {
          return handler(handlerParams);
        }
      };
      
      this._addHook(hookName, `scope-custom:${name}`, functionName, hookAddOptions, wrappedHandler)
      this._logger.trace(`Added scope-specific hook '${hookName}' for scope '${name}'`);
    }
    
    // Store scope configuration with underscore prefix for internal properties
    this._scopes.set(name, {
      options: Object.freeze({ ...options }),
      _apiMethods: new Map(Object.entries(apiMethods)),
      _scopeMethods: new Map(Object.entries(scopeMethods)),
      _vars: new Map(Object.entries(vars)),
      _helpers: new Map(Object.entries(helpers))
    });
    
    this._logger.info(`Scope '${name}' added successfully`);
    return this;
  }

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



  use(plugin, options = {}) {
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
      // Store plugin options separately
      this._pluginOptions[plugin.name] = Object.freeze(options)
      
      // Create logger for plugin context
      const log = this._createContextLogger(`plugin:${plugin.name}`);
      
      // Create flattened install context
      const api = this; // Capture this reference
      const installContext = {
        // Setup methods
        addApiMethod: (method, handler) => {
          if (api._logger) {
            api._logger.trace(`Plugin '${plugin.name}' adding API method '${method}'`);
          }
          return api._addApiMethod.call(api, method, handler);
        },
        addScopeMethod: (method, handler) => {
          api._logger.trace(`Plugin '${plugin.name}' adding scope method '${method}'`);
          return api._addScopeMethod(method, handler);
        },
        addScope: (name, options, extras) => {
          api._logger.trace(`Plugin '${plugin.name}' adding scope '${name}'`);
          return api._addScope(name, options, extras);
        },
        setScopeAlias: (aliasName, addScopeAlias) => {
          api._logger.trace(`Plugin '${plugin.name}' setting scope alias '${aliasName}'`);
          return api._setScopeAlias(aliasName, addScopeAlias);
        },
        
        // Special addHook that injects plugin name
        addHook: (hookName, functionName, hookAddOptions, handler) => {
          this._logger.trace(`Plugin '${plugin.name}' adding hook '${hookName}' with function '${functionName}'`);
          return this._addHook(hookName, plugin.name, functionName, hookAddOptions || {}, handler);
        },
        
        // Data access
        vars: this._varsProxy,
        helpers: this._helpersProxy,
        scopes: this.scopes,
        
        // Logging
        log,
        
        // Plugin info
        name: plugin.name,
        apiOptions: Object.freeze({ ...this._apiOptions }),
        pluginOptions: Object.freeze({ ...this._pluginOptions }),
        context: {}
      };
      
      plugin.install(installContext)
      this._installedPlugins.add(plugin.name)
      
      const duration = Date.now() - startTime;
      this._logger.info(`Plugin '${plugin.name}' installed successfully`, { duration: `${duration}ms` });
    } catch (error) {
      const duration = Date.now() - startTime;
      this._logger.error(`Failed to install plugin '${plugin.name}'`, { error: error.message, duration: `${duration}ms` });
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
}

export const resetGlobalRegistryForTesting = () => {
  globalRegistry = new Map()
}