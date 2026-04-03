export function c(size: number): any[] {
  return new Array(size).fill(Symbol.for('react.memo_cache_sentinel'))
}
