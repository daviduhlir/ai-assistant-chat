import { ChatMessage, ChatOutputMessage } from '../interfaces'

export interface ChatExecutionResult extends ChatOutputMessage {
  usage: number
}

/**
 * @class AIProvider
 * @brief Abstract base class for AI providers.
 *
 * The `AIProvider` class defines a standard interface for executing chat interactions
 * with an AI model. It provides an abstraction layer for integrating different AI providers
 * by implementing the `executeChat` method.
 *
 * @details
 * - This class is designed to be extended by specific AI provider implementations.
 * - The `executeChat` method must be implemented to handle chat messages and return
 *   a result containing the AI's response and token usage.
 */
export abstract class AIProvider {
  /**
   * @brief Executes a chat interaction with the AI model.
   * @param messages An array of chat messages representing the conversation history.
   * @returns A promise that resolves to a `ChatExecutionResult` containing the AI's response and token usage.
   * @throws An error if the chat execution fails.
   */
  //abstract executeChat(messages: ChatMessage[]): Promise<ChatExecutionResult>

  /**
   * Creates thread and returns thread ID
   */
  abstract createThread(instructions: string, messages: ChatMessage[]): Promise<string>

  /**
   * Add message to thread
   */
  abstract addMessageToThread(threadId: string, message: ChatMessage): Promise<void>

  /**
   * Execute thread and returns result
   */
  abstract executeThread(threadId: string): Promise<ChatExecutionResult>

  /**
   * Remove thread from memory
   */
  abstract removeThread(threadId: string): Promise<void>
}
