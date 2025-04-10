import { expect } from 'chai'
import { OpenAIMockup } from './utils/OpenAIMockup'
import { AssistantChat } from '../dist'

describe('AssistantChat', () => {
  let openAI: OpenAIMockup
  let assistantChat: AssistantChat

  beforeEach(() => {
    openAI = new OpenAIMockup([])
    assistantChat = new AssistantChat(openAI as any, 'You are a helpful assistant.')
  })

  describe('constructor', () => {
    it('should initialize with default options', () => {
      expect(assistantChat).to.have.property('systemInstructions', 'You are a helpful assistant.')
    })
  })

  describe('prompt', () => {
    it('should send a prompt and return a user-targeted response', async () => {
      openAI = new OpenAIMockup(['TARGET user\nHello, user!'])
      assistantChat = new AssistantChat(openAI as any, 'You are a helpful assistant.')

      const response = await assistantChat.prompt('Hello?', 5)

      expect(response).to.equal('Hello, user!')
    })

    it('should handle multiple responses in sequence', async () => {
      openAI = new OpenAIMockup([
        'TARGET system\nsomeMethod()',
        'TARGET user\nThis is the final response.',
      ])
      assistantChat = new AssistantChat(openAI as any, 'You are a helpful assistant.')

      const response = await assistantChat.prompt('Hello?', 5)

      expect(response).to.equal('This is the final response.')
    })

    it('should throw an error if the maximum number of iterations is exceeded', async () => {
      openAI = new OpenAIMockup(new Array(100).fill(0).map(i => 'TARGET system\nsomeMethod()'))
      assistantChat = new AssistantChat(openAI as any, 'You are a helpful assistant.')

      try {
        await assistantChat.prompt('Hello?', 2)
        throw new Error('Expected prompt to throw an error, but it did not')
      } catch (error: any) {
        expect(error.message).to.equal('Too many attempts to get a valid response')
      }
    })
  })

  describe('Callable decorator', () => {
    it('should register a method as callable', () => {
      class TestChat extends AssistantChat {
        @AssistantChat.Callable('Greets a user by name.')
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
      class TestChat extends AssistantChat {
        @AssistantChat.Callable('Greets a user by name.')
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
      class TestChat extends AssistantChat {
        @AssistantChat.Callable('Greets a user by name.')
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
})