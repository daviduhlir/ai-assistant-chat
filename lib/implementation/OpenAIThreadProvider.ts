import OpenAI from 'openai'
import { ChatMessage, ChatOutputMessage } from '../interfaces'
import { AIProvider, ChatExecutionResult } from '../components/AIProvider'

export interface OpenAIThreadProviderOptions {
  model: string
  temperature: number
  assistantName: string
  tools: any[]
}

export const OpenAIThreadProviderOptionsDefault: OpenAIThreadProviderOptions = {
  model: 'gpt-3.5-turbo',
  temperature: 0.2,
  assistantName: 'Assistant',
  tools: [],
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
export class OpenAIThreadProvider extends AIProvider {
  protected assistant: OpenAI.Beta.Assistant
  constructor(protected openAI: OpenAI, protected options: OpenAIThreadProviderOptions = OpenAIThreadProviderOptionsDefault) {
    super()
  }

  /**
   * Gets the entire message history for a thread.
   * @param threadId The ID of the thread.
   * @returns An array of chat messages exchanged in the thread.
   */
  public async getMessages(threadId: string): Promise<ChatMessage[]> {
    return (await this.openAI.beta.threads.messages.list(threadId)).data.map(
      msg =>
        ({
          role: msg.role,
          content: this.mergeMessagesContent(msg.content),
        } as ChatMessage),
    )
  }

  /**
   * Creates a new thread with an optional initial set of messages.
   * @param messages Initial messages for the thread.
   * @returns The ID of the newly created thread.
   */
  public async createThread(instructions: string, messages: ChatMessage[] = []): Promise<string> {
    try {
      this.assistant = await this.openAI.beta.assistants.create({
        name: this.options.assistantName,
        instructions: 'Pomáhej uživatelům s jejich otázkami.',
        tools: this.options.tools,
        model: this.options.model,
      })

      const response = await this.openAI.beta.threads.create()

      await this.openAI.beta.threads.messages.create(response.id, {
        role: 'user',
        content: instructions,
      })

      for (const message of messages) {
        await this.openAI.beta.threads.messages.create(response.id, {
          role: message.role as any,
          content: message.content as any,
        })
      }
      return response.id
    } catch (e) {
      console.error(e)
      throw e
    }
  }

  /**
   * Adds a message to an existing thread.
   * @param threadId The ID of the thread.
   * @param message The message to add.
   */
  public async addMessageToThread(threadId: string, message: ChatMessage): Promise<void> {
    try {
      await this.openAI.beta.threads.messages.create(threadId, {
        role: message.role as any,
        content: message.content as any,
      })
    } catch (e) {
      console.error(e)
      throw e
    }
  }

  /**
   * Executes a thread using OpenAI's thread API.
   * @param threadId The ID of the thread to execute.
   * @returns The result of the thread execution, including the assistant's response and token usage.
   */
  public async executeThread(threadId: string): Promise<ChatExecutionResult> {
    const run = await this.runAssistant(threadId)
    const result = await this.getLastAssistantMessage(threadId, run.id)
    return {
      role: result.role,
      content: result.content,
      usage: run.usage || 0,
    }
  }

  /**
   * Removes a thread from memory.
   * @param threadId The ID of the thread to remove.
   */
  public async removeThread(threadId: string): Promise<void> {
    // not posible now
  }

  /**
   * Internal methods
   */
  /**
   * Runs the assistant for a given thread.
   * @param threadId
   * @returns
   */
  protected async runAssistant(threadId: string) {
    const run = await this.openAI.beta.threads.runs.create(threadId, {
      assistant_id: this.assistant.id,
    })
    return {
      id: run.id,
      usage: run?.usage?.total_tokens || 0,
    }
  }

  /**
   * Get the result of a run.
   * @param threadId
   * @param runId
   * @returns
   */
  protected async getRunResult(threadId: string, runId: string): Promise<OpenAI.Beta.Threads.Messages.Message[]> {
    let itteration = 0
    const delay = 500 // Začínáme s 500ms
    while (true) {
      if (++itteration > 100) {
        console.log('Max itterations when waiting result reached')
        return []
      }
      await new Promise(resolve => setTimeout(resolve, delay))
      const run = await this.openAI.beta.threads.runs.retrieve(threadId, runId)
      if (run.status === 'completed') {
        const messages = await this.openAI.beta.threads.messages.list(threadId)
        return messages.data
      }
    }
  }

  /**
   * Get last assistant message from the thread.
   * @param threadId
   * @param runId
   * @returns
   */
  protected async getLastAssistantMessage(threadId: string, runId: string): Promise<ChatOutputMessage> {
    const messages = await this.getRunResult(threadId, runId)
    //console.log(messages)
    const lastAssistantMessage = messages.find(msg => msg.role === 'assistant')
    if (!lastAssistantMessage) {
      throw new Error('No assistant message found in the thread.')
    }
    return {
      role: 'assistant',
      content: this.mergeMessagesContent(lastAssistantMessage.content),
    }
  }

  /**
   * Merge messages by role.
   * @param messages
   * @param role
   * @returns
   */
  protected mergeMessagesContent(content: OpenAI.Beta.Threads.Messages.MessageContent[]): string {
    if (typeof content === 'string') {
      return content
    }
    return content
      .filter(content => content.type === 'text') // Vybereme jen ty, co mají type "text"
      .map(content => (content as { type: 'text'; text: { value: string } }).text.value) // Extrahujeme text
      .join('\n')
  }
}
