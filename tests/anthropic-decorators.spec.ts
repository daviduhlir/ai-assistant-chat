import { expect } from 'chai'
import { AnthropicMockup } from './utils/AnthropicMockup'
import { AnthropicAssistant } from '../lib/implementation/AnthropicAssistant'

describe('Anthropic Decorators Test', () => {
  let anthropic: AnthropicMockup

  beforeEach(() => {
    anthropic = new AnthropicMockup(['Test response'])
  })

  it('should register a callable method using decorator', () => {
    class TestAssistant extends AnthropicAssistant {
      @AnthropicAssistant.Callable('Test method that greets')
      public async greet(name: string): Promise<string> {
        return `Hello, ${name}!`
      }
    }

    const assistant = new TestAssistant(anthropic as any, 'Test system')
    const callables = assistant.getCallables()

    // Find our specific callable method
    const greetCallable = callables.find((c: any) => c.key === 'greet')
    expect(greetCallable).to.exist
    expect(greetCallable.description).to.equal('Test method that greets')
  })

  it('should execute callable method', async () => {
    class TestAssistant extends AnthropicAssistant {
      @AnthropicAssistant.Callable('Test method that greets')
      public async greet(name: string): Promise<string> {
        return `Hello, ${name}!`
      }
    }

    const assistant = new TestAssistant(anthropic as any, 'Test system')

    // Call the method directly via the action interface
    const result = await (assistant as any).action('greet', [{ name: 'name', value: 'World' }])

    expect(result).to.equal('Hello, World!')
  })
})