// Auto-generated shim declarations for missing extraction modules and exports.

declare module '../../../services/analytics/index.js' {
  export type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS = any
  export const logEvent: any
}

declare module '../../../services/analytics/metadata.js' {
  export const sanitizeToolNameForAnalytics: any
}

declare module '../../../services/policyLimits/index.js' {
  export const isPolicyAllowed: any
}

declare module '../../../types/message.js' {
  export type NormalizedUserMessage = any
  export type ProgressMessage = any
}

declare module '../../../types/notebook.js' {
  export type NotebookCellType = any
  export type NotebookContent = any
}

declare module '../../assistant/index.js' {
  const _any: any
  export default _any
}

declare module '../../bridge/peerSessions.js' {
  const _any: any
  export default _any
}

declare module '../../commands/logout/logout.js' {
  export const clearAuthRelatedCaches: any
  export const performLogout: any
}

declare module '../../components/mcp/types.js' {
  export type AgentMcpServerInfo = any
  export type ClaudeAIServerInfo = any
  export type HTTPServerInfo = any
  export type SSEServerInfo = any
  export type StdioServerInfo = any
}

declare module '../../constants/querySource.js' {
  export type QuerySource = any
}

declare module '../../coordinator/workerAgent.js' {
  const _any: any
  export default _any
}

declare module '../../cost-tracker.js' {
  export const formatTotalCost: any
}

declare module '../../entrypoints/sdk/sdkUtilityTypes.js' {
  export type NonNullableUsage = any
}

declare module '../../keybindings/types.js' {
  export type KeybindingAction = any
}

declare module '../../proactive/index.js' {
  const _any: any
  export default _any
}

declare module '../../services/analytics/datadog.js' {
  export const shutdownDatadog: any
}

declare module '../../services/analytics/firstPartyEventLogger.js' {
  export const shutdown1PEventLogging: any
}

declare module '../../services/analytics/index.js' {
  export type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS = any
  export type AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED = any
  export const logEvent: any
}

declare module '../../services/analytics/metadata.js' {
  export type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS = any
  export const getFileExtensionForAnalytics: any
  export const sanitizeToolNameForAnalytics: any
}

declare module '../../services/analytics/sink.js' {
  export const initializeAnalyticsSink: any
}

declare module '../../services/compact/reactiveCompact.js' {
  const _any: any
  export default _any
}

declare module '../../services/contextCollapse/index.js' {
  const _any: any
  export default _any
}

declare module '../../services/contextCollapse/operations.js' {
  const _any: any
  export default _any
}

declare module '../../services/lsp/types.js' {
  export type LspServerConfig = any
  export type ScopedLspServerConfig = any
}

declare module '../../services/oauth/types.js' {
  export type OAuthTokens = any
  export type ReferralRedemptionsResponse = any
  export type ReferrerRewardInfo = any
}

declare module '../../services/policyLimits/index.js' {
  export const isPolicyAllowed: any
}

declare module '../../services/skillSearch/featureCheck.js' {
  const _any: any
  export default _any
}

declare module '../../services/skillSearch/remoteSkillLoader.js' {
  const _any: any
  export default _any
}

declare module '../../services/skillSearch/remoteSkillState.js' {
  const _any: any
  export default _any
}

declare module '../../services/skillSearch/telemetry.js' {
  const _any: any
  export default _any
}

declare module '../../skills/mcpSkills.js' {
  const _any: any
  export default _any
}

declare module '../../tasks/MonitorMcpTask/MonitorMcpTask.js' {
  const _any: any
  export default _any
}

declare module '../../tools/MonitorTool/MonitorTool.js' {
  const _any: any
  export default _any
}

declare module '../../tools/OverflowTestTool/OverflowTestTool.js' {
  const _any: any
  export default _any
}

declare module '../../tools/ReviewArtifactTool/ReviewArtifactTool.js' {
  const _any: any
  export default _any
}

declare module '../../tools/TerminalCaptureTool/prompt.js' {
  const _any: any
  export default _any
}

declare module '../../tools/TungstenTool/TungstenTool.js' {
  const _any: any
  export default _any
}

declare module '../../tools/VerifyPlanExecutionTool/constants.js' {
  const _any: any
  export default _any
}

declare module '../../tools/WorkflowTool/WorkflowPermissionRequest.js' {
  const _any: any
  export default _any
}

declare module '../../tools/WorkflowTool/WorkflowTool.js' {
  const _any: any
  export default _any
}

declare module '../../tools/WorkflowTool/constants.js' {
  const _any: any
  export default _any
}

declare module '../../types/connectorText.js' {
  export type ConnectorTextBlock = any
  export type ConnectorTextDelta = any
  export const isConnectorTextBlock: any
}

