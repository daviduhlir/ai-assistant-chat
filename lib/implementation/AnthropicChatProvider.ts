import Anthropic from '@anthropic-ai/sdk'
import { ChatInputMessage, ChatMessageInputBufferContent, AIProviderFunction, ChatExecutionResult } from '../interfaces'
import { AIProvider } from '../components/AIProvider'
import { randomHash } from '../utils'

export interface AnthropicChatProviderOptions {
  model: string
  temperature: number
  summarizeAfter?: number
  summarizeKeepLastMessages?: number
  maxTokens?: number
}

export const ANTHROPIC_CHAT_PROVIDER_DEFAULT_OPTIONS: AnthropicChatProviderOptions = {
  model: 'claude-3-5-sonnet-20241022',
  temperature: 0.2,
  summarizeAfter: 10,
  summarizeKeepLastMessages: 2,
  maxTokens: 1000,
}

/**
 * @class AnthropicChatProvider
 * @brief Implementation of the AIProvider interface for Anthropic Claude.
 *
 * The `AnthropicChatProvider` class integrates with Anthropic's API to handle chat interactions.
 * It extends the `AIProvider` abstract class and provides a concrete implementation
 * of the `executeThread` method.
 *
 * @details
 * - This class uses Anthropic's `messages.create` API to send messages and retrieve responses.
 * - It supports configurable options such as the model and temperature.
 * - The `executeThread` method processes the conversation history and returns the AI's response along with token usage.
 */
export class AnthropicChatProvider extends AIProvider {
  constructor(
    protected anthropic: Anthropic,
    protected options: AnthropicChatProviderOptions = ANTHROPIC_CHAT_PROVIDER_DEFAULT_OPTIONS,
    readonly initialMessages: Anthropic.MessageParam[] = [],
  ) {
    super()
  }

  protected usage: number = 0
  protected tools: AIProviderFunction[] = []
  protected threads: Map<
    string,
    {
      instructions: string
      messages: Anthropic.MessageParam[]
      history: Anthropic.MessageParam[]
    }
  > = new Map()
  protected SUMMARIZE_PROMPT = (summarizeKeepLastMessages: number) => `
    Your task is to create a concise summary of the conversation so that another assistant can understand what has been discussed.

    - You may create multiple summaries if the conversation contains distinct topics.
    - Keep any global instructions or preferences that the user has shared.
    - Include key actions you (the assistant) performed.
    - Preserve the last active task (if there is one) as raw messages with roles, not summarized.
      - Keep at most the last ${summarizeKeepLastMessages} messages related to the active task.
      - If any of these messages exceed 1000 words, replace that message with its own concise summary (max. 100 words) prefixed with "Summary of long message:".
      - If there is no active task, you can omit this section.

    Format the output exactly as:

    ### Summary
    […summary by topics…]

    ### Last Active Task (if any)
    User: …
    Assistant: …
    …
  `

  /**
   * Sets the summarize prompt.
   * @param prompt The prompt to set for summarization.
   */
  public setSummarizePrompt(prompt: (summarizeKeepLastMessages: number) => string): void {
    this.SUMMARIZE_PROMPT = prompt
  }

  /**
   * Creates thread
   * @param messages
   * @returns
   */
  public async createThread(instructions: string, tools: AIProviderFunction[] = []): Promise<string> {
    this.tools = tools
    const threadId = randomHash()
    this.threads.set(threadId, { messages: [...this.initialMessages], instructions, history: [...this.initialMessages] })
    return threadId
  }

  /**
   * Add message to thread
   * @param threadId
   * @param message
   */
  public async addMessageToThread(threadId: string, message: ChatInputMessage): Promise<void> {
    const thread = this.threads.get(threadId)
    if (!thread) {
      throw new Error(`Thread with ID ${threadId} not found.`)
    }
    if (this.options.summarizeAfter && thread.messages.length > this.options.summarizeAfter) {
      await this.summarizeMessages(threadId)
    }
    if (!message.timestamp) {
      message.timestamp = Date.now()
    }

    if (!message.functionCallId && this.toolInProgress) {
      throw new Error('You need to wait for the tool to finish before sending a new message.')
    }

    const convertedMessage = AnthropicChatProvider.transformInputMessage(message)
    thread.history.push(convertedMessage)
    thread.messages.push(convertedMessage)
    this.threads.set(threadId, thread)
  }

