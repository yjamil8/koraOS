import type { Command } from '../../commands.js'
import { isClaudeAISubscriber } from '../../utils/auth.js'

export default {
  type: 'local-jsx',
  name: 'remote-env',
  description: 'Configure the default remote environment for teleport sessions',
  isEnabled: () => isClaudeAISubscriber(),
  get isHidden() {
    return !isClaudeAISubscriber()
  },
  load: () => import('./remote-env.js'),
} satisfies Command
