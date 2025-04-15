import OpenAI from 'openai'
import { Assistant, AssistantOptions } from '../components/Assistant'
import { OpenAIChatProvider, OpenAIChatProviderOptions, OpenAIChatProviderOptionsDefault } from './OpenAIChatProvider'
import { ChatMessage } from '../interfaces'
import { OpenAIThreadProvider, OpenAIThreadProviderOptions, OpenAIThreadProviderOptionsDefault } from './OpenAIThreadProvider'

export interface OpenAIAssistantOptions {
  model: string
  temperature: number
  type: 'thread' | 'chat'
  assistantName?: string // only for thread
  tools?: any[]
}

export const OpenAIAssistantOptionsDefault: OpenAIAssistantOptions = {
  model: 'gpt-3.5-turbo',
  temperature: 0.2,
  type: 'thread',
  assistantName: 'Assistant',
  tools: [],
}

/**
 * @class OpenAIAssistantChat
 * @brief Specialized implementation of AssistantChat for OpenAI.
 *
 * The `OpenAIAssistantChat` class provides a concrete implementation of the `AssistantChat` class
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
  public static Callable(description: string, signature?: string) {
    return function <T extends { [key: string]: any }>(
      target: T,
      memberName: keyof T,
      descriptor: TypedPropertyDescriptor<(...args: any[]) => Promise<string>>,
    ) {
      Assistant.Callable(description, signature)(target, memberName, descriptor)
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
    messages: ChatMessage[] = [],
    readonly options: Partial<OpenAIAssistantOptions> = OpenAIAssistantOptionsDefault,
  ) {
    super(
      options.type === 'thread'
        ? new OpenAIThreadProvider(openAI, { ...OpenAIThreadProviderOptionsDefault, ...options } as OpenAIThreadProviderOptions)
        : options.type === 'chat'
        ? new OpenAIChatProvider(openAI, { ...OpenAIChatProviderOptionsDefault, ...options } as OpenAIChatProviderOptions)
        : null,
      systemInstructions,
      messages,
      options as AssistantOptions,
    )
  }
}
