import { AmaEventDef } from "@atmyapp/core";

// Define event types for analytics tracking
export type PageViewEvent = AmaEventDef<
  "page_view",
  ["page", "referrer", "timestamp", "user_id"]
>;
export type ClickEvent = AmaEventDef<
  "button_click",
  ["element", "position", "timestamp"]
>;
export type PurchaseEvent = AmaEventDef<
  "purchase",
  ["product_id", "amount", "currency", "user_id", "timestamp"]
>;
export type SearchEvent = AmaEventDef<
  "search",
  ["query", "results_count", "timestamp"]
>;

// Export all event definitions for migration
export type ATMYAPP = [PageViewEvent, ClickEvent, PurchaseEvent, SearchEvent];
