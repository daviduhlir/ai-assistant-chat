
import Anthropic from '@anthropic-ai/sdk'
import { AnthropicAssistant, FsToolSet } from '@david.uhlir/ai-assistant-chat'
import { createFsFromVolume, Volume } from 'memfs'

async function main() {

  const volume = new Volume()
  const volumeFs = createFsFromVolume(volume)
  const fsToolSet = new FsToolSet(volumeFs.promises as any)

  // Create an instance of Anthropic client
  const anthropic = new Anthropic({ apiKey: process.env.apiKey || 'your-api-key' })
  // Register a callable method
  class MyChat extends AnthropicAssistant {}

  // Create an instance of AssistantChat
  const chat = new MyChat(anthropic, 'You are a helpful assistant.', {
    toolsets: [fsToolSet],
    debugTools: true,
  })

  // Send a prompt to the assistant
  const text = 'Ahoj, vyrob mi tady v prázdným filesystému nějaký hezky typescript ptojekt, stačí malý hello world. bez buildu, bez initu, jen zdrojáky.'
  //const text = 'Hello, can you reverse the word "hello"?'
  const response = await chat.prompt(text)
  console.log('->', text)
  console.log('<-', response)

  // dump FS
  console.log(volume.toJSON())
}

main()