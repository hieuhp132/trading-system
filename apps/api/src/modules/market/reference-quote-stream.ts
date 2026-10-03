import type {
  ReferenceQuote,
} from "./quote-contract.js";

export interface ReferenceQuoteStreamHandlers {
  onQuote(quote: ReferenceQuote): void;

  onError?(error: unknown): void;
}

export interface ReferenceQuoteStream {
  start(
    handlers: ReferenceQuoteStreamHandlers,
  ): void;

  stop(): Promise<void>;

  isRunning(): boolean;
}
