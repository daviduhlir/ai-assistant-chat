import OpenAI from 'openai'
import { Assistant } from '../components/Assistant'
import { OpenAIChatProvider, OpenAIChatProviderOptions, OPENAI_CHAT_PROVIDER_DEFAULT_OPTIONS } from './OpenAIChatProvider'
import { CallFunctionParameter } from '../interfaces'
import { KnowledgeAgent } from '../components/KnowledgeAgent'

/**
 * @class OpenAIAssistant
 * @brief Specialized implementation of AssistantChat for OpenAI.
 *
 * The `OpenAIAssistant` class provides a concrete implementation of the `Assistant` class
 * using OpenAI's API. It simplifies the integration by automatically configuring the `OpenAIProvider`
 * with the provided options.
 *
 * @details
 * - This class is designed to work specifically with OpenAI's API.
 * - It uses the `OpenAIProvider` to handle communication with OpenAI's chat API.
 * - Developers can use this class to create an assistant with predefined system instructions and message history.
 */
export class OpenAIAssistant extends Assistant {
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
   * @brief Constructs a new OpenAIAssistantChat instance.
   * @param openAI An instance of the OpenAI client.
   * @param systemInstructions Instructions describing the assistant's role and behavior.
   * @param messages (Optional) A history of chat messages.
   * @param options (Optional) Configuration options for the OpenAI provider.
   */
  constructor(
    openAI: OpenAI,
    systemInstructions: string,
    readonly options: Partial<OpenAIChatProviderOptions> = OPENAI_CHAT_PROVIDER_DEFAULT_OPTIONS,
    initialMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [],
    knowledgeAgent?: KnowledgeAgent,
  ) {
    super(
      new OpenAIChatProvider(openAI, { ...OPENAI_CHAT_PROVIDER_DEFAULT_OPTIONS, ...options }, initialMessages),
      systemInstructions,
      knowledgeAgent,
    )
  }

  /**
   * Get all thread messages without summarization
   * @param threadId
   * @returns
   */
  public getMessages(threadId: string): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    return (this.aiProvider as OpenAIChatProvider).getMessages(threadId)
  }
}
