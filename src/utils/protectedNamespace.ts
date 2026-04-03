/**
 * Local single-tenant build: no protected COO namespace concept.
 * Keep a callable export so runtime call sites don't crash.
 */
export function checkProtectedNamespace(): boolean {
  return false
}