declare module '../../types/message.js' {
  export type AssistantMessage = any
  export type AttachmentMessage = any
  export type CollapsedReadSearchGroup = any
  export type GroupedToolUseMessage = any
  export type HookResultMessage = any
  export type Message = any
  export type NormalizedAssistantMessage = any
  export type NormalizedMessage = any
  export type PartialCompactDirection = any
  export type ProgressMessage = any
  export type RequestStartEvent = any
  export type StopHookInfo = any
  export type StreamEvent = any
  export type SystemAPIErrorMessage = any
  export type SystemBridgeStatusMessage = any
  export type SystemCompactBoundaryMessage = any
  export type SystemLocalCommandMessage = any
  export type SystemMemorySavedMessage = any
  export type SystemMessage = any
  export type SystemStopHookSummaryMessage = any
  export type SystemThinkingMessage = any
  export type SystemTurnDurationMessage = any
  export type TombstoneMessage = any
  export type ToolUseSummaryMessage = any
  export type UserMessage = any
}

declare module '../../types/notebook.js' {
  export type NotebookCell = any
  export type NotebookContent = any
}

declare module '../../types/tools.js' {
  export type AgentToolProgress = any
  export type BashProgress = any
  export type MCPProgress = any
  export type PowerShellProgress = any
  export type SdkWorkflowProgress = any
  export type ShellProgress = any
  export type SkillToolProgress = any
  export type WebSearchProgress = any
}

declare module '../../ui/option.js' {
  export type Option = any
}

declare module '../../utils/attributionHooks.js' {
  const _any: any
  export default _any
}

declare module '../../utils/secureStorage/types.js' {
  export type SecureStorageData = any
}

declare module '../../utils/systemThemeWatcher.js' {
  const _any: any
  export default _any
}

declare module '../../utils/udsClient.js' {
  const _any: any
  export default _any
}

declare module '../../wizard/types.js' {
  export type WizardStepComponent = any
}

declare module '../SendUserFileTool/prompt.js' {
  const _any: any
  export default _any
}

declare module '../analytics/index.js' {
  export type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS = any
  export type AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED = any
  export const logEvent: any
}

declare module '../analytics/metadata.js' {
  export type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS = any
  export const sanitizeToolNameForAnalytics: any
}

declare module '../assistant/index.js' {
  const _any: any
  export default _any
}

declare module '../bridge/webhookSanitizer.js' {
  const _any: any
  export default _any
}

declare module '../cli/bg.js' {
  const _any: any
  export default _any
}

declare module '../cli/handlers/templateJobs.js' {
  const _any: any
  export default _any
}

declare module '../commands/install-github-app/types.js' {
  export type Workflow = any
}

declare module '../compact/cachedMicrocompact.js' {
  const _any: any
  export default _any
}

declare module '../components/FeedbackSurvey/useFrustrationDetection.js' {
  const _any: any
  export default _any
}

declare module '../components/FeedbackSurvey/utils.js' {
  export type FeedbackSurveyResponse = any
}

declare module '../components/Spinner/types.js' {
  export type SpinnerMode = any
}

declare module '../constants/querySource.js' {
  export type QuerySource = any
}

declare module '../contextCollapse/index.js' {
  const _any: any
  export default _any
}

declare module '../cost-tracker.js' {
  export const addToTotalLinesChanged: any
  export const getStoredSessionCosts: any
  export const getTotalAPIDuration: any
  export const getTotalCost: any
  export const getTotalDuration: any
  export const getTotalInputTokens: any
  export const getTotalLinesAdded: any
  export const getTotalLinesRemoved: any
  export const getTotalOutputTokens: any
  export const resetCostState: any
  export const restoreCostStateForSession: any
  export const saveCurrentSessionCosts: any
}

declare module '../daemon/main.js' {
  const _any: any
  export default _any
}

declare module '../daemon/workerRegistry.js' {
  const _any: any
  export default _any
}

declare module '../entrypoints/sdk/controlTypes.js' {
  export type SDKControlCancelRequest = any
  export type SDKControlPermissionRequest = any
  export type SDKControlRequest = any
  export type SDKControlRequestInner = any
  export type SDKControlResponse = any
  export type StdoutMessage = any
}

declare module '../environment-runner/main.js' {
  const _any: any
  export default _any
}

declare module '../hooks/notifs/useAntOrgWarningNotification.js' {
  const _any: any
  export default _any
}

declare module '../jobs/classifier.js' {
  const _any: any
  export default _any
}

declare module '../keybindings/types.js' {
  export type KeybindingAction = any
  export type KeybindingContextName = any
  export type ParsedKeystroke = any
}

declare module '../login/login.js' {
  export const Login: any
}

declare module '../memdir/memoryShapeTelemetry.js' {
  const _any: any
  export default _any
}

declare module '../oauth/types.js' {
  export type ReferralCampaign = any
  export type ReferralEligibilityResponse = any
  export type ReferralRedemptionsResponse = any
  export type ReferrerRewardInfo = any
}

