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
import { ChatMessage, ChatMessageInputContent } from '../interfaces'
import { FunctionUtils } from '../utils/functions'
import { ResponsesUtils } from '../utils/responses'

// callbale descriptor
const isCallableKey = Symbol('isCallable')

export type ChatCallable = {
  reference: (...params: any[]) => Promise<any>
  signature: string
  description: string
}

export interface AssistantOptions {
  type: 'chat' | 'thread'
}

export const AssistantOptionsDefault: AssistantOptions = { type: 'chat' }

/**
 * Chat class
 * @description This class is used to interact with OpenAI's chat API.
 */
export class Assistant {
  /**
   * @brief Generates the base prompt for OpenAI.
   * @param callables A dictionary of callable methods with their signatures and descriptions.
   * @param roleInstructions Instructions describing the assistant's role.
   * @returns A formatted string containing the base prompt.
   */
  protected BASE_PROMPT = (callables, roleInstructions: string) => `
  You are an assistant. Your role is described below. You can use the following methods to complete your tasks. Always respond as described:

  - To call a system method:
    You MUST start your response with the line \`TARGET system\`, followed by the method call on the next line in the exact format:
    \`methodName(param1, param2, ...)\`.
    **Do not include any additional text, comments, explanations, or context. Only the method call is allowed.**
    If you include anything else, the system will reject your response as invalid.

  - To respond to the user:
    Start your response with the line \`TARGET user\`, followed by your message on the next lines.

  IMPORTANT:
  - When calling a system method, your response MUST contain only the exact method call in the format specified above.
  - Do NOT explain what you are doing, do NOT provide context, and do NOT include any additional text before or after the method call.
  - Any deviation from this format will result in the system rejecting your response.
  - Always respond with only one message at a time.

  If you want to call a method, always return only the method call without any text around it. For example:
  \`\`\`
  TARGET system
  obtainUserIdByName("David")
  \`\`\`

  This is the list of methods you can call:
  \`\`\`markdown
  ${Object.keys(callables)
    .map(key => `- ${callables[key].signature} - ${callables[key].description}`)
    .join('\n')}
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
  constructor(
    readonly aiProvider: AIProvider,
    readonly systemInstructions: string,
    messages: ChatMessage[] = [],
    protected assistantOptions: AssistantOptions = AssistantOptionsDefault,
  ) {
    if (!['chat', 'thread'].includes(this.assistantOptions.type)) {
      throw new Error(`Assistant type must be 'chat' or 'thread'`)
    }
    this.initialize(messages)
  }

  /**
   * Initialize the assistant chat and await for the thread ID.
   * @param messages
   * @returns
   */
  public async initialize(messages: ChatMessage[] = []) {
    if (!this.creatingThread) {
      this.creatingThread = true
      const threadId = await this.aiProvider.createThread(messages)
      // TODO use system role for chat completions
      await this.aiProvider.addMessageToThread(threadId, {
        role: this.assistantOptions.type === 'chat' ? 'system' : 'user',
        content: this.BASE_PROMPT(this.callables, this.systemInstructions),
      })
      this.threadId = threadId
      return this.threadId
    } else {
      return this.awaitThreadId()
    }
  }

  /**
   * Setup base prompt getter
   * @param basePrompt
   */
  public setBasePrompt(basePrompt: (callables: { [name: string]: ChatCallable }, roleInstructions: string) => string) {
    this.BASE_PROMPT = basePrompt
  }

  /**
   * @brief Sends a prompt to the assistant and processes the response.
   * @param prompt The user prompt to send.
   * @param limit The maximum number of iterations to attempt.
   * @returns The assistant's response as a string.
   * @throws An error if the maximum number of iterations is exceeded.
   */
  public async prompt(prompt: ChatMessageInputContent, limit: number = 10): Promise<string> {
    if (this.isBussy) {
      throw new Error(`Assistant is busy`)
    }

    const threadId = await this.awaitThreadId()
    this.isBussy = true

    await this.aiProvider.addMessageToThread(threadId, { role: 'user', content: prompt })

    let itterations = 0
    while (itterations < limit) {
      itterations++
      const response = await this.aiProvider.executeThread(threadId)

      if (this.assistantOptions.type === 'chat') {
        await this.aiProvider.addMessageToThread(threadId, { role: response.role, content: response.content })
      }
      if (typeof response.content !== 'string') {
        await this.aiProvider.addMessageToThread(threadId, { role: 'user', content: `ERROR\nyour response have to be a string` })
        continue
      }
      const extracted = ResponsesUtils.extractTargetAndBody(ResponsesUtils.parseResponse(response.content))

      if (extracted.target === 'system') {
        try {
          const parsed = ResponsesUtils.parseResponse(extracted.body)
          const callParsed = FunctionUtils.parseMethodCall(parsed)
          try {
            const result = await this.action(callParsed)
            await this.aiProvider.addMessageToThread(threadId, { role: 'user', content: `RESULT\n${result}` })
          } catch (actionError) {
            await this.aiProvider.addMessageToThread(threadId, {
              role: 'user',
              content: `ERROR\nThere was some error when calling action. ${actionError.message}`,
            })
          }
        } catch (parseError) {
          await this.aiProvider.addMessageToThread(threadId, {
            role: 'user',
            content: `There was some error when parsing target from your response. ${parseError.message}`,
          })
        }
      } else {
        await this.aiProvider.addMessageToThread(threadId, { role: response.role, content: extracted.body })
        this.isBussy = false
        return extracted.body
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

  /**
   * Get thread ID
   * @returns
   */
  public getThreadId() {
    return this.threadId
  }

  /**
   * Clear the thread
   */
  public clear() {
    this.isBussy = false
    this.aiProvider.removeThread(this.threadId)
  }

  /***************************************
   *
   * Internal implementation
   *
   ***************************************/
  protected isBussy: boolean = false
  protected threadId: string = null
  protected creatingThread: boolean = false

  /**
   * Get all handlers
   */
  private get callables(): {
    [name: string]: ChatCallable
  } {
    return { ...(Reflect.getMetadata(isCallableKey, this) || {}) }
  }

  /**
   * Await thread Id to be set
   * @returns
   */
  private async awaitThreadId(): Promise<string> {
    if (this.threadId) {
      return this.threadId
    }
    return new Promise(resolve => {
      const interval = setInterval(() => {
        if (this.threadId) {
          clearInterval(interval)
          resolve(this.threadId)
        }
      }, 10)
    })
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
