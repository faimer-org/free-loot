const USER_AGENT = 'free-loot (GitHub Actions; +https://github.com/faimer-org/free-loot)';

export class HttpError extends Error {
  readonly status: number;

  constructor(label: string, status: number) {
    super(`${label} : HTTP ${status}`);
    this.status = status;
  }
}

export interface FetchOptions {
  /** Libellé pour les journaux. L'URL n'est jamais journalisée : elle peut contenir la clé Steam. */
  label: string;
  retries?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * GET JSON avec nouvelles tentatives sur 429, 403 et 5xx (attente croissante).
 * Les messages d'erreur ne contiennent que le libellé et le statut, jamais l'URL.
 */
export async function fetchJson<T>(url: string, { label, retries = 3 }: FetchOptions): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      if (attempt >= retries) {
        const reason = error instanceof Error ? error.name : 'erreur réseau';
        throw new Error(`${label} : ${reason}`);
      }
      await sleep(backoff(attempt));
      continue;
    }

    if (response.ok) {
      return (await response.json()) as T;
    }
    const retryable = response.status === 429 || response.status === 403 || response.status >= 500;
    if (!retryable || attempt >= retries) {
      throw new HttpError(label, response.status);
    }
    console.warn(`${label} : HTTP ${response.status}, nouvelle tentative`);
    await sleep(backoff(attempt));
  }
}

function backoff(attempt: number): number {
  return 5_000 * 2 ** attempt;
}

export { sleep };
