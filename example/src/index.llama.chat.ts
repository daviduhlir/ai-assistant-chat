import * as readline from 'readline'
import { LlamaAssistant } from '@david.uhlir/ai-assistant-chat'
import { promises as fs } from 'fs'

export function askUser(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  // Register a callable method
  class MyChat extends LlamaAssistant {
    @LlamaAssistant.Callable('Get content of your memory.')
    public async getMemory(): Promise<string> {
      console.log('Getting memory...')
      try {
        return fs.readFile('./memory.md', 'utf8')
      } catch (e) {
        return 'No memory yet.'
      }
    }

    @LlamaAssistant.Callable('Store content to your memory.')
    public async setMemory(content: string): Promise<string> {
      await fs.writeFile('./memory.md', content)
      return 'done'
    }
  }

  // Create an instance of AssistantChat
  const chat = new MyChat(`
    You are a helpful assistant.
    IMPORTANT: Read a memory first, with /tool:getMemory
  ` ,{
    baseUrl: 'http://localhost:5000',
    model: 'meta-llama-3-8b',
    temperature: 0.7,
  })


  let exited = false
  while(!exited) {
    const message = await askUser('> ')
    if (message === '/exit') {
      exited = true
      break
    }
    console.log('----------------------------------------------')
    const response = await chat.prompt(message)
    console.log(response)
    console.log('----------------------------------------------')
  }
}

main()
