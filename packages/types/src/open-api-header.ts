export interface OpenApiHeader {
  required?: boolean;
  schema: { [key: string]: unknown };
}
