// "Show the menu for X" is also ChatGPT's restaurant-confirmation callback.
// It cannot authorize a full-menu display by itself.
export function explicitlyRequestsFullMenu(request: string): boolean {
  const match = /\b(?:(?:full|entire|whole|complete)\s+(?:food\s+)?menu|all\s+(?:the\s+)?(?:menu\s+)?(?:items|dishes)|every\s+(?:item|dish))\b/i.exec(request);
  if (!match) return false;
  const prefix = request.slice(Math.max(0, match.index - 45), match.index);
  return !/\b(?:not|no|don't|do not|without|skip|avoid|rather than|instead of)\b[^.!?;]*$/i.test(prefix);
}
