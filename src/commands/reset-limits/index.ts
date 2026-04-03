const baseCommand = {
  type: 'local',
  description: 'Unavailable in local offline build',
  isEnabled: () => false,
  supportsNonInteractive: true,
  load: async () => ({
    call: async () => ({
      type: 'text',
      value: 'This command is unavailable in this local offline build.',
    }),
  }),
}

export const resetLimits = {
  ...baseCommand,
  name: 'reset-limits',
}

export const resetLimitsNonInteractive = {
  ...baseCommand,
  name: 'reset-limits-noninteractive',
}
