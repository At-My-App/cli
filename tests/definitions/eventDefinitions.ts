import { AmaCustomEventDef } from "@atmyapp/core";

// Define event types for analytics tracking
export type PageViewEvent = AmaCustomEventDef<
  "page_view",
  ["page", "referrer", "timestamp", "user_id"]
>;
export type ClickEvent = AmaCustomEventDef<
  "button_click",
  ["element", "position", "timestamp"]
>;
export type PurchaseEvent = AmaCustomEventDef<
  "purchase",
  ["product_id", "amount", "currency", "user_id", "timestamp"]
>;
export type SearchEvent = AmaCustomEventDef<
  "search",
  ["query", "results_count", "timestamp"]
>;

// Export all event definitions for migration
export type ATMYAPP = [PageViewEvent, ClickEvent, PurchaseEvent, SearchEvent];
