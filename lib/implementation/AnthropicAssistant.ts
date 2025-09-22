import Anthropic from '@anthropic-ai/sdk'
import { Assistant, AssistantOptions } from '../components/Assistant'
import { AnthropicChatProvider, AnthropicChatProviderOptions, ANTHROPIC_CHAT_PROVIDER_DEFAULT_OPTIONS } from './AnthropicChatProvider'
import { CallFunctionParameter } from '../interfaces'

/**
 * @class AnthropicAssistant
 * @brief Specialized implementation of AssistantChat for Anthropic Claude.
 *
 * The `AnthropicAssistant` class provides a concrete implementation of the `Assistant` class
 * using Anthropic's API. It simplifies the integration by automatically configuring the `AnthropicChatProvider`
 * with the provided options.
 *
 * @details
 * - This class is designed to work specifically with Anthropic's API.
 * - It uses the `AnthropicChatProvider` to handle communication with Anthropic's messages API.
 * - Developers can use this class to create an assistant with predefined system instructions and message history.
 */

export interface AnthropicAssistantOptions extends AssistantOptions, AnthropicChatProviderOptions {}

export class AnthropicAssistant extends Assistant {
  /**
   * @brief Decorator to register a method in the `callables` object.
   * @param description A description of the method being registered.
   */
  public static Callable(description: string, name?: string, parameters?: CallFunctionParameter[]) {
    return function <T extends { [key: string]: any }>(
      target: T,
      memberName: keyof T,
      descriptor: TypedPropertyDescriptor<(...args: any[]) => Promise<string>>,
    ) {
      Assistant.Callable(description, name, parameters)(target, memberName, descriptor)
    }
  }

  /**
   * @brief Constructs a new AnthropicAssistant instance.
   * @param anthropic An instance of the Anthropic client.
   * @param systemInstructions Instructions describing the assistant's role and behavior.
   * @param messages (Optional) A history of chat messages.
   * @param options (Optional) Configuration options for the Anthropic provider.
   */
  constructor(
    anthropic: Anthropic,
    systemInstructions: string,
    options: Partial<AnthropicAssistantOptions> = ANTHROPIC_CHAT_PROVIDER_DEFAULT_OPTIONS,
    initialMessages: Anthropic.MessageParam[] = [],
  ) {
    super(
      new AnthropicChatProvider(anthropic, { ...ANTHROPIC_CHAT_PROVIDER_DEFAULT_OPTIONS, ...options }, initialMessages),
      systemInstructions,
      options,
    )
  }

  /**
   * Get all thread messages without summarization
   * @param threadId
   * @returns
   */
  public getMessages(threadId: string): Anthropic.MessageParam[] {
    return (this.aiProvider as AnthropicChatProvider).getMessages(threadId)
  }
}
