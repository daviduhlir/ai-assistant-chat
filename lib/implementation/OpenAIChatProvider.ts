import OpenAI from 'openai'
import { ChatInputMessage, ChatMessageInputBufferContent } from '../interfaces'
import { AIProvider, AIProviderFunction, ChatExecutionResult } from '../components/AIProvider'
import { randomHash } from '../utils'

export interface OpenAIChatProviderOptions {
  model: string
  temperature: number
  summarizeAfter?: number
  summarizeKeepLastMessages?: number
}

export const OpenAIChatProviderOptionsDefault: OpenAIChatProviderOptions = {
  model: 'gpt-4o-mini',
  temperature: 0.2,
  summarizeAfter: 10,
  summarizeKeepLastMessages: 2,
}

/**
 * @class OpenAiProvider
 * @brief Implementation of the AIProvider interface for OpenAI.
 *
 * The `OpenAiProvider` class integrates with OpenAI's API to handle chat interactions.
 * It extends the `AIProvider` abstract class and provides a concrete implementation
 * of the `executeChat` method.
 *
 * @details
 * - This class uses OpenAI's `chat.completions.create` API to send messages and retrieve responses.
 * - It supports configurable options such as the model and temperature.
 * - The `executeChat` method processes the conversation history and returns the AI's response along with token usage.
 */
export class OpenAIChatProvider extends AIProvider {
  constructor(
    protected openAI: OpenAI,
    protected options: OpenAIChatProviderOptions = OpenAIChatProviderOptionsDefault,
    readonly initialMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [],
  ) {
    super()
  }

  protected tools: AIProviderFunction[] = []
  protected threads: Map<
    string,
    {
      instructions: string
      messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
      history: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
    }
  > = new Map()
  protected SUMMARIZE_PROMPT = (summarizeKeepLastMessages: number) => `
    Your task is to create a concise summary of the conversation so that another assistant can understand what has been discussed.

    - You may create multiple summaries if the conversation contains distinct topics.
    - Keep any global instructions or preferences that the user has shared.
    - Include key actions you (the assistant) performed.
    - Preserve the last active task (if there is one) as raw messages with roles, not summarized.
      - Keep at most the last ${summarizeKeepLastMessages} messages related to the active task.
      - If any of these messages exceed 1000 words, replace that message with its own concise summary (max. 100 words) prefixed with “Summary of long message:”.
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

    const convertedMessage = OpenAIChatProvider.transformInputMessage(message)
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
    const result = await this.runCompletion([{ role: 'system', content: thread.instructions }, ...thread.messages], this.tools)
    if (!(result as any).timestamp) {
      ;(result as any).timestamp = Date.now()
    }
    thread.messages.push(result)
    thread.history.push(result)

    if (result?.tool_calls) {
      return {
        ...result,
        functionCall: result.tool_calls.map((tool_call: any) => {
          const argsParsed = JSON.parse(tool_call.function.arguments)
          return {
            id: tool_call.id,
            name: tool_call.function.name,
            arguments: Object.keys(argsParsed).map(key => ({
              name: key,
              value: argsParsed[key],
            })),
          }
        }),
      }
    }
    return result
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
        if (typeof message?.content === 'string') {
          return message.content.toLowerCase().includes(text.toLowerCase())
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
        const content = typeof message.content === 'string' ? (message.content as string) : `${(message.content as any).message} \n [binnary]`
        return `${message.role}: ${content}`
      })
      .join('\n')
  }

  /**
   * Get all thread messages without summarization
   * @param threadId
   * @returns
   */
  public getMessages(threadId: string): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    const thread = this.threads.get(threadId)
    if (!thread) {
      throw new Error(`Thread with ID ${threadId} not found.`)
    }
    return thread.history
  }

  /**
   *
   * Internal methods
   *
   */

  /**
   * Execute chat internaly
   * @param messages
   * @returns
   */
  protected async runCompletion(
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    tools: AIProviderFunction[] = [],
  ): Promise<OpenAI.Chat.Completions.ChatCompletionMessage> {
    const preapredTools = tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
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
      },
    }))

    const response = await this.openAI.chat.completions.create({
      model: this.options.model,
      temperature: this.options.temperature,
      messages,
      tools: preapredTools as any,
    })

    return response.choices[0].message
  }

  /**
   * Summarize messages in a thread
   * @param threadId
   */
  protected async summarizeMessages(threadId: string): Promise<void> {
    const thread = this.threads.get(threadId)
    if (!thread) {
      throw new Error(`Thread with ID ${threadId} not found.`)
    }
    const summaryResult = await this.runCompletion([
      {
        role: 'system',
        content: this.SUMMARIZE_PROMPT(this.options.summarizeKeepLastMessages || 2),
      },
      ...thread.messages,
    ])
    if (summaryResult?.content) {
      thread.messages = [{ role: 'system', content: `Summary of the previous conversation: ${summaryResult.content}` }]
      this.threads.set(threadId, thread)
    }
  }

  /**
   * Transform input message to OpenAI format
   */
  protected static transformInputMessage(message: ChatInputMessage): OpenAI.Chat.Completions.ChatCompletionMessageParam {
    if (typeof message.content === 'string') {
      return {
        role: message.role as any,
        content: message.content,
        tool_call_id: message.functionCallId,
      }
    } else if (Buffer.isBuffer((message.content as any)?.buffer)) {
      const bufferMessage: ChatMessageInputBufferContent = message.content as any
      return {
        role: message.role as any,
        tool_call_id: message.functionCallId,
        content: {
          type: 'image_url',
          image_url: { url: `data:image/jpeg;base64,${bufferMessage.buffer.toString('base64')}` },
        } as any,
      }
    } else {
      throw new Error(`Invalid message content type: ${typeof message.content}`)
    }
  }
}
