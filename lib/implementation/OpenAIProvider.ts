import OpenAI from 'openai'
import { ChatMessage } from '../interfaces'
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import { AIProvider, ChatExecutionResult } from '../components/AIProvider'

export interface OpenAIProviderOptions {
  model: string
  temperature: number
}

export const OpenAIProviderOptionsDefault: OpenAIProviderOptions = {
  model: 'gpt-3.5-turbo',
  temperature: 0.2,
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
export class OpenAIProvider extends AIProvider {
  constructor(protected openAI: OpenAI, protected options: OpenAIProviderOptions = OpenAIProviderOptionsDefault) {
    super()
  }

  /**
   * @brief Sends a chat message to OpenAI and retrieves the response.
   * @param messages The list of messages to send.
   * @returns A promise that resolves to a `ChatExecutionResult` containing the assistant's response, role, and token usage.
   * @throws An error if the OpenAI API call fails.
   */
  public async executeChat(messages: ChatMessage[]): Promise<ChatExecutionResult> {
    const messagesToSend = messages.reduce((acc, message) => {
      if (typeof message.content === 'string') {
        return [
          ...acc,
          {
            role: message.role,
            content: message.content,
          },
        ]
      } else if (Buffer.isBuffer(message.content?.buffer)) {
        return [
          ...acc,
          {
            role: message.role,
            content: {
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${message.content.buffer.toString('base64')}` },
            },
          },
          message.content?.message
            ? {
                role: message.role,
                content: message.content.message,
              }
            : null,
        ].filter(Boolean)
      } else {
        throw new Error(`Invalid message content type: ${typeof message.content}`)
      }
    }, [])

    const response = await this.openAI.chat.completions.create({
      model: this.options.model,
      temperature: this.options.temperature,
      messages: messagesToSend,
    })

    return {
      role: response.choices[0].message.role,
      content: response.choices[0].message.content,
      usage: response.usage.total_tokens,
    }
  }
}
