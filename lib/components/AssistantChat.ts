/**
 * @class Chat
 * @brief A class for managing interactions with OpenAI's chat API.
 *
 * The Chat class provides a framework for handling conversations with OpenAI's chat API.
 * It supports dynamic method registration, structured prompts, and execution of system-level actions
 * based on assistant responses.
 *
 * @details
 * - Maintains a history of messages exchanged between the user and the assistant.
 * - Dynamically registers callable methods using the `Chat.Callable` decorator.
 * - Parses assistant responses to execute system actions or respond to the user.
 * - Integrates with OpenAI's chat API for generating responses.
 *
 * @example
 * // Create an instance of Chat
 * const openAI = new OpenAI({ apiKey: 'your-api-key' });
 * const chat = new Chat(openAI, 'You are a helpful assistant.');
 *
 * // Register a callable method
 * class MyChat extends Chat {
 *   @Chat.Callable('Greets a user by name.')
 *   public async greet(name: string): Promise<string> {
 *     return `Hello, ${name}!`;
 *   }
 * }
 *
 * // Send a prompt
 * const response = await chat.prompt('What is my user ID?', 5);
 * console.log(response);
 */
import 'reflect-metadata'
import OpenAI from 'openai'
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions'

// callbale descriptor
const isCallableKey = Symbol('isCallable')

export interface ChatMessage {
  role: string
  content: string
}

export type ChatCallable = {
  reference: (...params: any[]) => Promise<any>
  signature: string
  description: string
}

/**
 * Chat class
 * @description This class is used to interact with OpenAI's chat API.
 */
export class AssistantChat {
  /**
   * @brief Generates the base prompt for OpenAI.
   * @param callables A dictionary of callable methods with their signatures and descriptions.
   * @param roleInstructions Instructions describing the assistant's role.
   * @returns A formatted string containing the base prompt.
   */
  protected BASE_PROMPT = (callables: { [name: string]: ChatCallable }, roleInstructions: string) => `
  You are an assistant. Your role is described below. You can use the following methods to complete your tasks. Always respond as described:

  - To call a system method:
    Start your response with the line \`TARGET system\`, followed by the method call on the next line in the format:
    \`methodName(param1, param2, ...)\`. Result from this function will be returned to you in the next message with first line \`RESULT\`.

  - To respond to the user:
    Start your response with the line \`TARGET user\`, followed by your message on the next lines.

  This is the list of methods you can call:
  \`\`\`markdown
  ${Object.keys(callables)
    .map(key => `- ${callables[key].signature} - ${callables[key].description}`)
    .join('\n')}
  \`\`\`

  Example:
  \`\`\`
  TARGET system
  obtainUserIdByName("David")
  \`\`\`

  Your role is described here:
  ${roleInstructions}
  `

  /**
   * @brief Decorator to register a method in the `callables` object.
   * @param description A description of the method being registered.
   */
  public static Callable(description: string) {
    return function <T extends { [key: string]: any }>(
      target: T,
      memberName: keyof T,
      descriptor: TypedPropertyDescriptor<(...args: any[]) => Promise<string>>
    ) {
      if (typeof descriptor.value !== 'function') {
        throw new Error(`@Callable can only be applied to methods.`);
      }

      let callables = Reflect.getMetadata(isCallableKey, target) || {};
      callables[memberName] = {
        reference: descriptor.value,
        signature: AssistantChat.extractMethodSignature(target, memberName as string),
        description,
      }
      Reflect.defineMetadata(isCallableKey, callables, target);
    }
  }

  /**
   * @brief Constructs a new Chat instance.
   * @param openAI An instance of the OpenAI client.
   * @param systemInstructions Instructions describing the assistant's role.
   * @param messages A history of chat messages.
   * @param options Configuration options for the OpenAI model and temperature.
   */
  constructor(
    readonly openAI: OpenAI,
    readonly systemInstructions: string,
    protected messages: ChatMessage[] = [],
    protected options: { model: string; temperature: number } = {
      model: 'gpt-3.5-turbo',
      temperature: 0.2,
    },
  ) {}

  /**
   * @brief Sends a prompt to the assistant and processes the response.
   * @param prompt The user prompt to send.
   * @param limit The maximum number of iterations to attempt.
   * @returns The assistant's response as a string.
   * @throws An error if the maximum number of iterations is exceeded.
   */
  public async prompt(prompt: string, limit: number = 10): Promise<string> {
    this.messages.push({ role: 'user', content: prompt })

    const tempMessages: ChatMessage[] = []
    let itterations = 0
    while (itterations < limit) {
      itterations++
      const response = await this.executeChat(
        [{ role: 'system', content: this.BASE_PROMPT(this.callables, this.systemInstructions) }, ...this.messages, ...tempMessages],
        this.options.model,
        this.options.temperature,
      )
      tempMessages.push({ role: response.role, content: response.content })

      const extracted = AssistantChat.extractTargetAndBody(response.content)

      if (extracted.target === 'user') {
        this.messages.push({ role: response.role, content: extracted.body })
        return extracted.body
      } else if (extracted.target === 'system') {
        try {
          const parsed = AssistantChat.parseResponse(extracted.body)
          const callParsed = AssistantChat.parseMethodCall(parsed)
          try {
            const result = await this.action(callParsed)
            tempMessages.push({ role: 'user', content: `RESULT\n${result}` })
          } catch (actionError) {
            tempMessages.push({ role: 'user', content: `There was some error when calling action. ${actionError.message}` })
          }
        } catch (parseError) {
          tempMessages.push({ role: 'user', content: `There was some error when parsing target from your response. ${parseError.message}` })
        }
      }
    }

    throw new Error(`Too many attempts to get a valid response`)
  }

