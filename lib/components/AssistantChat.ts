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
 *
 * // Register a callable method
 * class MyChat extends Chat {
 *   @Chat.Callable('Get user ID by name.')
 *   public async getUserId(name: string): Promise<string> {
 *     return `42`;
 *   }
 * }
 * const chat = new MyChat(openAI, 'You are a helpful assistant.');
 *
 * // Send a prompt
 * const response = await chat.prompt('What is my user ID?', 5);
 * console.log(response);
 */
import 'reflect-metadata'
import { AIProvider } from './AIProvider'
import { ChatMessage } from '../interfaces'
import { FunctionUtils } from '../utils/functions'
import { ResponsesUtils } from '../utils/responses'

// callbale descriptor
const isCallableKey = Symbol('isCallable')

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
    \`methodName(param1, param2, ...)\`. Result from this function will be returned to you in the next message with first line \`RESULT\`,
    in case of error, there will be \`ERROR\` on first line and then some description about that.

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
  public static Callable(description: string, signature?: string) {
    return function <T extends { [key: string]: any }>(
      target: T,
      memberName: keyof T,
      descriptor: TypedPropertyDescriptor<(...args: any[]) => Promise<string>>,
    ) {
      if (typeof descriptor.value !== 'function') {
        throw new Error(`@Callable can only be applied to methods.`)
      }

      let callables = Reflect.getMetadata(isCallableKey, target) || {}
      callables[memberName] = {
        reference: descriptor.value,
        signature: signature ? signature : FunctionUtils.extractMethodSignature(target, memberName as string),
        description,
      }
      Reflect.defineMetadata(isCallableKey, callables, target)
    }
  }

  /**
   * @brief Constructs a new Chat instance.
   * @param aiProvider An instance of the ai provider client.
   * @param systemInstructions Instructions describing the assistant's role.
   * @param messages A history of chat messages.
   */
  constructor(readonly aiProvider: AIProvider, readonly systemInstructions: string, protected messages: ChatMessage[] = []) {}

  /**
   * @brief Sends a prompt to the assistant and processes the response.
   * @param prompt The user prompt to send.
   * @param limit The maximum number of iterations to attempt.
   * @returns The assistant's response as a string.
   * @throws An error if the maximum number of iterations is exceeded.
   */
  public async prompt(prompt: string, limit: number = 10): Promise<string> {
    if (this.isBussy) {
      throw new Error(`Assistant is busy`)
    }
    const messages = [...this.messages]
    this.isBussy = true
    this.messages.push({ role: 'user', content: prompt })

    const tempMessages: ChatMessage[] = []
    let itterations = 0
    while (itterations < limit) {
      itterations++
      const response = await this.aiProvider.executeChat([
        { role: 'system', content: this.BASE_PROMPT(this.callables, this.systemInstructions) },
        ...messages,
        ...tempMessages,
      ])
      tempMessages.push({ role: response.role, content: response.content })

      const extracted = ResponsesUtils.extractTargetAndBody(response.content)

      if (extracted.target === 'user') {
        messages.push({ role: response.role, content: extracted.body })
        this.messages = messages
        this.isBussy = false
        return extracted.body
      } else if (extracted.target === 'system') {
        try {
          const parsed = ResponsesUtils.parseResponse(extracted.body)
          const callParsed = FunctionUtils.parseMethodCall(parsed)
          try {
            const result = await this.action(callParsed)
            tempMessages.push({ role: 'user', content: `RESULT\n${result}` })
          } catch (actionError) {
            tempMessages.push({ role: 'user', content: `ERROR\nThere was some error when calling action. ${actionError.message}` })
          }
        } catch (parseError) {
          tempMessages.push({ role: 'user', content: `There was some error when parsing target from your response. ${parseError.message}` })
        }
      } else {
        tempMessages.push({ role: 'user', content: `ERROR\nNo target was specified` })
      }
    }
    this.isBussy = false
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

  /**
   * @brief Checks if the assistant is currently busy processing a request.
   * @returns A boolean indicating whether the assistant is busy.
   */
  public get bussy() {
    return this.isBussy
  }

  /***************************************
   *
   * Internal implementation
   *
   ***************************************/
  protected isBussy: boolean = false

  /**
   * Get all handlers
   */
  private get callables(): {
    [name: string]: ChatCallable
  } {
    return { ...(Reflect.getMetadata(isCallableKey, this) || {}) }
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
}
