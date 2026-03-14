export class UpdateProxyActionDto {
  providerConfigKey?: string;
  actionName?: string;
  actionType?: string;
  displayName?: string;
  description?: string;
  method?: string;
  endpoint?: string;

  paramsConfig?: Record<string, unknown>;
  bodyConfig?: Record<string, unknown>;
  headersConfig?: Record<string, unknown>;
  responseConfig?: Record<string, unknown>;
  postProcessConfig?: Record<string, unknown>;

  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}
