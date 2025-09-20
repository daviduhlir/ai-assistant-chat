import { expect } from 'chai'
import { AnthropicMockup } from './utils/AnthropicMockup'
import { AnthropicAssistant } from '../dist'

describe('Anthropic Basics', () => {
  let anthropic: AnthropicMockup
  let assistantChat: AnthropicAssistant

  it('should initialize with default options', () => {
    anthropic = new AnthropicMockup([])
    assistantChat = new AnthropicAssistant(anthropic as any, 'You are a helpful assistant.')
    expect(assistantChat).to.have.property('systemInstructions', 'You are a helpful assistant.')
  })

  it('should send a prompt and return a user-targeted response', async () => {
    anthropic = new AnthropicMockup(['Hello, user!'])
    assistantChat = new AnthropicAssistant(anthropic as any, 'You are a helpful assistant.')

    const response = await assistantChat.prompt('Hello?', 5)

    expect(response).to.equal('Hello, user!')
  })
})