  /**
   * Execute thread
   * @param threadId
   * @returns
   */
  public async executeThread(threadId: string): Promise<ChatExecutionResult> {
    const thread = this.threads.get(threadId)
    if (!thread) {
      throw new Error(`Thread with ID ${threadId} not found.`)
    }
    const result = await this.runCompletion(thread.instructions, thread.messages, this.tools)
    if (!(result as any).message?.timestamp) {
      ;(result as any).message.timestamp = Date.now()
    }

    // Convert Anthropic response to our format
    const messageParam: Anthropic.MessageParam = {
      role: 'assistant',
      content: result.message.content,
    }
    thread.messages.push(messageParam)
    thread.history.push(messageParam)

    // Check for tool use in message content
    const toolUseBlocks = Array.isArray(result.message.content) ? result.message.content.filter(block => block.type === 'tool_use') : []

    if (toolUseBlocks.length > 0) {
      this.toolInProgress = true
      return {
        role: 'assistant',
        timestamp: Date.now(),
        type: 'tool_call',
        functionCall: toolUseBlocks.map((tool_call: any) => ({
          id: tool_call.id,
          name: tool_call.name,
          arguments: Object.keys(tool_call.input || {}).map(key => ({
            name: key,
            value: tool_call.input[key],
          })),
        })),
      }
    }
    this.toolInProgress = false

    // Extract text content
    let content = ''
    if (typeof result.message.content === 'string') {
      content = result.message.content
    } else if (Array.isArray(result.message.content)) {
      const textBlocks = result.message.content.filter(block => block.type === 'text')
      content = textBlocks.map((block: any) => block.text).join('')
    }

    return {
      role: 'assistant',
      content,
      timestamp: Date.now(),
    }
  }

  /**
   * Remove thread from memory
   * @param threadId
   */
  public async removeThread(threadId: string): Promise<void> {
    const thread = this.threads.get(threadId)
    if (!thread) {
      throw new Error(`Thread with ID ${threadId} not found.`)
    }
    this.threads.delete(threadId)
  }

  /**
   * Try to search in history by text or time range
   * @param threadId
   * @param text
   * @param timeRange
   * @returns
   */
  public async searchHistory(threadId: string, text?: string, timeRange?: [number, number]) {
    const thread = this.threads.get(threadId)
    if (!thread) {
      throw new Error(`Thread with ID ${threadId} not found.`)
    }
    const history = thread.history.filter(message => message.content)
    let found = history
    if (text) {
      found = history.filter(message => {
        if (typeof message.content === 'string') {
          return message.content.toLowerCase().includes(text.toLowerCase())
        } else if (Array.isArray(message.content)) {
          return message.content.some(content => content.type === 'text' && content.text.toLowerCase().includes(text.toLowerCase()))
        } else if (Buffer.isBuffer((message.content as any)?.buffer)) {
          const bufferMessage: ChatMessageInputBufferContent = message.content as any
          return bufferMessage.message?.toLowerCase().includes(text.toLowerCase())
        }
      })
    }
    if (Array.isArray(timeRange)) {
      found = found.filter(message => {
        if ((message as any).timestamp) {
          return (!timeRange[0] || (message as any).timestamp >= timeRange[0]) && (!timeRange[1] || (message as any).timestamp <= timeRange[1])
        }
        return false
      })
    }

    if (!found?.length) {
      return 'Nothing was found in the history.'
    }
    return found
      .map(message => {
        let content: string
        if (typeof message.content === 'string') {
          content = message.content
        } else if (Array.isArray(message.content)) {
          content = message.content.map(c => (c.type === 'text' ? (c as any).text : '[non-text content]')).join(' ')
        } else {
          content = `${(message.content as any).message} \n [binary]`
        }
        return `${message.role}: ${content}`
      })
      .join('\n')
  }

