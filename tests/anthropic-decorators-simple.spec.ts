import { expect } from 'chai'
import { AnthropicMockup } from './utils/AnthropicMockup'
import { AnthropicAssistant } from '../dist'

describe('Anthropic Decorators', () => {
  it('should work with decorators', () => {
    const anthropic = new AnthropicMockup(['Test response'])

    class TestAssistant extends AnthropicAssistant {
      @AnthropicAssistant.Callable('Test greeting function')
      public async greet(name: string): Promise<string> {
        return `Hello, ${name}!`
      }
    }

    const assistant = new TestAssistant(anthropic as any, 'Test')
    const callables = assistant.getCallables()

    // Find our specific callable method
    const greetCallable = callables.find((c: any) => c.key === 'greet')
    expect(greetCallable).to.exist
    expect(greetCallable.description).to.equal('Test greeting function')
  })
})