import OpenAI from 'openai'
import { AssistantChat } from '@david.uhlir/ai-assistant-chat'

async function main() {
  // Create an instance of OpenAI client
  const openAI = new OpenAI({ apiKey: 'your-api-key' })

  // Create an instance of AssistantChat
  const chat = new AssistantChat(openAI, 'You are a helpful assistant.')

  // Register a callable method
  class MyChat extends AssistantChat {
    @AssistantChat.Callable('Greets a user by name.')
    public async greet(name: string): Promise<string> {
      return `Hello, ${name}!`
    }
  }

  // Send a prompt to the assistant
  const response = await chat.prompt('What is my user ID?', 5)
  console.log(response)
}

main()
