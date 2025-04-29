import { CallFunctionParameter, ChatInputMessage, ChatOutputMessage, ChatOutputToolCallMessage } from '../interfaces'

export type ChatExecutionResult = ChatOutputMessage | ChatOutputToolCallMessage
export interface AIProviderFunction {
  name: string
  description: string
  parameters: CallFunctionParameter[]
}

/**
 * @class AIProvider
 * @brief Abstract base class for AI providers.
 *
 * The `AIProvider` class defines a standard interface for executing chat interactions
 * with an AI model. It provides an abstraction layer for integrating different AI providers
 * by implementing the `executeThread` method.
 *
 * @details
 * - This class is designed to be extended by specific AI provider implementations.
 * - The `executeThread` method must be implemented to handle chat messages and return
 *   a result containing the AI's response and token usage.
 */
export abstract class AIProvider {
  /**
   * Creates thread and returns thread ID
   */
  abstract createThread(instructions: string, tools?: AIProviderFunction[]): Promise<string>

  /**
   * Add message to thread
   */
  abstract addMessageToThread(threadId: string, message: ChatInputMessage): Promise<void>

  /**
   * Execute thread and returns result
   */
  abstract executeThread(threadId: string): Promise<ChatExecutionResult>

  /**
   * Remove thread from memory
   */
  abstract removeThread(threadId: string): Promise<void>

  /**
   * Try to search in history
   */
  async searchHistory(threadId: string, text?: string, timeRange?: [number, number]): Promise<string> {
    return 'nothing found, history is not implemented'
  }
}
