import { generate, type JsonSchema } from "json-schema-faker";

/**
 * A collection of utility helpers made available to route handlers via
 * `$.tools`.
 *
 * Provides random selection, content-type acceptance checking, and
 * schema-based random data generation.
 */
export class Tools {
  private readonly headers: { [key: string]: string[] | string | undefined };

  public constructor({
    headers = {},
  }: { headers?: { [key: string]: string[] | string | undefined } } = {}) {
    this.headers = headers;
  }

  /**
   * Returns a randomly selected element from `array`.
   *
   * @param array - The array to pick from.
   * @returns A random element.
   */
  public oneOf<Item>(array: Item[]): Item {
    return array[Math.floor(Math.random() * array.length)] as Item;
  }

  /**
   * Returns `true` when the request's `Accept` header is compatible with
   * `contentType`.
   *
   * A missing or empty `Accept` header is treated as `*&#47;*` (accepts anything).
   *
   * @param contentType - The MIME type to check (e.g. `"application/json"`).
   */
  public accepts(contentType: string): boolean {
    const acceptHeader = Object.entries(this.headers).find(
      ([key]) => key.toLowerCase() === "accept",
    )?.[1];

    if (acceptHeader === "" || acceptHeader === undefined) {
      return true;
    }

    const acceptTypes = String(acceptHeader).split(",");

    return acceptTypes.some((acceptType) => {
      const [type, subtype] = acceptType.trim().split("/");

      return (
        (type === "*" || type === contentType.split("/")[0]) &&
        (subtype === "*" || subtype === contentType.split("/")[1])
      );
    });
  }

  /**
   * Generates a random value that satisfies `schema` using json-schema-faker.
   *
   * @param schema - A JSON Schema object.
   * @returns A promise that resolves to a generated value.
   */
  public randomFromSchema(schema: JsonSchema): Promise<unknown> {
    return generate(schema, { useExamplesValue: true, fillProperties: false });
  }
}
