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
    expect(greetCallable).to.have.property('signature').that.includes('greet(name: String)')
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
    const result = await testChat['action']({ call: 'greet', parameters: ['John'] })

    expect(result).to.equal('Hello, John!')
  })

  it('should call a registered method successfully via prompt', async () => {
    let methodCalled = false
    class TestChat extends OpenAIAssistant {
      @OpenAIAssistant.Callable('Greets a user by name.')
      public async greet(name: string): Promise<string> {
        methodCalled = true
        return `Hello, ${name}!`
      }
    }

    // Nastav mock odpověď tak, aby volala metodu greet
    openAI = new OpenAIMockup(['TARGET system\ngreet("John")', 'TARGET user\nSuccess'])
    const testChat = new TestChat(openAI as any, 'You are a helpful assistant.')

    // Zavolej prompt, který spustí metodu greet
    const response = await testChat.prompt('Hello?', 5)

    // Ověř, že výstup odpovídá očekávanému výsledku metody greet
    expect(methodCalled).to.be.true
    expect(response).to.equal('Success')
  })
})