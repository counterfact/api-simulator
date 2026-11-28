import type { ClientSecurityScheme } from "@counterfact/types/client-route";

import { isSwagger2 } from "./swagger2-client.js";

import type { Requirement } from "./requirement.js";
import type { Specification } from "./specification.js";

export function clientSecuritySchemes(specification: Specification) {
  return (
    specification
      .getRequirement(
        isSwagger2(specification)
          ? "#/securityDefinitions"
          : "#/components/securitySchemes",
      )
      ?.flatMap<{ name: string; scheme: ClientSecurityScheme }>(
        (scheme, name) => {
          const type = scheme.get("type")?.data;
          const http = scheme.get("scheme")?.data;
          if (
            type === "basic" ||
            (type === "http" &&
              typeof http === "string" &&
              http.toLowerCase() === "basic")
          ) {
            return [{ name, scheme: { type: "basic" } }];
          }
          if (
            type === "oauth2" ||
            type === "openIdConnect" ||
            (type === "http" &&
              typeof http === "string" &&
              http.toLowerCase() === "bearer")
          ) {
            return [{ name, scheme: { type: "bearer" } }];
          }
          const location = scheme.get("in")?.data;
          const wireName = scheme.get("name")?.data;
          if (
            type === "apiKey" &&
            typeof wireName === "string" &&
            (location === "header" ||
              location === "query" ||
              location === "cookie")
          ) {
            return [
              {
                name,
                scheme: { type: "apiKey", location, name: wireName },
              },
            ];
          }
          return [];
        },
      ) ?? []
  );
}

export function clientSecurityRequirements(operation: Requirement) {
  const security =
    operation.get("security") ??
    operation.specification?.getRequirement("#/security");
  return security?.map((requirement) =>
    Object.fromEntries(
      requirement.map((scopes, name) => [
        name,
        Array.isArray(scopes.data)
          ? scopes.data.filter(
              (scope): scope is string => typeof scope === "string",
            )
          : [],
      ]),
    ),
  );
}