  /**
   * @brief Retrieves a list of callable method signatures and descriptions.
   * @returns An array of strings representing callable method signatures and descriptions.
   */
  public getCallables() {
    return Object.keys(this.callables).map(key => {
      return {
        key,
        signature: this.callables[key].signature,
        description: this.callables[key].description,
      }
    })
  }

  /***************************************
   *
   * Internal methods
   *
   ***************************************/

  /**
   * Get all handlers
   */
  private get callables(): {
    [name: string]: ChatCallable
  } {
    return { ...(Reflect.getMetadata(isCallableKey, this) || {}) }
  }

  /**
   * @brief Sends a chat message to OpenAI and retrieves the response.
   * @param messages The list of messages to send.
   * @param model The OpenAI model to use.
   * @param temperature The temperature setting for the model.
   * @returns The assistant's response, including role, content, and token usage.
   */
  private async executeChat(messages: ChatMessage[], model: string, temperature: number) {
    const response = await this.openAI.chat.completions.create({
      model,
      temperature,
      messages: messages as ChatCompletionMessageParam[],
    })

    return {
      role: response.choices[0].message.role,
      content: response.choices[0].message.content,
      usage: response.usage.total_tokens,
    }
  }

  /**
   * @brief Executes a registered callable method based on the assistant's response.
   * @param input An object containing the method name and parameters.
   * @returns The result of the method execution.
   */
  private async action(input: { call: string; parameters: any[] }): Promise<string> {
    if (this.callables[input.call]) {
      return this.callables[input.call].reference.call(this, ...input.parameters)
    }
    return 'Not implemented or not callable'
  }

  /**
   * @brief Extracts the target and body from a message.
   * @param text The input text to parse.
   * @returns An object containing `target` (string or null) and `body` (message body).
   */
  private static extractTargetAndBody(text: string): { target: string | null; body: string } {
    const match = text.match(/^TARGET\s+([^\n]+)\n([\s\S]*)$/)
    if (!match) {
      return { target: null, body: text.trim() }
    }
    const target = match[1].trim()
    const body = match[2].trim()
    return { target, body }
  }

  /**
   * @brief Parses a response from the assistant.
   * @param text The input text to parse.
   * @param resultIfNotWrapped Whether to return the raw text if not wrapped in code blocks.
   * @returns The parsed response or null if invalid.
   */
  private static parseResponse(text: string, resultIfNotWrapped: boolean = true): string {
    const textMatch = text.match(/```(?:markdown|json)?\n([\s\S]+?)\n```/)
    return textMatch ? textMatch[1].trim() : resultIfNotWrapped ? text : null
  }

  /**
   * @brief Parses a method call from text.
   * @param text The input text to parse.
   * @returns An object containing `call` (method name) and `parameters` (array of parameters), or null if invalid.
   * @throws An error if the method call format is invalid or parameters cannot be parsed.
   */
  private static parseMethodCall(text: string): { call: string; parameters: any[] } | null {
    const match = text.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\((.*)\)$/)
    if (!match) {
      throw new Error('Invalid method call format')
    }
    const call = match[1]
    const rawParams = match[2]
    try {
      const parameters = rawParams ? JSON.parse(`[${rawParams}]`) : []
      return { call, parameters }
    } catch (error) {
      throw new Error('Failed to parse parameters:')
    }
  }

  /**
   * @brief Extracts the method signature using its `toString()` representation and metadata.
   * @param target The target object containing the method.
   * @param memberName The name of the method.
   * @returns The method signature in TypeScript format.
   */
  private static extractMethodSignature(target: any, memberName: string): string {
    const method = target[memberName];
    if (typeof method !== 'function') {
      throw new Error(`Method ${memberName} is not a function`);
    }

    // Extract parameter names from the method's string representation
    const methodString = method.toString();
    const match = methodString.match(/\(([^)]*)\)/);
    if (!match) {
      return '';
    }
    const paramList = match[1];
    const parameters = paramList
      .split(',')
      .map(param => param.trim())
      .filter(param => param);

    // Extract parameter types using Reflect metadata
    const paramTypes = Reflect.getMetadata('design:paramtypes', target, memberName) || [];
    const signature = parameters
      .map((name, index) => `${paramTypes[index]?.name || 'any'}`)
      .join(', ');

    return `${memberName}(${signature})`;
  }
}
