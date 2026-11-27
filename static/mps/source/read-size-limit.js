const sizeLimitCodes =
  /\b(?:GEA_MCP_RESPONSE_TOO_LARGE|AI_GATEWAY_MCP_RESULT_TOO_LARGE|GEA_SQL_RESULT_TOO_LARGE|AI_GATEWAY_SQL_RESULT_TOO_LARGE)\b/;

export const exceedsReadSizeLimit = (error) =>
  [error, error?.cause].some((failure) =>
    sizeLimitCodes.test(`${failure?.code ?? ''} ${failure?.message ?? ''}`),
  );
