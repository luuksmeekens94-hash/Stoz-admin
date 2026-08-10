export function resolveAppBaseUrl(input: {
  nodeEnv?: string;
  configuredBaseUrl?: string;
  requestUrl: string;
}) {
  const configured = input.configuredBaseUrl?.trim();
  if (input.nodeEnv === "production" && !configured) {
    throw new Error("APP_BASE_URL ontbreekt voor productie-loginlinks.");
  }

  const url = new URL(configured || input.requestUrl);
  if (input.nodeEnv === "production" && url.protocol !== "https:") {
    throw new Error("APP_BASE_URL moet in productie HTTPS gebruiken.");
  }
  return url.origin;
}