declare module '../proactive/index.js' {
  const _any: any
  export default _any
}

declare module '../self-hosted-runner/main.js' {
  const _any: any
  export default _any
}

declare module '../services/analytics/datadog.js' {
  export const shutdownDatadog: any
}

declare module '../services/analytics/firstPartyEventLogger.js' {
  export const shutdown1PEventLogging: any
}

declare module '../services/analytics/index.js' {
  export type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS = any
  export type AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED = any
  export const logEvent: any
  export const logEventAsync: any
}

declare module '../services/analytics/metadata.js' {
  export type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS = any
  export const sanitizeToolNameForAnalytics: any
}

declare module '../services/analytics/sink.js' {
  export const initializeAnalyticsSink: any
}

declare module '../services/compact/cachedMCConfig.js' {
  const _any: any
  export default _any
}

declare module '../services/compact/snipCompact.js' {
  const _any: any
  export default _any
}

declare module '../services/compact/snipProjection.js' {
  const _any: any
  export default _any
}

declare module '../services/contextCollapse/index.js' {
  const _any: any
  export default _any
}

declare module '../services/contextCollapse/persist.js' {
  const _any: any
  export default _any
}

declare module '../services/lsp/types.js' {
  export type LspServerConfig = any
}

declare module '../services/oauth/types.js' {
  export type BillingType = any
  export type OAuthTokens = any
  export type ReferralEligibilityResponse = any
  export type SubscriptionType = any
}

declare module '../services/policyLimits/index.js' {
  export const initializePolicyLimitsLoadingPromise: any
  export const isPolicyAllowed: any
  export const isPolicyLimitsEligible: any
  export const waitForPolicyLimitsToLoad: any
}

declare module '../services/sessionTranscript/sessionTranscript.js' {
  const _any: any
  export default _any
}

declare module '../services/skillSearch/featureCheck.js' {
  const _any: any
  export default _any
}

declare module '../services/skillSearch/prefetch.js' {
  const _any: any
  export default _any
}

declare module '../services/skillSearch/signals.js' {
  export type DiscoverySignal = any
}

declare module '../sessionTranscript/sessionTranscript.js' {
  const _any: any
  export default _any
}

declare module '../skillSearch/localSearch.js' {
  const _any: any
  export default _any
}

declare module '../ssh/SSHSessionManager.js' {
  export type SSHSessionManager = any
}

declare module '../ssh/createSSHSession.js' {
  export type SSHSession = any
}

declare module '../tools/DiscoverSkillsTool/prompt.js' {
  const _any: any
  export default _any
}

declare module '../tools/SendUserFileTool/prompt.js' {
  const _any: any
  export default _any
}

declare module '../tools/SnipTool/prompt.js' {
  const _any: any
  export default _any
}

declare module '../tools/TungstenTool/TungstenLiveMonitor.js' {
  export const TungstenLiveMonitor: any
}

declare module '../tools/WebBrowserTool/WebBrowserPanel.js' {
  const _any: any
  export default _any
}

declare module '../tools/WorkflowTool/constants.js' {
  export const WORKFLOW_TOOL_NAME: any
}

declare module '../types.js' {
  export type AgentWizardData = any
  export type SettingsJson = any
  export type TaskState = any
  export const SettingsSchema: any
}

declare module '../types/connectorText.js' {
  export type ConnectorTextBlock = any
  export const isConnectorTextBlock: any
}

declare module '../types/fileSuggestion.js' {
  export type FileSuggestionCommandInput = any
}

declare module '../types/message.js' {
  export type AssistantMessage = any
  export type AttachmentMessage = any
  export type CollapsedReadSearchGroup = any
  export type CollapsibleMessage = any
  export type GroupedToolUseMessage = any
  export type HookResultMessage = any
  export type Message = any
  export type MessageOrigin = any
  export type NormalizedAssistantMessage = any
  export type NormalizedMessage = any
  export type NormalizedUserMessage = any
  export type PartialCompactDirection = any
  export type ProgressMessage = any
  export type RenderableMessage = any
  export type RequestStartEvent = any
  export type StopHookInfo = any
  export type StreamEvent = any
  export type SystemAPIErrorMessage = any
  export type SystemAgentsKilledMessage = any
  export type SystemApiMetricsMessage = any
  export type SystemAwaySummaryMessage = any
  export type SystemBridgeStatusMessage = any
  export type SystemCompactBoundaryMessage = any
  export type SystemInformationalMessage = any
  export type SystemLocalCommandMessage = any
  export type SystemMemorySavedMessage = any
  export type SystemMessage = any
  export type SystemMessageLevel = any
  export type SystemMicrocompactBoundaryMessage = any
  export type SystemPermissionRetryMessage = any
  export type SystemScheduledTaskFireMessage = any
  export type SystemStopHookSummaryMessage = any
  export type SystemTurnDurationMessage = any
  export type TombstoneMessage = any
  export type ToolUseSummaryMessage = any
  export type UserMessage = any
}

