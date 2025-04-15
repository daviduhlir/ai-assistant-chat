import { expect } from 'chai'
import { OpenAIMockup } from './utils/OpenAIMockup'
import { OpenAIAssistantChat } from '../dist'

describe('Responses parser', () => {
  let openAI: OpenAIMockup
  let assistantChat: OpenAIAssistantChat

  beforeEach(() => {
    openAI = new OpenAIMockup([])
    assistantChat = new OpenAIAssistantChat(openAI as any, 'You are a helpful assistant.')
  })

  it('should handle a valid JSON response from the assistant', async () => {
    class TestChat extends OpenAIAssistantChat {
      @OpenAIAssistantChat.Callable('Processes a JSON object.')
      public async processJson(data: { key: string }): Promise<string> {
        return `Processed key: ${data.key}`
      }
    }

    // Nastav mock odpověď s voláním metody obsahující JSON
    openAI = new OpenAIMockup(['TARGET system\nprocessJson({"key": "value"})', 'TARGET user\nSuccess'])
    const testChat = new TestChat(openAI as any, 'You are a helpful assistant.')

    const response = await testChat.prompt('Process this JSON.', 5)

    expect(response).to.equal('Success')
  })

  it('should handle an invalid JSON response gracefully', async () => {
    class TestChat extends OpenAIAssistantChat {
      @OpenAIAssistantChat.Callable('Processes a JSON object.')
      public async processJson(data: { key: string }): Promise<string> {
        return `Processed key: ${data.key}`
      }
    }

    // Nastav mock odpověď s neplatným JSON
    openAI = new OpenAIMockup(['TARGET system\nprocessJson({key: value})', 'TARGET user\nError'])
    const testChat = new TestChat(openAI as any, 'You are a helpful assistant.')

    const response = await testChat.prompt('Process this invalid JSON.', 5)

    expect(response).to.equal('Error')
  })

  it('should handle a response with no target gracefully', async () => {
    class TestChat extends OpenAIAssistantChat {}

    // Nastav mock odpověď bez cíle (neplatný formát)
    openAI = new OpenAIMockup(['This is a response without a target.', 'TARGET user\nsecond try'])
    const testChat = new TestChat(openAI as any, 'You are a helpful assistant.')

    const result = await testChat.prompt('What is this?', 5)
    expect(result).to.equal('This is a response without a target.')
  })

  it('should handle a response with a valid JSON array', async () => {
    class TestChat extends OpenAIAssistantChat {
      @OpenAIAssistantChat.Callable('Processes a JSON array.')
      public async processArray(data: string[]): Promise<string> {
        return `Processed array with ${data.length} items`
      }
    }

    // Nastav mock odpověď s voláním metody obsahující JSON pole
    openAI = new OpenAIMockup(['TARGET system\nprocessArray(["item1", "item2", "item3"])', 'TARGET user\nArray processed'])
    const testChat = new TestChat(openAI as any, 'You are a helpful assistant.')

    const response = await testChat.prompt('Process this array.', 5)

    expect(response).to.equal('Array processed')
  })

  it('should handle a response with a malformed target', async () => {
    class TestChat extends OpenAIAssistantChat {}

    // Nastav mock odpověď s neplatným cílem
    openAI = new OpenAIMockup(['TARGET unknown\nThis is an invalid target.', 'TARGET user\nsecond try'])
    const testChat = new TestChat(openAI as any, 'You are a helpful assistant.')
    const result = await testChat.prompt('What is this?', 5)
    expect(result).to.equal('This is an invalid target.')
  })
})