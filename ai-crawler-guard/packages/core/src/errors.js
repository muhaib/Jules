export class ConfigError extends Error {
  constructor(message, { path, cause } = {}) {
    super(path ? `${message} (at ${path})` : message, { cause });
    this.name = 'ConfigError';
    this.path = path;
  }
}

export class CatalogError extends ConfigError {
  constructor(message, options) {
    super(message, options);
    this.name = 'CatalogError';
  }
}