declare module '../types/messageQueueTypes.js' {
  export type QueueOperation = any
  export type QueueOperationMessage = any
}

declare module '../types/notebook.js' {
  export type NotebookCell = any
  export type NotebookCellOutput = any
  export type NotebookCellSource = any
  export type NotebookCellSourceOutput = any
  export type NotebookContent = any
  export type NotebookOutputImage = any
}

declare module '../types/statusLine.js' {
  export type StatusLineCommandInput = any
}

declare module '../types/tools.js' {
  export type SdkWorkflowProgress = any
  export type ShellProgress = any
}

declare module '../types/utils.js' {
  export type DeepImmutable = any
}

declare module './FeedbackSurvey/utils.js' {
  export type FeedbackSurveyResponse = any
}

declare module './LocalWorkflowTask/LocalWorkflowTask.js' {
  export type LocalWorkflowTaskState = any
}

declare module './MonitorMcpDetailDialog.js' {
  const _any: any
  export default _any
}

declare module './MonitorMcpTask/MonitorMcpTask.js' {
  export type MonitorMcpTaskState = any
}

declare module './MonitorPermissionRequest/MonitorPermissionRequest.js' {
  const _any: any
  export default _any
}

declare module './ReviewArtifactPermissionRequest/ReviewArtifactPermissionRequest.js' {
  const _any: any
  export default _any
}

declare module './Transport.js' {
  export type Transport = any
}

declare module './UserCrossSessionMessage.js' {
  const _any: any
  export default _any
}

declare module './UserForkBoilerplateMessage.js' {
  const _any: any
  export default _any
}

declare module './UserGitHubWebhookMessage.js' {
  const _any: any
  export default _any
}

declare module './WorkflowDetailDialog.js' {
  const _any: any
  export default _any
}

declare module './analytics/index.js' {
  export type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS = any
  export const logEvent: any
}

declare module './assistant/AssistantSessionChooser.js' {
  const _any: any
  export default _any
}

declare module './assistant/gate.js' {
  const _any: any
  export default _any
}

declare module './assistant/index.js' {
  const _any: any
  export default _any
}

declare module './assistant/sessionDiscovery.js' {
  export type AssistantSession = any
}

declare module './attributionTrailer.js' {
  const _any: any
  export default _any
}

declare module './cachedMicrocompact.js' {
  const _any: any
  export default _any
}

declare module './claude-api/SKILL.md' {
  const _default: any
  export default _default
}

declare module './claude-api/csharp/claude-api.md' {
  const _default: any
  export default _default
}

declare module './claude-api/curl/examples.md' {
  const _default: any
  export default _default
}

declare module './claude-api/go/claude-api.md' {
  const _default: any
  export default _default
}

declare module './claude-api/java/claude-api.md' {
  const _default: any
  export default _default
}

declare module './claude-api/php/claude-api.md' {
  const _default: any
  export default _default
}

declare module './claude-api/python/agent-sdk/README.md' {
  const _default: any
  export default _default
}

declare module './claude-api/python/agent-sdk/patterns.md' {
  const _default: any
  export default _default
}

declare module './claude-api/python/claude-api/README.md' {
  const _default: any
  export default _default
}

declare module './claude-api/python/claude-api/batches.md' {
  const _default: any
  export default _default
}

declare module './claude-api/python/claude-api/files-api.md' {
  const _default: any
  export default _default
}

declare module './claude-api/python/claude-api/streaming.md' {
  const _default: any
  export default _default
}

declare module './claude-api/python/claude-api/tool-use.md' {
  const _default: any
  export default _default
}

declare module './claude-api/ruby/claude-api.md' {
  const _default: any
  export default _default
}

declare module './claude-api/shared/error-codes.md' {
  const _default: any
  export default _default
}

declare module './claude-api/shared/live-sources.md' {
  const _default: any
  export default _default
}

declare module './claude-api/shared/models.md' {
  const _default: any
  export default _default
}

declare module './claude-api/shared/prompt-caching.md' {
  const _default: any
  export default _default
}

declare module './claude-api/shared/tool-use-concepts.md' {
  const _default: any
  export default _default
}

declare module './claude-api/typescript/agent-sdk/README.md' {
  const _default: any
  export default _default
}

declare module './claude-api/typescript/agent-sdk/patterns.md' {
  const _default: any
  export default _default
}

declare module './claude-api/typescript/claude-api/README.md' {
  const _default: any
  export default _default
}

declare module './claude-api/typescript/claude-api/batches.md' {
  const _default: any
  export default _default
}

declare module './claude-api/typescript/claude-api/files-api.md' {
  const _default: any
  export default _default
}

declare module './claude-api/typescript/claude-api/streaming.md' {
  const _default: any
  export default _default
}