  /**
   * Get all thread messages without summarization
   * @param threadId
   * @returns
   */
  public getMessages(threadId: string): Anthropic.MessageParam[] {
    const thread = this.threads.get(threadId)
    if (!thread) {
      throw new Error(`Thread with ID ${threadId} not found.`)
    }
    return thread.history
  }

  /**
   * Gets overall usage of completions in tokens
   */
  public getUsage(): number {
    return this.usage
  }

  /**
   *
   * Internal methods
   *
   */
  protected toolInProgress: boolean = false

  /**
   * Execute chat internally
   * @param messages
   * @returns
   */
  protected async runCompletion(
    systemPrompt: string,
    messages: Anthropic.MessageParam[],
    tools: AIProviderFunction[] = [],
  ): Promise<{ message: Anthropic.Message; usage: number }> {
    const preparedTools = tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: 'object',
        properties: tool.parameters.reduce((acc, param) => {
          acc[param.name] = {
            type: param.type,
            description: param.name,
            ...(param.default ? { default: param.default } : {}),
          }
          return acc
        }, {}),
        required: tool.parameters.filter(param => !param.default).map(param => param.name),
      },
    }))

    const response = await this.anthropic.messages.create({
      model: this.options.model,
      temperature: this.options.temperature,
      system: systemPrompt,
      messages,
      tools: preparedTools.length > 0 ? (preparedTools as any) : undefined,
      max_tokens: this.options.maxTokens,
    })

    this.usage += response.usage.input_tokens + response.usage.output_tokens
    return {
      message: response,
      usage: response.usage.input_tokens + response.usage.output_tokens,
    }
  }

  /**
   * Summarize messages in a thread
   * @param threadId
   */
  protected async summarizeMessages(threadId: string): Promise<void> {
    if (this.toolInProgress) {
      return
    }
    const thread = this.threads.get(threadId)
    if (!thread) {
      throw new Error(`Thread with ID ${threadId} not found.`)
    }
    const summaryResult = await this.runCompletion(this.SUMMARIZE_PROMPT(this.options.summarizeKeepLastMessages || 2), thread.messages)
    if (summaryResult?.message?.content) {
      let content = ''
      if (typeof summaryResult.message.content === 'string') {
        content = summaryResult.message.content
      } else if (Array.isArray(summaryResult.message.content)) {
        const textBlocks = summaryResult.message.content.filter(block => block.type === 'text')
        content = textBlocks.map((block: any) => block.text).join('')
      }
      thread.messages = [{ role: 'user', content: `Summary of the previous conversation: ${content}` }]
      this.threads.set(threadId, thread)
    }
  }

  /**
   * Transform input message to Anthropic format
   */
  protected static transformInputMessage(message: ChatInputMessage): Anthropic.MessageParam {
    // Handle tool results - Anthropic expects tool results as user messages with tool_result content
    if (message.role === 'tool' && message.functionCallId) {
      return {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: message.functionCallId,
            content: typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
          },
        ],
      } as Anthropic.MessageParam
    }

    if (typeof message.content === 'string') {
      return {
        role: message.role as 'user' | 'assistant',
        content: message.content,
      }
    } else if (Buffer.isBuffer((message.content as any)?.buffer)) {
      const bufferMessage: ChatMessageInputBufferContent = message.content as any
      return {
        role: message.role as 'user' | 'assistant',
        content: [
          {
            type: 'text',
            text: bufferMessage.message || 'Image attached',
          },
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: bufferMessage.buffer.toString('base64'),
            },
          },
        ],
      }
    } else if ((message.content as any)?.type === 'image_url') {
      const imageContent = message.content as any
      const base64Data = imageContent.image_url.url.replace(/^data:image\/[^;]+;base64,/, '')
      return {
        role: message.role as 'user' | 'assistant',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: base64Data,
            },
          },
        ],
      }
    } else {
      throw new Error(`Invalid message content type: ${typeof message.content}`)
    }
  }
}
