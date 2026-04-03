/**
 * User-Agent string helpers.
 *
 * Kept dependency-free so SDK-bundled code (bridge, cli/transports) can
 * import without pulling in auth.ts and its transitive dependency tree.
 */

export function getClaudeCodeUserAgent(): string {
  const version =
    typeof MACRO !== 'undefined' && MACRO.VERSION ? MACRO.VERSION : '1.0.0-dev'
  return `claude-code/${version}`
}