declare module './claude-api/typescript/claude-api/tool-use.md' {
  const _default: any
  export default _default
}

declare module './cli/handlers/ant.js' {
  const _any: any
  export default _any
}

declare module './commands/assistant/assistant.js' {
  const _any: any
  export default _any
}

declare module './commands/buddy/index.js' {
  const _any: any
  export default _any
}

declare module './commands/fork/index.js' {
  const _any: any
  export default _any
}

declare module './commands/login/index.js' {
  const _default: any
  export default _default
}

declare module './commands/logout/index.js' {
  const _default: any
  export default _default
}

declare module './commands/peers/index.js' {
  const _any: any
  export default _any
}

declare module './commands/workflows/index.js' {
  const _any: any
  export default _any
}

declare module './components/agents/SnapshotUpdateDialog.js' {
  const _any: any
  export default _any
}

declare module './constants/querySource.js' {
  export type QuerySource = any
}

declare module './coreTypes.generated.js' {
  const _any: any
  export default _any
}

declare module './cost-tracker.js' {
  export const formatTotalCost: any
  export const getModelUsage: any
  export const getTotalAPIDuration: any
  export const getTotalCost: any
  export const saveCurrentSessionCosts: any
}

declare module './cursor.js' {
  export type Cursor = any
}

declare module './devtools.js' {
  const _any: any
  export default _any
}

declare module './jobs/classifier.js' {
  const _any: any
  export default _any
}

declare module './memoryShapeTelemetry.js' {
  const _any: any
  export default _any
}

declare module './message.js' {
  export type AssistantMessage = any
  export type Message = any
  export type MessageOrigin = any
}

declare module './messageQueueTypes.js' {
  export type QueueOperationMessage = any
}

declare module './messages/SnipBoundaryMessage.js' {
  const _any: any
  export default _any
}

declare module './paste-event.js' {
  export type PasteEvent = any
}

declare module './postCommitAttribution.js' {
  const _any: any
  export default _any
}

declare module './protectedNamespace.js' {
  const _any: any
  export default _any
}

declare module './query/transitions.js' {
  export type Continue = any
  export type Terminal = any
}

declare module './resize-event.js' {
  export type ResizeEvent = any
}

declare module './sdk/controlTypes.js' {
  const _any: any
  export default _any
}

declare module './sdk/runtimeTypes.js' {
  export type AnyZodRawShape = any
  export type ForkSessionOptions = any
  export type ForkSessionResult = any
  export type GetSessionInfoOptions = any
  export type GetSessionMessagesOptions = any
  export type InferShape = any
  export type InternalOptions = any
  export type InternalQuery = any
  export type ListSessionsOptions = any
  export type McpSdkServerConfigWithInstance = any
  export type Options = any
  export type Query = any
  export type SDKSession = any
  export type SDKSessionOptions = any
  export type SdkMcpToolDefinition = any
  export type SessionMessage = any
  export type SessionMutationOptions = any
}

declare module './sdk/settingsTypes.generated.js' {
  const _any: any
  export default _any
}

declare module './sdk/toolTypes.js' {
  const _any: any
  export default _any
}

declare module './sdkUtilityTypes.js' {
  const _any: any
  export default _any
}

declare module './server/backends/dangerousBackend.js' {
  const _any: any
  export default _any
}

declare module './server/connectHeadless.js' {
  const _any: any
  export default _any
}

declare module './server/lockfile.js' {
  const _any: any
  export default _any
}

declare module './server/parseConnectUrl.js' {
  const _any: any
  export default _any
}

declare module './server/server.js' {
  const _any: any
  export default _any
}

declare module './server/serverBanner.js' {
  const _any: any
  export default _any
}

declare module './server/serverLog.js' {
  const _any: any
  export default _any
}

declare module './server/sessionManager.js' {
  const _any: any
  export default _any
}

declare module './services/compact/reactiveCompact.js' {
  const _any: any
  export default _any
}

declare module './services/compact/snipCompact.js' {
  const _any: any
  export default _any
}

declare module './services/compact/snipProjection.js' {
  const _any: any
  export default _any
}

declare module './services/contextCollapse/index.js' {
  const _any: any
  export default _any
}

declare module './services/policyLimits/index.js' {
  export const isPolicyAllowed: any
  export const loadPolicyLimits: any
  export const refreshPolicyLimits: any
  export const waitForPolicyLimitsToLoad: any
}

declare module './services/skillSearch/localSearch.js' {
  const _any: any
  export default _any
}

declare module './services/skillSearch/prefetch.js' {
  const _any: any
  export default _any
}

declare module './ssh/createSSHSession.js' {
  const _any: any
  export default _any
}

declare module './tools/TungstenTool/TungstenTool.js' {
  export const TungstenTool: any
}

