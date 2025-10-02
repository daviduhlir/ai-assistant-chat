import OpenAI from 'openai'
import { ChatInputMessage, ChatMessageInputBufferContent, AIProviderFunction, ChatExecutionResult } from '../interfaces'
import { AIProvider } from '../components/AIProvider'
import { randomHash } from '../utils'

export interface LlamaChatProviderOptions {
  model: string
  temperature: number
  summarizeAfter?: number
  summarizeKeepLastMessages?: number
  maxTokens?: number
}

export const LLAMA_CHAT_PROVIDER_DEFAULT_OPTIONS: LlamaChatProviderOptions = {
  model: 'llama-3.3-70b-versatile',
  temperature: 0.2,
  summarizeAfter: 10,
  summarizeKeepLastMessages: 2,
  maxTokens: 1000,
}

/**
 * @class LlamaChatProvider
 * @brief Implementation of the AIProvider interface for Llama.
 *
 * The `LlamaChatProvider` class integrates with Llama's API (OpenAI-compatible) to handle chat interactions.
 * It extends the `AIProvider` abstract class and provides a concrete implementation
 * of the `executeThread` method.
 *
 * @details
 * - This class uses OpenAI-compatible API to send messages and retrieve responses.
 * - Unlike standard OpenAI, Llama models don't support native tool calling.
 * - Tools are implemented using text parsing: model responds with /tool:toolname param1 param2
 * - Tool responses are sent back as /tool:toolname:response "result"
 * - It supports configurable options such as the model and temperature.
 */
export class LlamaChatProvider extends AIProvider {
  constructor(
    protected openAI: OpenAI,
    protected options: LlamaChatProviderOptions = LLAMA_CHAT_PROVIDER_DEFAULT_OPTIONS,
    readonly initialMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [],
  ) {
    super()
  }

  protected usage: number = 0
  protected tools: AIProviderFunction[] = []
  protected threads: Map<
    string,
    {
      instructions: string
      messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
      history: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
    }
  > = new Map()
  protected SUMMARIZE_PROMPT = (summarizeKeepLastMessages: number) => `
    Your task is to create a concise summary of the conversation so that another assistant can understand what has been discussed.

    - You may create multiple summaries if the conversation contains distinct topics.
    - Keep any global instructions or preferences that the user has shared.
    - Include key actions you (the assistant) performed.
    - Preserve the last active task (if there is one) as raw messages with roles, not summarized.
      - Keep at most the last ${summarizeKeepLastMessages} messages related to the active task.
      - If any of these messages exceed 1000 words, replace that message with its own concise summary (max. 100 words) prefixed with "Summary of long message:".
      - If there is no active task, you can omit this section.

    Format the output exactly as:

    ### Summary
    […summary by topics…]

    ### Last Active Task (if any)
    User: …
    Assistant: …
    …
  `

  /**
   * Sets the summarize prompt.
   * @param prompt The prompt to set for summarization.
   */
  public setSummarizePrompt(prompt: (summarizeKeepLastMessages: number) => string): void {
    this.SUMMARIZE_PROMPT = prompt
  }

  /**
   * Creates thread
   * @param messages
   * @returns
   */
  public async createThread(instructions: string, tools: AIProviderFunction[] = []): Promise<string> {
    this.tools = tools
    const threadId = randomHash()
    this.threads.set(threadId, { messages: [...this.initialMessages], instructions, history: [...this.initialMessages] })
    return threadId
  }

  /**
   * Add message to thread
   * @param threadId
   * @param message
   */
  public async addMessageToThread(threadId: string, message: ChatInputMessage): Promise<void> {
    const thread = this.threads.get(threadId)
    if (!thread) {
      throw new Error(`Thread with ID ${threadId} not found.`)
    }
    if (this.options.summarizeAfter && thread.messages.length > this.options.summarizeAfter) {
      await this.summarizeMessages(threadId)
    }
    if (!message.timestamp) {
      message.timestamp = Date.now()
    }

    if (!message.functionCallId && this.toolInProgress) {
      throw new Error('You need to wait for the tool to finish before sending a new message.')
    }

    const convertedMessage = LlamaChatProvider.transformInputMessage(message)
    thread.history.push(convertedMessage)
    thread.messages.push(convertedMessage)
    this.threads.set(threadId, thread)
  }

