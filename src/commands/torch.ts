const unavailableCommand = {
  type: 'local',
  name: 'torch',
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

export default unavailableCommand
