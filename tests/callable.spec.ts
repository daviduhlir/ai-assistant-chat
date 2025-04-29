import { expect } from 'chai'
import { OpenAIMockup } from './utils/OpenAIMockup'
import { OpenAIAssistant } from '../dist'

describe('Callable decorator', () => {
  let openAI: OpenAIMockup
  let assistantChat: OpenAIAssistant

  beforeEach(() => {
    openAI = new OpenAIMockup([])
    assistantChat = new OpenAIAssistant(openAI as any, 'You are a helpful assistant.')
  })

  it('should register a method as callable', () => {
    class TestChat extends OpenAIAssistant {
      @OpenAIAssistant.Callable('Greets a user by name.')
      public async greet(name: string): Promise<string> {
        return `Hello, ${name}!`
      }
    }

    const testChat = new TestChat(openAI as any, 'You are a helpful assistant.')
    const callables = testChat.getCallables()

    // Najdi objekt odpovídající metodě 'greet'
    const greetCallable = callables.find((callable: any) => callable.key === 'greet')

    expect(greetCallable).to.exist
    expect(greetCallable).to.have.property('description', 'Greets a user by name.')
  })

  it('should call a registered method successfully', async () => {
    class TestChat extends OpenAIAssistant {
      @OpenAIAssistant.Callable('Greets a user by name.')
      public async greet(name: string): Promise<string> {
        return `Hello, ${name}!`
      }
    }

    const testChat = new TestChat(openAI as any, 'You are a helpful assistant.')

    // Zavolej metodu pomocí `action`
    const result = await testChat['action']('greet', [{name: 'name', value: 'John'}])

    expect(result).to.equal('Hello, John!')
  })
})