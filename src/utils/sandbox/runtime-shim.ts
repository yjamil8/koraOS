export type FsReadRestrictionConfig = {
  allowOnly?: string[]
  denyWithinAllow?: string[]
}

export type FsWriteRestrictionConfig = {
  allowOnly?: string[]
  denyWithinAllow?: string[]
}

export type IgnoreViolationsConfig = {
  filesystem?: boolean
  network?: boolean
}

export type NetworkHostPattern = {
  host: string
}

export type NetworkRestrictionConfig = {
  mode?: 'off' | 'allowlist'
  allowOnly?: string[]
  deny?: string[]
}

export type SandboxAskCallback = (
  hostPattern: NetworkHostPattern,
) => boolean | Promise<boolean>

export type SandboxDependencyCheck = {
  errors: string[]
  warnings: string[]
}

export type SandboxRuntimeConfig = {
  filesystem?: {
    read?: FsReadRestrictionConfig
    write?: FsWriteRestrictionConfig
  }
  network?: NetworkRestrictionConfig
  ignoreViolations?: IgnoreViolationsConfig
}

export type SandboxViolationEvent = {
  timestamp: Date
  line: string
  command?: string
}

type SandboxViolationSubscriber = (
  violations: SandboxViolationEvent[],
) => void

export class SandboxViolationStore {
  private violations: SandboxViolationEvent[] = []
  private subscribers = new Set<SandboxViolationSubscriber>()

  subscribe(callback: SandboxViolationSubscriber): () => void {
    this.subscribers.add(callback)
    return () => {
      this.subscribers.delete(callback)
    }
  }

  getTotalCount(): number {
    return this.violations.length
  }

  getAllViolations(): SandboxViolationEvent[] {
    return [...this.violations]
  }

  addViolation(event: SandboxViolationEvent): void {
    this.violations.push(event)
    const snapshot = this.getAllViolations()
    for (const callback of this.subscribers) {
      callback(snapshot)
    }
  }

  clear(): void {
    this.violations = []
    for (const callback of this.subscribers) {
      callback([])
    }
  }
}

export const SandboxRuntimeConfigSchema = {
  parse: <T>(input: T): T => input,
  safeParse: <T>(input: T): { success: true; data: T } => ({
    success: true,
    data: input,
  }),
}

const violationStore = new SandboxViolationStore()

let fsReadConfig: FsReadRestrictionConfig = {}
let fsWriteConfig: FsWriteRestrictionConfig = {}
let networkConfig: NetworkRestrictionConfig = { mode: 'off' }
let ignoreViolations: IgnoreViolationsConfig | undefined

export class SandboxManager {
  static checkDependencies(): SandboxDependencyCheck {
    return { errors: [], warnings: [] }
  }

  static isSupportedPlatform(): boolean {
    return true
  }

  static async initialize(
    runtimeConfig?: SandboxRuntimeConfig,
    _askCallback?: SandboxAskCallback,
  ): Promise<void> {
    this.updateConfig(runtimeConfig ?? {})
  }

  static updateConfig(runtimeConfig: SandboxRuntimeConfig): void {
    fsReadConfig = runtimeConfig.filesystem?.read ?? {}
    fsWriteConfig = runtimeConfig.filesystem?.write ?? {}
    networkConfig = runtimeConfig.network ?? { mode: 'off' }
    ignoreViolations = runtimeConfig.ignoreViolations
  }

  static async reset(): Promise<void> {
    fsReadConfig = {}
    fsWriteConfig = {}
    networkConfig = { mode: 'off' }
    ignoreViolations = undefined
    violationStore.clear()
  }

  static async wrapWithSandbox(
    command: string,
    _binShell?: string,
    _customConfig?: Partial<SandboxRuntimeConfig>,
    _abortSignal?: AbortSignal,
  ): Promise<string> {
    return command
  }

  static getFsReadConfig(): FsReadRestrictionConfig {
    return fsReadConfig
  }

  static getFsWriteConfig(): FsWriteRestrictionConfig {
    return fsWriteConfig
  }

  static getNetworkRestrictionConfig(): NetworkRestrictionConfig {
    return networkConfig
  }

  static getIgnoreViolations(): IgnoreViolationsConfig | undefined {
    return ignoreViolations
  }

  static getAllowUnixSockets(): string[] | undefined {
    return undefined
  }

  static getAllowLocalBinding(): boolean | undefined {
    return undefined
  }

  static getEnableWeakerNestedSandbox(): boolean | undefined {
    return undefined
  }

  static getProxyPort(): number | undefined {
    return undefined
  }

  static getSocksProxyPort(): number | undefined {
    return undefined
  }

  static getLinuxHttpSocketPath(): string | undefined {
    return undefined
  }

  static getLinuxSocksSocketPath(): string | undefined {
    return undefined
  }

  static waitForNetworkInitialization(): Promise<boolean> {
    return Promise.resolve(true)
  }

  static getSandboxViolationStore(): SandboxViolationStore {
    return violationStore
  }

  static annotateStderrWithSandboxFailures(
    _command: string,
    stderr: string,
  ): string {
    return stderr
  }

  static cleanupAfterCommand(): void {
    // No-op for local shim.
  }
}
