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
 * class MyChat extends OpenAIAssistant {
 *   @OpenAIAssistant.Callable('Get user ID by name.')
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
import {
  CallFunctionParameter,
  ChatMessageInputContent,
  ChatOutputMessage,
  ChatOutputToolCallMessage,
  ChatExecutionResult,
  ChatCallable,
} from '../interfaces'
import { ToolSet } from './ToolSet'

// callbale descriptor
const threadIdSymbol = Symbol('threadId')
const creatingThreadSymbol = Symbol('creatingThread')
const isBusySymbol = Symbol('isBusy')
const isAbleToContinueSymbol = Symbol('isAbleToContinue')

export interface AssistantOptions {
  debugTools?: boolean
  toolsets?: ToolSet[]
}

/**
 * Chat class
 * @description This class is used to interact with OpenAI's chat API.
 */
export class Assistant extends ToolSet {
  /**
   * @brief Generates the base prompt for OpenAI.
   * @param callables A dictionary of callable methods with their signatures and descriptions.
   * @param roleInstructions Instructions describing the assistant's role.
   * @returns A formatted string containing the base prompt.
   */
  protected BASE_PROMPT = (callables, roleInstructions: string) => `
  You are an assistant. Your role is described below. You can use the following methods to complete your tasks. Always respond as described:
  You can use tools to complete your tasks.
  Your role is described below:
  --------------
  ${roleInstructions}
  --------------
  `

  /**
   * @brief Decorator to register a method in the `callables` object.
   * @param description A description of the method being registered.
   */
  public static Callable(description: string, name?: string | symbol, parameters?: CallFunctionParameter[]) {
    return ToolSet.Callable(description, name, parameters)
  }

  /**
   * @brief Constructs a new Chat instance.
   * @param aiProvider An instance of the ai provider client.
   * @param systemInstructions Instructions describing the assistant's role.
   * @param messages A history of chat messages.
   */
  constructor(readonly aiProvider: AIProvider, readonly systemInstructions: string, readonly options: AssistantOptions = {}) {
    super(options.toolsets)
    this.initialize()
  }

  /**
   * Initialize the assistant chat and await for the thread ID.
   * @param messages
   * @returns
   */
  public async initialize() {
    if (!this[creatingThreadSymbol]) {
      this[creatingThreadSymbol] = true
      const threadId = await this.aiProvider.createThread(
        this.BASE_PROMPT(this.callables, this.systemInstructions),
        Object.keys(this.callables).map(key => this.callables[key].tool),
      )
      this[threadIdSymbol] = threadId
      return this[threadIdSymbol]
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
   * Stops the actual prompt processing
   * This will make the prompt method to finish as soon as possible
   */
  public async breakActualPrompt() {
    await this.answerUnrespondedTools(`Your task was interrupted by prompt.`)
    this[isAbleToContinueSymbol] = false
  }

  /**
   * @brief Sends a prompt to the assistant and processes the response.
   * @param prompt The user prompt to send.
   * @param limit The maximum number of iterations to attempt.
   * @param force Whether to force the prompt even if the assistant is busy - will finish all not responded tools with error.
   * @returns The assistant's response as a string.
   * @throws An error if the maximum number of iterations is exceeded.
   */
  public async prompt(prompt: ChatMessageInputContent, limit: number = 10, force: boolean = false): Promise<string> {
    if (force) {
      await this.answerUnrespondedTools('Your task was interrupted by new prompt.')
    }
    if (this[isBusySymbol]) {
      throw new Error(`Assistant is busy`)
    }
    if (this.notRespondedTools?.length) {
      throw new Error(`Assistant is waiting for response from tools`)
    }

    const threadId = await this.awaitThreadId()
    this[isBusySymbol] = true
    this[isAbleToContinueSymbol] = true

    await this.aiProvider.addMessageToThread(threadId, { role: 'user', content: prompt })

    let itterations = 0
    const preambles = []
    let wasStopped = false
    while (itterations < limit && this[isAbleToContinueSymbol]) {
      itterations++
      let response: ChatExecutionResult
      try {
        response = await this.aiProvider.executeThread(threadId)
      } catch (error) {
        this[isBusySymbol] = false
        throw error
      }

      if ((response as ChatOutputToolCallMessage).functionCall) {
        const outputToolCall = response as ChatOutputToolCallMessage
        outputToolCall.functionCall.forEach(toolCall => (this.notRespondedTools[toolCall.id] = toolCall.name))
        // execute method!
        for (const toolCall of outputToolCall.functionCall) {
          if (!this[isAbleToContinueSymbol] || wasStopped) {
            wasStopped = true
            break
          }
          if (this.options.debugTools) {
            console.log(`AI ASSISTANT: Tool call: ${toolCall.name}(${JSON.stringify(toolCall.arguments)})`)
          }
          try {
            const result = await this.action(toolCall.name, toolCall.arguments)
            if (this.options.debugTools) {
              console.log(`AI ASSISTANT: Tool result: ${toolCall.name} => ${result}`)
            }
            if (!this[isAbleToContinueSymbol] || wasStopped) {
              break
            }
            await this.aiProvider.addMessageToThread(threadId, { role: 'tool', functionCallId: toolCall.id, content: `${result}` })
            delete this.notRespondedTools[toolCall.id]
          } catch (actionError) {
            if (this.options.debugTools) {
              console.log(`AI ASSISTANT: Tool error: ${toolCall.name} => ${actionError.message}`)
            }
            await this.aiProvider.addMessageToThread(threadId, {
              role: 'tool',
              functionCallId: toolCall.id,
              content: `ERROR: ${actionError.message}`,
            })
            delete this.notRespondedTools[toolCall.id]
          }
        }
      } else if ((response as ChatOutputMessage)?.content) {
        const outputMessage = response as ChatOutputMessage
        // message to user
        await this.aiProvider.addMessageToThread(threadId, {
          role: response.role,
          content: `${preambles.length ? `${preambles.join('\n')}\n` : ``}${outputMessage.content}`,
        })
        this[isBusySymbol] = false
        return outputMessage.content
      }
    }
    await this.answerUnrespondedTools('Error: too many attempts to get a valid response, all not responded tools was interrupted.')
    if (this[isAbleToContinueSymbol]) {
      throw new Error(`Too many attempts to get a valid response`)
    } else {
      return 'The process was interrupted.'
    }
  }

  /**
   * @brief Checks if the assistant is currently busy processing a request.
   * @returns A boolean indicating whether the assistant is busy.
   */
  public get busy() {
    return this[isBusySymbol]
  }

  /**
   * Get thread ID
   * @returns
   */
  public getThreadId() {
    return this[threadIdSymbol]
  }

  /**
   * Clear the thread
   */
  public clear() {
    this[isBusySymbol] = false
    this.aiProvider.removeThread(this[threadIdSymbol])
  }

  /***************************************
   *
   * Callables implementation
   *
   ***************************************/

  /**
   * Search in history
   */
  @Assistant.Callable(
    `
    Search by text in history of chat messages.
    You can use time range to specify the search.
    If you dont want to use text for search, just use null for text property.
    You can also use only from or to in timerange. If you want to use to only, set from to undefined or 0.
    Timerange is always timestamp.
  `,
    'searchInHistory',
  )
  public async searchInHistory(text?: string, timeRangeFrom?: number, timeRangeTo?: number): Promise<string> {
    const threadId = await this.awaitThreadId()
    return this.aiProvider.searchHistory(threadId, text, [timeRangeFrom, timeRangeTo])
  }

  /**
   * @brief Retrieves a list of callable method signatures and descriptions.
   * @returns An array of strings representing callable method signatures and descriptions.
   */
  public getCallables() {
    return Object.keys(this.callables).map(key => {
      return {
        key,
        description: this.callables[key].description,
      }
    })
  }

  /***************************************
   *
   * Internal implementation
   *
   ***************************************/
  private notRespondedTools: Record<string, string> = {}

  protected [isBusySymbol]: boolean = false
  protected [threadIdSymbol]: string = null
  protected [creatingThreadSymbol]: boolean = false

  /**
   * Answer unresponded tools
   */
  private async answerUnrespondedTools(reason: string) {
    const threadId = await this.awaitThreadId()
    const notRespondedTools = Object.entries(this.notRespondedTools)
    if (notRespondedTools && notRespondedTools.length > 0) {
      if (this.options.debugTools) {
        console.log(`AI ASSISTANT: Not all tools were responded: ${notRespondedTools.map(([, name]) => `${name}`).join(', ')}`)
      }
      for (const tool of notRespondedTools) {
        const [id, name] = tool
        await this.aiProvider.addMessageToThread(threadId, {
          role: 'tool',
          functionCallId: id,
          content: reason,
        })
      }
      this.notRespondedTools = {}
    }
    this[isBusySymbol] = false
  }

  /**
   * Await thread Id to be set
   * @returns
   */
  private async awaitThreadId(): Promise<string> {
    if (this[threadIdSymbol]) {
      return this[threadIdSymbol]
    }
    return new Promise(resolve => {
      const interval = setInterval(() => {
        if (this[threadIdSymbol]) {
          clearInterval(interval)
          resolve(this[threadIdSymbol])
        }
      }, 10)
    })
  }

  /**
   * @brief Executes a registered callable method based on the assistant's response.
   * @param input An object containing the method name and parameters.
   * @returns The result of the method execution.
   */
  private async action(method: string, args: { name: string; value: any }[]): Promise<string> {
    const methodDescriptor = Object.keys(this.callables).find(key => this.callables[key].tool.name === method)
    if (methodDescriptor && this.callables[methodDescriptor]) {
      const parameters = args.map(arg => {
        const param = this.callables[methodDescriptor].paramsMap.find(p => p === arg.name)
        if (!param) {
          throw new Error(`Parameter ${arg.name} not found in method ${method}`)
        }
        return arg.value
      })
      return this.callables[methodDescriptor].reference
        .bind(this.callables[methodDescriptor].target)
        .call(this.callables[methodDescriptor].target, ...parameters)
    }
    return 'Not implemented or not callable'
  }
}