declare module './tools/WorkflowTool/createWorkflowCommand.js' {
  const _any: any
  export default _any
}

declare module './transports/Transport.js' {
  export type Transport = any
}

declare module './types.js' {
  export type Action = any
  export type AgentMcpServerInfo = any
  export type AgentWizardData = any
  export type BackendDetectionResult = any
  export type BackendType = any
  export type BackgroundTaskState = any
  export type BillingType = any
  export type BridgeApiClient = any
  export type BridgeConfig = any
  export type BridgeLogger = any
  export type BridgeWorkerType = any
  export type CUSTOMIZATION_SURFACES = any
  export type Chord = any
  export type ClaudeAIServerInfo = any
  export type Color = any
  export type CommandState = any
  export type Companion = any
  export type CompanionBones = any
  export type ConfigScope = any
  export type ConnectedMCPServer = any
  export type CreatePaneResult = any
  export type EditInput = any
  export type Eye = any
  export type FailedPersistence = any
  export type FileEdit = any
  export type FileEditInput = any
  export type FileEditOutput = any
  export type FilesPersistedEventData = any
  export type FindType = any
  export type Grapheme = any
  export type HTTPServerInfo = any
  export type Hat = any
  export type InProcessTeammateTaskState = any
  export type KeybindingBlock = any
  export type KeybindingContextName = any
  export type LspServerState = any
  export type MCPServerConnection = any
  export type MCPViewState = any
  export type McpHTTPServerConfig = any
  export type McpJsonConfig = any
  export type McpSSEServerConfig = any
  export type McpSdkServerConfig = any
  export type McpServerConfig = any
  export type McpStdioServerConfig = any
  export type McpWebSocketServerConfig = any
  export type ModeState = any
  export type NamedColor = any
  export type OAuthProfileResponse = any
  export type OAuthTokenExchangeResponse = any
  export type OAuthTokens = any
  export type Operator = any
  export type PaneBackend = any
  export type PaneBackendType = any
  export type PaneId = any
  export type ParsedBinding = any
  export type ParsedKeystroke = any
  export type PermissionResponseEvent = any
  export type PersistedFile = any
  export type PluginSettingsProps = any
  export type RGBColor = any
  export type Rarity = any
  export type RateLimitTier = any
  export type RecordedChange = any
  export type RemoteManagedSettingsFetchResult = any
  export type SSEServerInfo = any
  export type ScopedLspServerConfig = any
  export type ScopedMcpServerConfig = any
  export type SecureStorage = any
  export type SecureStorageData = any
  export type ServerInfo = any
  export type ServerResource = any
  export type SessionActivity = any
  export type SessionDoneStatus = any
  export type SessionHandle = any
  export type SessionSpawnOpts = any
  export type SessionSpawner = any
  export type SettingsJson = any
  export type SettingsSyncFetchResult = any
  export type SettingsSyncUploadResult = any
  export type SkippedSecretFile = any
  export type SpawnMode = any
  export type Species = any
  export type SpinnerMode = any
  export type StatName = any
  export type State = any
  export type StdioServerInfo = any
  export type SubscriptionType = any
  export type TabStatusAction = any
  export type TeamMemoryHashesResult = any
  export type TeamMemorySyncFetchResult = any
  export type TeamMemorySyncPushResult = any
  export type TeamMemorySyncUploadResult = any
  export type TeammateExecutor = any
  export type TeammateMessage = any
  export type TeammateSpawnConfig = any
  export type TeammateSpawnResult = any
  export type TextObjScope = any
  export type TextStyle = any
  export type Tip = any
  export type TipContext = any
  export type TurnStartTime = any
  export type UnderlineStyle = any
  export type UserRolesResponse = any
  export type ViewState = any
  export type Warning = any
  export type WizardContextValue = any
  export type WizardProviderProps = any
  export type WorkResponse = any
  export type WorkSecret = any
  export type Workflow = any
  export const AGENT_PATHS: any
  export const BRIDGE_LOGIN_ERROR: any
  export const BRIDGE_LOGIN_INSTRUCTION: any
  export const ConfigScopeSchema: any
  export const DEFAULT_SESSION_TIMEOUT_MS: any
  export const DEFAULT_UPLOAD_CONCURRENCY: any
  export const EYES: any
  export const FILE_COUNT_LIMIT: any
  export const FIND_KEYS: any
  export const HATS: any
  export const MAX_VIM_COUNT: any
  export const McpJsonConfigSchema: any
  export const McpServerConfigSchema: any
  export const OPERATORS: any
  export const OUTPUTS_SUBDIR: any
  export const RARITIES: any
  export const RARITY_COLORS: any
  export const RARITY_WEIGHTS: any
  export const RemoteManagedSettingsResponseSchema: any
  export const SIMPLE_MOTIONS: any
  export const SPECIES: any
  export const STAT_NAMES: any
  export const SYNC_KEYS: any
  export const SettingsSchema: any
  export const TEXT_OBJ_SCOPES: any
  export const TEXT_OBJ_TYPES: any
  export const TeamMemoryDataSchema: any
  export const TeamMemoryTooManyEntriesSchema: any
  export const UserSyncDataSchema: any
  export const appendCappedMessage: any
  export const axolotl: any
  export const blob: any
  export const cactus: any
  export const capybara: any
  export const cat: any
  export const chonk: any
  export const connectResponseSchema: any
  export const defaultStyle: any
  export const dragon: any
  export const duck: any
  export const ghost: any
  export const goose: any
  export const inputSchema: any
  export const isInProcessTeammateTask: any
  export const isOperatorKey: any
  export const isTextObjScopeKey: any
  export const mushroom: any
  export const octopus: any
  export const outputSchema: any
  export const owl: any
  export const penguin: any
  export const rabbit: any
  export const robot: any
  export const snail: any
  export const turtle: any
}

