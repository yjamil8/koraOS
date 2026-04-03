export const feature = (flag: string) => true; export const growthbook = { init: () => {}, setAttributes: () => {} };
export const checkGate_CACHED_OR_BLOCKING = (..._args: any[]) => true;
export const checkStatsigFeatureGate_CACHED_MAY_BE_STALE = (..._args: any[]) => true;
export const checkSecurityRestrictionGate = (..._args: any[]) => true;
export const getDynamicConfig_BLOCKS_ON_INIT = <T = Record<string, unknown>>(
  _key: string,
  defaultValue?: T,
): Promise<T> => Promise.resolve((defaultValue ?? ({} as T)) as T);
export const getDynamicConfig_CACHED_MAY_BE_STALE = <T = Record<string, unknown>>(
  _key: string,
  defaultValue?: T,
): T => (defaultValue ?? ({} as T)) as T;
export const getFeatureValue_CACHED_MAY_BE_STALE = <T = unknown>(_key: string, fallback: T): T => fallback;
export const getFeatureValue_CACHED_WITH_REFRESH = <T = unknown>(_key: string, fallback: T): T => fallback;
export const getFeatureValue_DEPRECATED = <T = unknown>(_key: string, fallback: T): T => fallback;
export const hasGrowthBookEnvOverride = () => false;
export const initializeGrowthBook = async () => {};
export const refreshGrowthBookAfterAuthChange = async () => {};
export const onGrowthBookRefresh = (..._args: any[]) => () => {};
export const resetGrowthBook = () => {};
