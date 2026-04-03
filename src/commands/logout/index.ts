const logoutCommand = {
  type: 'local',
  name: 'logout',
  description: 'Unavailable in local offline build',
  supportsNonInteractive: true,
  load: async () => ({
    call: async () => ({
      type: 'text',
      value: 'Logout is unavailable in this local offline build.',
    }),
  }),
};

export default logoutCommand;