declare module './types/message.js' {
  export type AssistantMessage = any
  export type AttachmentMessage = any
  export type Message = any
  export type ProgressMessage = any
  export type RequestStartEvent = any
  export type StreamEvent = any
  export type SystemLocalCommandMessage = any
  export type SystemMessage = any
  export type TombstoneMessage = any
  export type ToolUseSummaryMessage = any
  export type UserMessage = any
}

declare module './types/tools.js' {
  export type AgentToolProgress = any
  export type BashProgress = any
  export type MCPProgress = any
  export type REPLToolProgress = any
  export type SkillToolProgress = any
  export type TaskOutputProgress = any
  export type ToolProgressData = any
  export type WebSearchProgress = any
}

declare module './types/utils.js' {
  export type DeepImmutable = any
}

declare module './udsClient.js' {
  const _any: any
  export default _any
}

declare module './unifiedTypes.js' {
  export type UnifiedInstalledItem = any
}

declare module './utils.js' {
  export type FeedbackSurveyResponse = any
  export type FeedbackSurveyType = any
  export type FetchedContent = any
  export const MAX_MARKDOWN_LENGTH: any
  export const applyPromptToMarkdown: any
  export const areFileEditsInputsEquivalent: any
  export const buildImageToolResult: any
  export const commandBelongsToServer: any
  export const excludeStalePluginClients: any
  export const extractDangerousSettings: any
  export const findActualString: any
  export const formatDangerousSettingsList: any
  export const getAgentSourceDisplayName: any
  export const getApiKeyHelperSources: any
  export const getAwsCommandsSources: any
  export const getBashPermissionSources: any
  export const getDangerousEnvVarsSources: any
  export const getDefaultCharacters: any
  export const getGcpCommandsSources: any
  export const getHooksSources: any
  export const getLoggingSafeMcpBaseUrl: any
  export const getNewlineInstructions: any
  export const getOtelHeadersHelperSources: any
  export const getPatchForEdit: any
  export const getProjectMcpServerStatus: any
  export const getURLMarkdownContent: any
  export const interpolateColor: any
  export const isImageOutput: any
  export const isNonSpacePrintable: any
  export const isPreapprovedUrl: any
  export const isVimModeEnabled: any
  export const logUnaryPermissionEvent: any
  export const parseRGB: any
  export const preserveQuoteStyle: any
  export const resetCwdIfOutsideProject: any
  export const resizeShellImageOutput: any
  export const stdErrAppendShellResetMessage: any
  export const stripEmptyLines: any
  export const toRGBColor: any
  export const useGetToolFromMessages: any
}

declare module './utils/attributionHooks.js' {
  const _any: any
  export default _any
}

declare module './utils/ccshareResume.js' {
  const _any: any
  export default _any
}

declare module './utils/eventLoopStallDetector.js' {
  const _any: any
  export default _any
}

declare module './utils/sdkHeapDumpMonitor.js' {
  const _any: any
  export default _any
}

declare module './utils/sessionDataUploader.js' {
  const _any: any
  export default _any
}

declare module './utils/taskSummary.js' {
  const _any: any
  export default _any
}

declare module './utils/udsMessaging.js' {
  const _any: any
  export default _any
}

declare module './verify/SKILL.md' {
  const _default: any
  export default _default
}

declare module './verify/examples/cli.md' {
  const _default: any
  export default _default
}

declare module './verify/examples/server.md' {
  const _default: any
  export default _default
}

declare module '@ant/computer-use-mcp/sentinelApps' {
  export const getSentinelCategory: any
}

declare module '@ant/computer-use-mcp/types' {
  export type ComputerUseHostAdapter = any
  export type CoordinateMode = any
  export type CuPermissionRequest = any
  export type CuPermissionResponse = any
  export type CuSubGates = any
  export type Logger = any
  export const DEFAULT_GRANT_FLAGS: any
}

