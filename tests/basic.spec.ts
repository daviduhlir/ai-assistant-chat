import { expect } from 'chai'
import { OpenAIMockup } from './utils/OpenAIMockup'
import { OpenAIAssistantChat } from '../dist'

describe('Basics', () => {
  let openAI: OpenAIMockup
  let assistantChat: OpenAIAssistantChat

  beforeEach(() => {
    openAI = new OpenAIMockup([])
    assistantChat = new OpenAIAssistantChat(openAI as any, 'You are a helpful assistant.')
  })

  it('should initialize with default options', () => {
    expect(assistantChat).to.have.property('systemInstructions', 'You are a helpful assistant.')
  })

  it('should send a prompt and return a user-targeted response', async () => {
    openAI = new OpenAIMockup(['TARGET user\nHello, user!'])
    assistantChat = new OpenAIAssistantChat(openAI as any, 'You are a helpful assistant.')

    const response = await assistantChat.prompt('Hello?', 5)

    expect(response).to.equal('Hello, user!')
  })

  it('should handle multiple responses in sequence', async () => {
    openAI = new OpenAIMockup([
      'TARGET system\nsomeMethod()',
      'TARGET user\nThis is the final response.',
    ])
    assistantChat = new OpenAIAssistantChat(openAI as any, 'You are a helpful assistant.')

    const response = await assistantChat.prompt('Hello?', 5)

    expect(response).to.equal('This is the final response.')
  })

  it('should throw an error if the maximum number of iterations is exceeded', async () => {
    openAI = new OpenAIMockup(new Array(100).fill(0).map(i => 'TARGET system\nsomeMethod()'))
    assistantChat = new OpenAIAssistantChat(openAI as any, 'You are a helpful assistant.')

    try {
      await assistantChat.prompt('Hello?', 2)
      throw new Error('Expected prompt to throw an error, but it did not')
    } catch (error: any) {
      expect(error.message).to.equal('Too many attempts to get a valid response')
    }
  })

  it('should send all messages from the last iteration to the provider', async () => {
    openAI = new OpenAIMockup([
      'TARGET user\nThis is the final response.',
    ]);
    assistantChat = new OpenAIAssistantChat(openAI as any, 'You are a helpful assistant.');
    assistantChat.setBasePrompt((_, roleInstructions) => `${roleInstructions}`)

    const response = await assistantChat.prompt('Hello?', 5);

    // Ověř, že všechny zprávy byly odeslány do mocku
    expect(openAI.lastMessages).to.deep.equal([
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello?' }
    ]);

    // Ověř, že odpověď je správná
    expect(response).to.equal('This is the final response.');
  });
})