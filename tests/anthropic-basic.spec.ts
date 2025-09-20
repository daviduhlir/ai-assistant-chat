import { expect } from 'chai'
import { AnthropicMockup } from './utils/AnthropicMockup'
import { AnthropicAssistant, AnthropicChatProvider } from '../dist'

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

  it('should handle multiple conversations', async () => {
    anthropic = new AnthropicMockup(['First response', 'Second response'])
    assistantChat = new AnthropicAssistant(anthropic as any, 'You are a helpful assistant.')

    const response1 = await assistantChat.prompt('First question', 5)
    const response2 = await assistantChat.prompt('Second question', 5)

    expect(response1).to.equal('First response')
    expect(response2).to.equal('Second response')
  })

  it('should track token usage', async () => {
    anthropic = new AnthropicMockup(['Response with tokens'])
    const provider = new AnthropicChatProvider(anthropic as any)

    const threadId = await provider.createThread('Test instructions')
    await provider.addMessageToThread(threadId, {
      role: 'user',
      content: 'Test question'
    })
    await provider.executeThread(threadId)

    expect(provider.getUsage()).to.be.greaterThan(0)
  })

  it('should handle custom options', () => {
    anthropic = new AnthropicMockup([])
    assistantChat = new AnthropicAssistant(
      anthropic as any,
      'You are a helpful assistant.',
      {
        model: 'claude-3-5-sonnet-20241022',
        temperature: 0.5,
        maxTokens: 2000
      }
    )

    expect(assistantChat).to.have.property('systemInstructions', 'You are a helpful assistant.')
  })
})

describe('AnthropicChatProvider', () => {
  let anthropic: AnthropicMockup
  let provider: AnthropicChatProvider

  beforeEach(() => {
    anthropic = new AnthropicMockup(['Test response'])
    provider = new AnthropicChatProvider(anthropic as any)
  })

  it('should create a thread', async () => {
    const threadId = await provider.createThread('System instructions')
    expect(threadId).to.be.a('string')
    expect(threadId).to.have.length.greaterThan(0)
  })

  it('should add message to thread', async () => {
    const threadId = await provider.createThread('System instructions')

    await provider.addMessageToThread(threadId, {
      role: 'user',
      content: 'Hello'
    })

    const messages = provider.getMessages(threadId)
    expect(messages).to.have.length(1)
    expect(messages[0]).to.deep.include({
      role: 'user',
      content: 'Hello'
    })
  })

  it('should execute thread and return response', async () => {
    const threadId = await provider.createThread('System instructions')

    await provider.addMessageToThread(threadId, {
      role: 'user',
      content: 'Hello'
    })

    const result = await provider.executeThread(threadId)

    expect(result).to.have.property('role', 'assistant')
    expect(result).to.have.property('content', 'Test response')
  })

  it('should remove thread', async () => {
    const threadId = await provider.createThread('System instructions')

    await provider.removeThread(threadId)

    // Adding message to removed thread should throw error
    try {
      await provider.addMessageToThread(threadId, {
        role: 'user',
        content: 'Hello'
      })
      expect.fail('Should have thrown error')
    } catch (error) {
      expect(error.message).to.include('not found')
    }
  })

  it('should search history', async () => {
    const threadId = await provider.createThread('System instructions')

    await provider.addMessageToThread(threadId, {
      role: 'user',
      content: 'Hello world'
    })

    const searchResult = await provider.searchHistory(threadId, 'world')
    expect(searchResult).to.include('Hello world')
  })

  it('should track usage', async () => {
    const threadId = await provider.createThread('System instructions')

    await provider.addMessageToThread(threadId, {
      role: 'user',
      content: 'Hello'
    })

    await provider.executeThread(threadId)

    expect(provider.getUsage()).to.be.greaterThan(0)
  })
})