interface ProxyConfig {
  proxyPaths: Map<string, boolean>;
}

/**
 * Determines whether a given request path should be forwarded to the upstream
 * proxy.
 *
 * The check walks up the path hierarchy until it either finds an explicit
 * `proxyPaths` entry or reaches the root (in which case the proxy is
 * considered disabled).
 *
 * @param path - The request path to check (e.g. `"/pets/1"`).
 * @param config - Object containing the `proxyPaths` map.
 * @returns `true` when the request should be proxied.
 */
export function isProxyEnabledForPath(
  path: string,
  config: ProxyConfig,
): boolean {
  if (config.proxyPaths.has(path)) {
    return config.proxyPaths.get(path) ?? false;
  }

  if (path === "") {
    return false;
  }

  const parentPath = path.slice(0, Math.max(0, path.lastIndexOf("/")));

  return isProxyEnabledForPath(parentPath, config);
}
