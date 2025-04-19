import OpenAI from 'openai'
import { ChatInputMessage, ChatMessage, ChatMessageInputBufferContent, ChatMessageOutputContent, ChatOutputMessage } from '../interfaces'
import { AIProvider, ChatExecutionResult } from '../components/AIProvider'
import { randomHash } from '../utils'

export interface OpenAIChatProviderOptions {
  model: string
  temperature: number
  summarizeAfter?: number
}

export const OpenAIChatProviderOptionsDefault: OpenAIChatProviderOptions = {
  model: 'gpt-3.5-turbo',
  temperature: 0.2,
  summarizeAfter: 10,
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
  constructor(protected openAI: OpenAI, protected options: OpenAIChatProviderOptions = OpenAIChatProviderOptionsDefault) {
    super()
  }

  protected threads: Map<string, { instructions: string; messages: ChatMessage[]; history: ChatMessage[] }> = new Map()

  /**
   * Gets whole messages history
   * @returns An array of chat messages exchanged between the user and the assistant.
   * @example
   * const messages = assistantChat.getMessages();
   * console.log(messages);
   * // Output: [
   * //   { role: 'user', content: 'Hello?' },
   * //   { role: 'assistant', content: 'Hello, user!' },
   * //   { role: 'user', content: 'This is the final response.' }
   * // ]
   */
  public getMessages(threadId: string): ChatMessage[] {
    return this.threads.get(threadId)?.messages || []
  }

  /**
   * Creates thread
   * @param messages
   * @returns
   */
  public async createThread(instructions: string, messages: ChatMessage[] = []): Promise<string> {
    const threadId = randomHash()
    this.threads.set(threadId, { messages, instructions, history: [...messages] })
    return threadId
  }

  /**
   * Add message to thread
   * @param threadId
   * @param message
   */
  public async addMessageToThread(threadId: string, message: ChatMessage): Promise<void> {
    const thread = this.threads.get(threadId)
    if (!thread) {
      throw new Error(`Thread with ID ${threadId} not found.`)
    }
    if (this.options.summarizeAfter && thread.messages.length > this.options.summarizeAfter) {
      await this.summarizeMessages(threadId)
    }
    thread.history.push(message)
    thread.messages.push(message)
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
    const result = await this.runCompletion([{ role: 'system', content: thread.instructions }, ...thread.messages])
    thread.messages.push(result)
    thread.history.push(result)
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
   * Try to search in history
   */
  public async searchHistory(threadId: string, text: string) {
    const thread = this.threads.get(threadId)
    if (!thread) {
      throw new Error(`Thread with ID ${threadId} not found.`)
    }
    const found = thread.history.find(message => {
      if (typeof message.content === 'string') {
        return message.content.toLowerCase().includes(text.toLowerCase())
      } else if (Buffer.isBuffer((message.content as any)?.buffer)) {
        const bufferMessage: ChatMessageInputBufferContent = message.content as any
        return bufferMessage.message?.toLowerCase().includes(text.toLowerCase())
      }
    })

    if (!found) {
      return 'Nothing was found in the history.'
    }
    return typeof found.content === 'string' ? (found.content as string) : `Binnary with message ${(found.content as any).message}`
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
  protected async runCompletion(messages: ChatMessage[]): Promise<ChatExecutionResult> {
    const messagesToSend = messages.reduce<ChatInputMessage[]>((acc, message) => {
      if (typeof message.content === 'string') {
        return [
          ...acc,
          {
            role: message.role,
            content: message.content,
          } as ChatInputMessage,
        ]
      } else if (Buffer.isBuffer((message.content as any)?.buffer)) {
        const bufferMessage: ChatMessageInputBufferContent = message.content as any
        return [
          ...acc,
          {
            role: message.role,
            content: {
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${bufferMessage.buffer.toString('base64')}` },
            },
          } as ChatInputMessage,
          bufferMessage?.message
            ? {
                role: message.role,
                content: bufferMessage.message,
              }
            : null,
        ].filter(Boolean) as ChatInputMessage[]
      } else {
        throw new Error(`Invalid message content type: ${typeof message.content}`)
      }
    }, [])

    const response = await this.openAI.chat.completions.create({
      model: this.options.model,
      temperature: this.options.temperature,
      messages: messagesToSend as any,
    })

    return {
      role: response.choices[0].message.role,
      content: response.choices[0].message.content || '',
      usage: response.usage?.total_tokens || 0,
    }
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
        content: `Your task is to create a concise summary of the conversation so that another assistant can understand what has been discussed. Please keep details about actions you did and global directives, that user sent you.`,
      },
      ...thread.messages,
    ])
    thread.messages = [{ role: 'system', content: `Summary of the previous conversation: ${summaryResult.content}` }]
    this.threads.set(threadId, thread)
  }
}