  /**
   * Execute thread
   * @param threadId
   * @returns
   */
  public async executeThread(threadId: string): Promise<ChatExecutionResult> {
    const thread = this.threads.get(threadId)
    if (!thread) {
      throw new Error(`Thread with ID ${threadId} not found.`)
    }
    const result = await this.runCompletion([{ role: 'system', content: this.getSystemPromptWithTools(thread.instructions) }, ...thread.messages])
    if (!(result as any).message?.timestamp) {
      ;(result as any).message.timestamp = Date.now()
    }
    thread.messages.push(result.message)
    thread.history.push(result.message)

    // Parse tool calls from message content
    const toolCalls = this.parseToolCalls(result.message.content as string)

    if (toolCalls.length > 0) {
      this.toolInProgress = true
      return {
        role: 'assistant',
        timestamp: Date.now(),
        type: 'tool_call',
        functionCall: toolCalls.map(toolCall => ({
          id: toolCall.id,
          name: toolCall.name,
          arguments: toolCall.arguments.map((value, index) => ({
            name: this.getParameterName(toolCall.name, index),
            value,
          })),
        })),
      }
    }
    this.toolInProgress = false
    return result.message
  }

  /**
   * Remove thread from memory
   * @param threadId
   */
  public async removeThread(threadId: string): Promise<void> {
    const thread = this.threads.get(threadId)
    if (!thread) {
      throw new Error(`Thread with ID ${threadId} not found.`)
    }
    this.threads.delete(threadId)
  }

  /**
   * Try to search in history by text or time range
   * @param threadId
   * @param text
   * @param timeRange
   * @returns
   */
  public async searchHistory(threadId: string, text?: string, timeRange?: [number, number]) {
    const thread = this.threads.get(threadId)
    if (!thread) {
      throw new Error(`Thread with ID ${threadId} not found.`)
    }
    const history = thread.history.filter(message => message.content)
    let found = history
    if (text) {
      found = history.filter(message => {
        if (typeof message?.content === 'string') {
          return message.content.toLowerCase().includes(text.toLowerCase())
        } else if (Buffer.isBuffer((message.content as any)?.buffer)) {
          const bufferMessage: ChatMessageInputBufferContent = message.content as any
          return bufferMessage.message?.toLowerCase().includes(text.toLowerCase())
        }
      })
    }
    if (Array.isArray(timeRange)) {
      found = found.filter(message => {
        if ((message as any).timestamp) {
          return (!timeRange[0] || (message as any).timestamp >= timeRange[0]) && (!timeRange[1] || (message as any).timestamp <= timeRange[1])
        }
        return false
      })
    }

    if (!found?.length) {
      return 'Nothing was found in the history.'
    }
    return found
      .map(message => {
        const content = typeof message.content === 'string' ? (message.content as string) : `${(message.content as any).message} \n [binnary]`
        return `${message.role}: ${content}`
      })
      .join('\n')
  }

