const loginCommand = {
  type: 'local',
  name: 'login',
  description: 'Unavailable in local offline build',
  supportsNonInteractive: true,
  load: async () => ({
    call: async () => ({
      type: 'text',
      value: 'Login is unavailable in this local offline build.',
    }),
  }),
};

export default function login() {
  return loginCommand;
}
