import { expect } from 'chai'
import { AnthropicMockup } from './utils/AnthropicMockup'
import { AnthropicAssistant } from '../dist'

describe('Anthropic Simple Tests', () => {
  let anthropic: AnthropicMockup
  let assistantChat: AnthropicAssistant

  beforeEach(() => {
    anthropic = new AnthropicMockup(['Test response from assistant'])
    assistantChat = new AnthropicAssistant(anthropic as any, 'You are a helpful assistant.')
  })

  it('should initialize correctly', () => {
    expect(assistantChat).to.exist
    expect(assistantChat.systemInstructions).to.equal('You are a helpful assistant.')
  })

  it('should handle basic conversation', async () => {
    const response = await assistantChat.prompt('Hello', 5)
    expect(response).to.equal('Test response from assistant')
  })

  it('should handle tool responses', async () => {
    // Test with tool response mock
    const toolMock = new AnthropicMockup(
      ['I will use a tool to help you.', 'Tool executed successfully!'],
      [[{ name: 'testTool', input: { param: 'value' } }], []]
    )

    const toolAssistant = new AnthropicAssistant(toolMock as any, 'You are a helpful assistant.')

    // This should trigger tool use and then final response
    const response = await toolAssistant.prompt('Use a tool please', 10)

    // Should get the final response after tool execution
    expect(response).to.include('Tool executed successfully!')
  })
})