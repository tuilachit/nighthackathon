/** Returns concise, provider-safe copy for a terminal live-search failure. */
export function publicWorkflowErrorMessage(code: string | undefined): string {
  if (code === "user_cancelled") {
    return "This search was cancelled.";
  }
  if (code === "browser_budget_exhausted") {
    return "The retailer check reached its browsing limit before validated products were ready. Try a shorter, more specific search.";
  }
  if (code === "browser_invalid_output") {
    return "The retailer pages did not provide enough source-backed dimensions for a safe result. Try another product or a more specific search.";
  }
  if (code === "browser_timed_out" || code?.includes("deadline") === true) {
    return "The retailer check took too long before validated products were ready. Try a shorter, more specific search.";
  }
  if (code?.includes("429") === true || code?.includes("quota") === true) {
    return "Retailer search is busy right now. Try again in a moment.";
  }
  if (code?.startsWith("browser_") === true) {
    return "The retailer check ended before validated products were ready. Try a shorter, more specific search.";
  }
  if (code === "workflow_expired") {
    return "This saved search expired. Start a new search.";
  }
  return "This retailer check could not continue. Start a new search.";
}
