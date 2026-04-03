export function isPolicyLimitsEligible(): boolean {
  return false;
}

export function initializePolicyLimitsLoadingPromise(): void {}

export async function loadPolicyLimits(): Promise<void> {}

export async function refreshPolicyLimits(): Promise<void> {}

export async function waitForPolicyLimitsToLoad(): Promise<void> {}

export function isPolicyAllowed(_policyKey: string): boolean {
  return true;
}
