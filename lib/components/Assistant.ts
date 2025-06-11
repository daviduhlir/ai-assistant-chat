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
import { AIProvider, AIProviderFunction, ChatExecutionResult } from './AIProvider'
import { CallFunctionParameter, ChatMessageInputContent, ChatOutputMessage, ChatOutputToolCallMessage } from '../interfaces'
import { FunctionUtils } from '../utils/functions'
import { KnowledgeAgent } from './KnowledgeAgent'

// callbale descriptor
const isCallableKey = Symbol('isCallable')

const threadIdSymbol = Symbol('threadId')
const creatingThreadSymbol = Symbol('creatingThread')
const isBusySymbol = Symbol('isBusy')

export type ChatCallable = {
  reference: (...params: any[]) => Promise<any>
  description: string
  tool: AIProviderFunction
  paramsMap: string[]
}

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
  public static Callable(description: string, parameters?: CallFunctionParameter[]) {
    return function <T extends { [key: string]: any }>(
      target: T,
      memberName: keyof T,
      descriptor: TypedPropertyDescriptor<(...args: (string | number | boolean)[]) => Promise<string>>,
    ) {
      if (typeof descriptor.value !== 'function') {
        throw new Error(`@Callable can only be applied to methods.`)
      }

      const functionMetadata = FunctionUtils.extractMethodMetadata(target, memberName as string)
      let callables = Reflect.getMetadata(isCallableKey, target) || {}
      callables[memberName] = {
        reference: descriptor.value,
        description,
        paramsMap: functionMetadata.parameters.map(param => param.name),
        tool: {
          name: functionMetadata.name,
          description,
          parameters: parameters ? parameters : functionMetadata.parameters,
        } as AIProviderFunction,
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
  constructor(readonly aiProvider: AIProvider, readonly systemInstructions: string, readonly knowledgeAgent?: KnowledgeAgent) {
    this.initialize()
    if (this.knowledgeAgent) {
      this.createAgentCallables()
    }
  }

  /**
   * Initialize the assistant chat and await for the thread ID.
   * @param messages
   * @returns
   */
  public async initialize() {
    if (!this[creatingThreadSymbol]) {
      if (this.knowledgeAgent) {
        await this.knowledgeAgent.initialize()
      }
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
   * @brief Sends a prompt to the assistant and processes the response.
   * @param prompt The user prompt to send.
   * @param limit The maximum number of iterations to attempt.
   * @returns The assistant's response as a string.
   * @throws An error if the maximum number of iterations is exceeded.
   */
  public async prompt(prompt: ChatMessageInputContent, limit: number = 10): Promise<string> {
    if (this[isBusySymbol]) {
      throw new Error(`Assistant is busy`)
    }

    const threadId = await this.awaitThreadId()
    this[isBusySymbol] = true

    await this.aiProvider.addMessageToThread(threadId, { role: 'user', content: prompt })

    let itterations = 0
    const preambles = []
    let notRespondedTools: string[] = null
    while (itterations < limit) {
      itterations++
      let response: ChatExecutionResult
      try {
        response = await this.aiProvider.executeThread(threadId)
      } catch(error) {
        this[isBusySymbol] = false
        throw error
      }

      if ((response as ChatOutputToolCallMessage).functionCall) {
        const outputToolCall = response as ChatOutputToolCallMessage
        notRespondedTools = outputToolCall.functionCall.map(toolCall => toolCall.id)
        // execute method!
        for (const toolCall of outputToolCall.functionCall) {
          try {
            const result = await this.action(toolCall.name, toolCall.arguments)
            await this.aiProvider.addMessageToThread(threadId, { role: 'tool', functionCallId: toolCall.id, content: `${result}` })
            notRespondedTools = notRespondedTools.filter(id => id !== toolCall.id)
          } catch (actionError) {
            await this.aiProvider.addMessageToThread(threadId, {
              role: 'tool',
              functionCallId: toolCall.id,
              content: `ERROR: ${actionError.message}`,
            })
            notRespondedTools = notRespondedTools.filter(id => id !== toolCall.id)
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
    this[isBusySymbol] = false
    if (notRespondedTools && notRespondedTools.length > 0) {
      for (const toolId of notRespondedTools) {
        await this.aiProvider.addMessageToThread(threadId, {
          role: 'tool',
          functionCallId: toolId,
          content: `ERROR: There was some error when calling action. Not all tools were responded.`,
        })
      }
      await this.aiProvider.executeThread(threadId)
      throw new Error(`Not all tools were responded: ${notRespondedTools.join(', ')}, will finsh them with error.`)
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
        description: this.callables[key].description,
      }
    })
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
  @Assistant.Callable(`
    Search by text in history of chat messages.
    You can use time range to specify the search.
    If you dont want to use text for search, just use null for text property.
    You can also use only from or to in timerange. If you want to use to only, set from to undefined or 0.
    Timerange is always timestamp.
  `)
  public async searchHistory(text?: string, timeRangeFrom?: number, timeRangeTo?: number): Promise<string> {
    const threadId = await this.awaitThreadId()
    return this.aiProvider.searchHistory(threadId, text, [timeRangeFrom, timeRangeTo])
  }

  /***************************************
   *
   * Internal implementation
   *
   ***************************************/
  protected [isBusySymbol]: boolean = false
  protected [threadIdSymbol]: string = null
  protected [creatingThreadSymbol]: boolean = false
  protected knowledgeAgentCallable: {
    [name: string]: ChatCallable
  } = null

  /**
   * Get all handlers
   */
  private get callables(): {
    [name: string]: ChatCallable
  } {
    return {
      ...(Reflect.getMetadata(isCallableKey, this) || {}),
      ...(this.knowledgeAgentCallable || {}),
    }
  }

  /**
   * Create agent callables
   */
  private createAgentCallables() {
    this.knowledgeAgentCallable = {
      askKnowledgeAgent: {
        reference: async (prompt: string) => {
          if (this.knowledgeAgent) {
            return this.knowledgeAgent.prompt(prompt)
          } else {
            throw new Error('Knowledge agent is not set')
          }
        },
        description: 'Ask knowledge agent, use this function if you will need to know anything from knowledge base.',
        paramsMap: ['prompt'],
        tool: {
          name: 'askKnowledgeAgent',
          description: 'Ask knowledge agent',
          parameters: [
            {
              name: 'prompt',
              type: 'string',
            },
          ],
        },
      },
    }
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
    if (this.callables[method]) {
      const parameters = args.map(arg => {
        const param = this.callables[method].paramsMap.find(p => p === arg.name)
        if (!param) {
          throw new Error(`Parameter ${arg.name} not found in method ${method}`)
        }
        return arg.value
      })
      return this.callables[method].reference.call(this, ...parameters)
    }
    return 'Not implemented or not callable'
  }
}
