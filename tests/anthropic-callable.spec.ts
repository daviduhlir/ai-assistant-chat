import { expect } from 'chai'
import { AnthropicMockup } from './utils/AnthropicMockup'
import { AnthropicAssistant } from '../dist'

describe('Anthropic Callable decorator', () => {
  let anthropic: AnthropicMockup
  let assistantChat: AnthropicAssistant

  beforeEach(() => {
    anthropic = new AnthropicMockup([])
    assistantChat = new AnthropicAssistant(anthropic as any, 'You are a helpful assistant.')
  })

  it('should register a method as callable', () => {
    class TestChat extends AnthropicAssistant {
      @AnthropicAssistant.Callable('Greets a user by name.')
      public async greet(name: string): Promise<string> {
        return `Hello, ${name}!`
      }
    }

    const testChat = new TestChat(anthropic as any, 'You are a helpful assistant.')
    const callables = testChat.getCallables()

    // Find the greet callable method
    const greetCallable = callables.find((callable: any) => callable.key === 'greet')

    expect(greetCallable).to.exist
    expect(greetCallable).to.have.property('description', 'Greets a user by name.')
  })

  it('should call a registered method successfully', async () => {
    class TestChat extends AnthropicAssistant {
      @AnthropicAssistant.Callable('Greets a user by name.')
      public async greet(name: string): Promise<string> {
        return `Hello, ${name}!`
      }
    }

    const testChat = new TestChat(anthropic as any, 'You are a helpful assistant.')

    // Call the method using `action`
    const result = await testChat['action']('greet', [{name: 'name', value: 'John'}])

    expect(result).to.equal('Hello, John!')
  })
})