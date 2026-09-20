export async function fetchJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, init);

  const body = await response.text();

  let data: unknown;

  try {
    data = JSON.parse(body);
  } catch {
    throw new Error(`Invalid JSON response from ${url}`);
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url}`);
  }

  return data as T;
}