  /**
   * Get all thread messages without summarization
   * @param threadId
   * @returns
   */
  public getMessages(threadId: string): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    const thread = this.threads.get(threadId)
    if (!thread) {
      throw new Error(`Thread with ID ${threadId} not found.`)
    }
    return thread.history
  }

  /**
   * Gets overall usage of completions in tokens
   */
  public getUsage(): number {
    return this.usage
  }

  /**
   *
   * Internal methods
   *
   */
  protected toolInProgress: boolean = false

  /**
   * Build system prompt with tool descriptions
   */
  protected getSystemPromptWithTools(baseInstructions: string): string {
    if (this.tools.length === 0) {
      return baseInstructions
    }

    const toolDescriptions = this.tools
      .map(tool => {
        const params = tool.parameters.map(p => `${p.name} (${p.type}${p.default ? `, default: ${p.default}` : ''})`).join(', ')
        return `- /tool:${tool.name} ${params}\n  ${tool.description}`
      })
      .join('\n')

    return `${baseInstructions}

Available tools:
${toolDescriptions}

To call a tool, respond with: /tool:toolname param1 param2 ...
Parameters can be quoted if they contain spaces: /tool:toolname "param with spaces" param2
You will receive responses in format: /tool:toolname:response "result"`
  }

  /**
   * Parse tool calls from message content
   * Format: /tool:toolname param1 param2 or /tool:toolname "param1" "param2"
   */
  protected parseToolCalls(content: string): Array<{ id: string; name: string; arguments: any[] }> {
    if (!content || typeof content !== 'string') {
      return []
    }

    const toolCallRegex = /\/tool:(\w+)\s+(.*?)(?=\n|$)/g
    const toolCalls: Array<{ id: string; name: string; arguments: any[] }> = []
    let match: RegExpExecArray | null

    while ((match = toolCallRegex.exec(content)) !== null) {
      const toolName = match[1]
      const argsString = match[2].trim()

      // Parse arguments - support both quoted and unquoted
      const args: any[] = []
      const quotedRegex = /"([^"]*)"|'([^']*)'|(\S+)/g
      let argMatch: RegExpExecArray | null

      while ((argMatch = quotedRegex.exec(argsString)) !== null) {
        const arg = argMatch[1] || argMatch[2] || argMatch[3]
        // Try to parse as JSON/number/boolean
        try {
          args.push(JSON.parse(arg))
        } catch {
          args.push(arg)
        }
      }

      toolCalls.push({
        id: randomHash(),
        name: toolName,
        arguments: args,
      })
    }

    return toolCalls
  }

  /**
   * Get parameter name for a tool call argument
   */
  protected getParameterName(toolName: string, index: number): string {
    const tool = this.tools.find(t => t.name === toolName)
    if (tool && tool.parameters[index]) {
      return tool.parameters[index].name
    }
    return `param${index}`
  }

  /**
   * Execute chat internaly
   * @param messages
   * @returns
   */
  protected async runCompletion(
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  ): Promise<{ message: OpenAI.Chat.Completions.ChatCompletionMessage; usage: number }> {
    // Don't pass tools to the API since Llama doesn't support them natively
    const response = await this.openAI.chat.completions.create({
      model: this.options.model,
      temperature: this.options.temperature,
      messages,
      max_tokens: this.options.maxTokens,
    })

    this.usage += response.usage.total_tokens
    return {
      message: response.choices[0].message,
      usage: response.usage.total_tokens,
    }
  }

  /**
   * Summarize messages in a thread
   * @param threadId
   */
  protected async summarizeMessages(threadId: string): Promise<void> {
    if (this.toolInProgress) {
      return
    }
    const thread = this.threads.get(threadId)
    if (!thread) {
      throw new Error(`Thread with ID ${threadId} not found.`)
    }
    const summaryResult = await this.runCompletion([
      {
        role: 'system',
        content: this.SUMMARIZE_PROMPT(this.options.summarizeKeepLastMessages || 2),
      },
      ...thread.messages,
    ])
    if (summaryResult?.message?.content) {
      thread.messages = [{ role: 'system', content: `Summary of the previous conversation: ${summaryResult.message.content}` }]
      this.threads.set(threadId, thread)
    }
  }

  /**
   * Transform input message to OpenAI format
   * Tool responses need special handling for Llama
   */
  protected static transformInputMessage(message: ChatInputMessage): OpenAI.Chat.Completions.ChatCompletionMessageParam {
    // Handle tool responses - convert to user message with /tool:toolname:response format
    if (message.role === 'tool' && message.functionCallId) {
      const toolName = message.functionCallId.split(':')[0] || 'unknown'
      return {
        role: 'user',
        content: `/tool:${toolName}:response "${typeof message.content === 'string' ? message.content : JSON.stringify(message.content)}"`,
      }
    }

    if (typeof message.content === 'string') {
      return {
        role: message.role as any,
        content: message.content,
      }
    } else if (Buffer.isBuffer((message.content as any)?.buffer)) {
      const bufferMessage: ChatMessageInputBufferContent = message.content as any
      return {
        role: message.role as any,
        content: {
          type: 'image_url',
          image_url: { url: `data:image/jpeg;base64,${bufferMessage.buffer.toString('base64')}` },
        } as any,
      }
    } else {
      throw new Error(`Invalid message content type: ${typeof message.content}`)
    }
  }
}
