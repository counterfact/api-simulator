import type { ClientGenerationOptions } from "@counterfact/generator";

/** CLI / counterfact.yaml options that configure the generated client. */
export interface ClientCliOptions {
  apiClassName?: unknown;
  moduleClassSuffix?: unknown;
  moduleNameFirstTag?: unknown;
  moduleNameIndex?: unknown;
  typePrefix?: unknown;
  typeSuffix?: unknown;
  unwrapResponseData?: unknown;
}

/** Validates a name prefix or suffix, which must keep generated names valid identifiers. */
function identifierAffix(value: unknown, flag: string): string {
  const affix = String(value);
  if (!/^[\w$]*$/u.test(affix)) {
    throw new Error(
      `${flag} must contain only letters, digits, _ and $ (received ${JSON.stringify(affix)}).`,
    );
  }
  return affix;
}

/**
 * Validates the client options from the command line or `counterfact.yaml`
 * and converts them to {@link ClientGenerationOptions}.
 *
 * @throws When an option has an invalid value.
 */
export function resolveClientOptions(
  options: ClientCliOptions,
): ClientGenerationOptions {
  const resolved: ClientGenerationOptions = {};

  if (options.moduleNameIndex !== undefined) {
    const index = Number(options.moduleNameIndex);
    if (!Number.isInteger(index) || index < 0) {
      throw new Error(
        `--module-name-index must be a non-negative integer (received ${JSON.stringify(options.moduleNameIndex)}).`,
      );
    }
    resolved.moduleNameIndex = index;
  }

  if (options.apiClassName !== undefined) {
    const name = String(options.apiClassName);
    if (!/^[A-Z_$a-z][\w$]*$/u.test(name)) {
      throw new Error(
        `--api-class-name must be a valid TypeScript identifier (received ${JSON.stringify(name)}).`,
      );
    }
    resolved.apiClassName = name;
  }

  if (options.moduleClassSuffix !== undefined) {
    resolved.moduleClassSuffix = identifierAffix(
      options.moduleClassSuffix,
      "--module-class-suffix",
    );
  }
  if (options.typePrefix !== undefined) {
    resolved.typePrefix = identifierAffix(options.typePrefix, "--type-prefix");
  }
  if (options.typeSuffix !== undefined) {
    resolved.typeSuffix = identifierAffix(options.typeSuffix, "--type-suffix");
  }

  if (options.moduleNameFirstTag) resolved.moduleNameFirstTag = true;
  if (options.unwrapResponseData) resolved.unwrapResponseData = true;

  return resolved;
}
