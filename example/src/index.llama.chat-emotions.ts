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

  let emotions = {
    happy: 0,
    sad: 0,
    angry: 0,
    excited: 0,
    bored: 0,
  }
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

    @LlamaAssistant.Callable('Update your emotion.')
    public async setEmotion(emotion: string, increase: number = 1): Promise<string> {
      console.log('Updating emotion...')
      if (!emotions[emotion]) {
        emotions[emotion] = 0
      }
      emotions[emotion] += increase
      console.log(emotions)
      return 'done'
    }

    @LlamaAssistant.Callable('Get your emotion.')
    public async getEmotion(): Promise<string> {
      console.log('Getting emotion...')
      //return this.getEmotionMessagePrefix()
      return JSON.stringify(emotions)
    }
  }

  // Create an instance of AssistantChat
  const chat = new MyChat(`
    You are a friend with emotions, which has emotions.
    IMPORTANT! Always update your emotions with tool depending on the conversation, also before your responses
    IMPORTANT! Always include your emotion and your stylize your message depending on your emotion.
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
