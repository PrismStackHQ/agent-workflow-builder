import Nango from '@nangohq/frontend';

/**
 * Triggers the Nango Connect UI for OAuth authorization.
 * Following the NangoHQ/sample-app pattern:
 * 1. Opens the Connect UI immediately (shows loading state)
 * 2. Creates a connect session via our server-side API route (keeps secret key off frontend)
 * 3. Sets the session token on the Connect UI
 * 4. Resolves when the user completes the connection
 */
export function triggerNangoAuth(
  integrationKey: string,
  endUserId: string,
): Promise<{ connectionId: string; providerConfigKey: string }> {
  return new Promise((resolve, reject) => {
    const nangoHost = process.env.NEXT_PUBLIC_NANGO_HOST || 'https://api.nango.dev';
    const nango = new Nango({ host: nangoHost, publicKey: 'empty' });

    const connectUI = nango.openConnectUI({
      onEvent: (event) => {
        if (event.type === 'connect') {
          resolve({
            connectionId: event.payload.connectionId,
            providerConfigKey: event.payload.providerConfigKey,
          });
        }
        if (event.type === 'close') {
          reject(new Error('Connection dialog closed'));
        }
      },
    });

    // Defer session creation to let the iframe show a loading state first (sample-app pattern)
    setTimeout(async () => {
      try {
        const res = await fetch('/api/nango/connect-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ integrationKey, endUserId }),
        });
        const data = await res.json();

        if (data.error) {
          reject(new Error(data.error));
          return;
        }

        connectUI.setSessionToken(data.connectSession);
      } catch (err) {
        reject(err);
      }
    }, 10);
  });
}
