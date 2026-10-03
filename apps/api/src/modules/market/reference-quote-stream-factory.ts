import type {
  ReferenceQuoteStream,
} from "./reference-quote-stream.js";

export interface ReferenceQuoteStreamProvider {
  createReferenceQuoteStream():
    ReferenceQuoteStream;
}

export function supportsReferenceQuoteStream(
  provider: unknown,
): provider is ReferenceQuoteStreamProvider {
  if (
    typeof provider !== "object" ||
    provider === null
  ) {
    return false;
  }

  const candidate =
    provider as Partial<ReferenceQuoteStreamProvider>;

  return (
    typeof candidate.createReferenceQuoteStream ===
    "function"
  );
}

export function createReferenceQuoteStream(
  provider: unknown,
): ReferenceQuoteStream | null {
  if (!supportsReferenceQuoteStream(provider)) {
    return null;
  }

  return provider.createReferenceQuoteStream();
}