declare module '@anthropic-ai/foundry-sdk' {
  const _any: any
  export default _any
}

declare module '@opentelemetry/exporter-logs-otlp-grpc' {
  const _any: any
  export default _any
}

declare module '@opentelemetry/exporter-logs-otlp-http' {
  const _any: any
  export default _any
}

declare module '@opentelemetry/exporter-logs-otlp-proto' {
  const _any: any
  export default _any
}

declare module '@opentelemetry/exporter-metrics-otlp-grpc' {
  const _any: any
  export default _any
}

declare module '@opentelemetry/exporter-metrics-otlp-http' {
  const _any: any
  export default _any
}

declare module '@opentelemetry/exporter-metrics-otlp-proto' {
  const _any: any
  export default _any
}

declare module '@opentelemetry/exporter-prometheus' {
  const _any: any
  export default _any
}

declare module '@opentelemetry/exporter-trace-otlp-grpc' {
  const _any: any
  export default _any
}

declare module '@opentelemetry/exporter-trace-otlp-http' {
  const _any: any
  export default _any
}

declare module '@opentelemetry/exporter-trace-otlp-proto' {
  const _any: any
  export default _any
}

declare module 'audio-capture-napi' {
  const _any: any
  export default _any
}

declare module 'cacache' {
  const _any: any
  export default _any
}

declare module 'cli-highlight' {
  const _any: any
  export default _any
}

declare module 'image-processor-napi' {
  const _any: any
  export default _any
}

declare module 'plist' {
  const _any: any
  export default _any
}

declare module 'src/shims/react-compiler-runtime.js' {
  export const c: any
}

declare module 'src//types/message.js' {
  export type AssistantMessage = any
}

declare module 'src/cli/rollback.js' {
  const _any: any
  export default _any
}

declare module 'src/cli/up.js' {
  const _any: any
  export default _any
}

declare module 'src/constants/querySource.js' {
  export type QuerySource = any
}

declare module 'src/cost-tracker.js' {
  export const addToTotalSessionCost: any
  export const formatCost: any
}

declare module 'src/entrypoints/sdk/controlTypes.js' {
  export type SDKControlInitializeRequest = any
  export type SDKControlInitializeResponse = any
  export type SDKControlMcpSetServersResponse = any
  export type SDKControlReloadPluginsResponse = any
  export type SDKControlRequest = any
  export type SDKControlResponse = any
  export type SDKPartialAssistantMessage = any
  export type StdinMessage = any
  export type StdoutMessage = any
}

declare module 'src/entrypoints/sdk/runtimeTypes.js' {
  export type EffortLevel = any
}

declare module 'src/services/analytics/config.js' {
  export const isAnalyticsDisabled: any
  export const isFeedbackSurveyDisabled: any
}

declare module 'src/services/analytics/firstPartyEventLogger.js' {
  export const logEventTo1P: any
}

declare module 'src/services/analytics/index.js' {
  export type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS = any
  export const logEvent: any
}

declare module 'src/services/analytics/metadata.js' {
  export type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS = any
  export const extractMcpToolDetails: any
  export const extractSkillName: any
  export const extractToolInputForTelemetry: any
  export const getFileExtensionForAnalytics: any
  export const getFileExtensionsFromBashCommand: any
  export const isToolDetailsLoggingEnabled: any
  export const mcpToolDetailsForAnalytics: any
  export const sanitizeToolNameForAnalytics: any
}

declare module 'src/services/analytics/sink.js' {
  export const initializeAnalyticsGates: any
}

declare module 'src/services/oauth/types.js' {
  export type OAuthProfileResponse = any
}

declare module 'src/services/policyLimits/index.js' {
  export const isPolicyAllowed: any
}

declare module 'src/tasks/LocalWorkflowTask/LocalWorkflowTask.js' {
  export type LocalWorkflowTaskState = any
}

declare module 'src/tasks/MonitorMcpTask/MonitorMcpTask.js' {
  export type MonitorMcpTaskState = any
}

declare module 'src/tools/TungstenTool/TungstenTool.js' {
  export const TungstenTool: any
}

declare module 'src/types/connectorText.js' {
  export const isConnectorTextBlock: any
}

declare module 'src/types/message.js' {
  export type AssistantMessage = any
  export type AttachmentMessage = any
  export type CompactMetadata = any
  export type HookResultMessage = any
  export type Message = any
  export type MessageOrigin = any
  export type NormalizedUserMessage = any
  export type ProgressMessage = any
  export type SystemAPIErrorMessage = any
  export type SystemFileSnapshotMessage = any
  export type SystemMessage = any
  export type UserMessage = any
}

declare module 'src/types/tools.js' {
  export type ShellProgress = any
}

declare module 'src/types/utils.js' {
  export type DeepImmutable = any
  export type Permutations = any
}

declare module 'url-handler-napi' {
  const _any: any
  export default _any
}

