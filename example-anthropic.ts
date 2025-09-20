import Anthropic from '@anthropic-ai/sdk'
import { AnthropicAssistant } from './lib/implementation/AnthropicAssistant'

// Example showing how to use AnthropicAssistant similar to OpenAIAssistant

// Create an instance of Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || 'your-api-key',
})

// Register a callable method
class MyAnthropicAssistant extends AnthropicAssistant {
  @AnthropicAssistant.Callable('Get user ID by name.')
  public async getUserId(name: string): Promise<string> {
    return `42`
  }

  @AnthropicAssistant.Callable('Get current weather for a location.')
  public async getWeather(location: string): Promise<string> {
    return `The weather in ${location} is sunny and 22°C`
  }
}

async function main() {
  // Create an instance of Assistant
  const assistant = new MyAnthropicAssistant(
    anthropic,
    'You are a helpful assistant that can look up user information and weather data.',
    {
      model: 'claude-3-5-sonnet-20241022',
      temperature: 0.3,
      maxTokens: 1000,
    }
  )

  try {
    // Example 1: Simple conversation
    console.log('Example 1: Simple conversation')
    const response1 = await assistant.prompt('Hello! What can you help me with?', 5)
    console.log('Assistant:', response1)
    console.log()

    // Example 2: Function calling
    console.log('Example 2: Function calling')
    const response2 = await assistant.prompt('What is my user ID?', 5)
    console.log('Assistant:', response2)
    console.log()

    // Example 3: Another function call
    console.log('Example 3: Weather query')
    const response3 = await assistant.prompt('What is the weather like in Prague?', 5)
    console.log('Assistant:', response3)
    console.log()

    console.log('Usage:', assistant.getUsage(), 'tokens')
  } catch (error) {
    console.error('Error:', error)
  }
}

// Run the example (uncomment the line below to test)
// main()

export { MyAnthropicAssistant }