import OpenAI from 'openai'
import { AssistantChat } from '@david.uhlir/ai-assistant-chat'

async function main() {
  // Create an instance of OpenAI client
  const openAI = new OpenAI({ apiKey: 'your-secret-key' })

  // Register a callable method
  class MyChat extends AssistantChat {
    @AssistantChat.Callable('Get magic number.')
    public async getMagicNumber(): Promise<string> {
      return `42`
    }

    @AssistantChat.Callable('Reverse any string from input.')
    public async reverseWord(input: string): Promise<string> {
      console.log('=Reverse method used=')
      return input.split('').reverse().join('')
    }
  }

  // Create an instance of AssistantChat
  const chat = new MyChat(openAI, 'You are a helpful assistant.')

  // Send a prompt to the assistant
  const text = 'Hello, can you tell me magic number?'
  //const text = 'Hello, can you reverse the word "hello"?'
  const response = await chat.prompt(text)
  console.log('->', text)
  console.log('<-', response)
}

main()
