import { ChatInputMessage, ChatMessageInputBufferContent, AIProviderFunction, ChatExecutionResult } from '../interfaces'
import { AIProvider } from '../components/AIProvider'
import { randomHash } from '../utils'

export interface LlamaProviderOptions {
  apiKey?: string
  baseUrl: string
  model: string
  temperature: number
  summarizeAfter?: number
  summarizeKeepLastMessages?: number
  maxTokens?: number
}

export const LLAMA_PROVIDER_DEFAULT_OPTIONS: Partial<LlamaProviderOptions> = {
  baseUrl: 'http://localhost:11434/v1',
  model: 'llama-3.3-70b-versatile',
  temperature: 0.2,
  summarizeAfter: 10,
  summarizeKeepLastMessages: 2,
  maxTokens: 1000,
}

interface LlamaMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | { type: string; text?: string; image_url?: { url: string } }[]
}

interface LlamaResponse {
  id: string
  object: string
  created: number
  model: string
  choices: {
    index: number
    message: {
      role: string
      content: string
    }
    finish_reason: string
  }[]
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

/**
 * @class LlamaProvider
 * @brief Implementation of the AIProvider interface for Llama using native fetch.
 *
 * The `LlamaProvider` class integrates with Llama's API using direct HTTP calls via fetch.
 * It extends the `AIProvider` abstract class and provides a concrete implementation
 * of the `executeThread` method.
 *
 * @details
 * - This class uses fetch to make HTTP requests to Llama API endpoints.
 * - Unlike standard OpenAI, Llama models don't support native tool calling.
 * - Tools are implemented using text parsing: model responds with /tool:toolname param1 param2
 * - Tool responses are sent back as /tool:toolname:response "result"
 * - It supports configurable options such as the model and temperature.
 */
export class LlamaProvider extends AIProvider {
  constructor(protected options: LlamaProviderOptions, readonly initialMessages: LlamaMessage[] = []) {
    super()
  }

  protected usage: number = 0
  protected tools: AIProviderFunction[] = []
  protected threads: Map<
    string,
    {
      instructions: string
      messages: LlamaMessage[]
      history: LlamaMessage[]
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

    const convertedMessage = LlamaProvider.transformInputMessage(message)
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

    const assistantMessage: LlamaMessage = {
      role: 'assistant',
      content: result.message.content,
    }
    thread.messages.push(assistantMessage)
    thread.history.push(assistantMessage)

    // Parse tool calls from message content
    const toolCalls = this.parseToolCalls(result.message.content)

    if (toolCalls.length > 0) {
      this.toolInProgress = true

      // Inform the model about assigned IDs for each tool call
      const idsMessage: LlamaMessage = {
        role: 'user',
        content: toolCalls.map(tc => `Tool call ${tc.name} assigned ID: ${tc.id}`).join('\n'),
      }
      thread.messages.push(idsMessage)
      thread.history.push(idsMessage)

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
    return {
      role: 'assistant',
      content: result.message.content,
      timestamp: Date.now(),
    }
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
        const content = typeof message.content === 'string' ? message.content : '[complex content]'
        return `${message.role}: ${content}`
      })
      .join('\n')
  }

  /**
   * Get all thread messages without summarization
   * @param threadId
   * @returns
   */
  public getMessages(threadId: string): LlamaMessage[] {
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
        return `  * ${tool.name}: ${tool.description}\n    Parameters: ${params || 'none'}`
      })
      .join('\n')

    return `${baseInstructions}

IMPORTANT: You have access to the following tools:
${toolDescriptions}

TOOL CALLING RULES:
1. To call a tool, respond ONLY with the tool call line, nothing else
2. Format: /tool:toolname param1 param2 param3
3. Use quotes for parameters with spaces: /tool:toolname "param with spaces" value2
4. Do NOT add explanations, descriptions, or any other text in the same response
5. After calling a tool, you will receive a response in format: /tool:toolname:response "result"
6. Then you can continue the conversation with the tool result

EXAMPLES:
User: What is the magic number?
Assistant: /tool:getMagicNumber

User: Calculate 5 plus 10
Assistant: /tool:calculate 5 10

User: Search for "hello world"
Assistant: /tool:search "hello world"

Remember: When calling a tool, respond with ONLY the tool call line, no additional text!`
  }

  /**
   * Parse tool calls from message content
   * Format: /tool:toolname param1 param2 or /tool:toolname "param1" "param2" or /tool:toolname (no params)
   */
  protected parseToolCalls(content: string): Array<{ id: string; name: string; arguments: any[] }> {
    if (!content || typeof content !== 'string') {
      return []
    }

    const toolCallRegex = /\/tool:(\w+)(?:\s+(.+?))?(?=\n|$)/g
    const toolCalls: Array<{ id: string; name: string; arguments: any[] }> = []
    let match: RegExpExecArray | null

    while ((match = toolCallRegex.exec(content)) !== null) {
      const toolName = match[1]
      const argsString = match[2]?.trim() || ''

      // Parse arguments - support both quoted and unquoted
      const args: any[] = []

      if (argsString) {
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
   * Execute chat using fetch
   * @param messages
   * @returns
   */
  protected async runCompletion(messages: LlamaMessage[]): Promise<{ message: { role: string; content: string }; usage: number }> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (this.options.apiKey) {
      headers['Authorization'] = `Bearer ${this.options.apiKey}`
    }

    const response = await fetch(`${this.options.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: this.options.model,
        temperature: this.options.temperature,
        messages,
        max_tokens: this.options.maxTokens,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Llama API error: ${response.status} ${response.statusText} - ${errorText}`)
    }

    const data: LlamaResponse = await response.json()

    this.usage += data.usage.total_tokens
    return {
      message: data.choices[0].message,
      usage: data.usage.total_tokens,
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
   * Transform input message to Llama format
   * Tool responses need special handling for Llama
   */
  protected static transformInputMessage(message: ChatInputMessage): LlamaMessage {
    // Handle tool responses - convert to user message with tool result for specific ID
    if (message.role === 'tool' && message.functionCallId) {
      const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content)
      return {
        role: 'user',
        content: `Tool result for ID ${message.functionCallId}: ${content}`,
      }
    }

    if (typeof message.content === 'string') {
      return {
        role: message.role as 'system' | 'user' | 'assistant',
        content: message.content,
      }
    } else if (Buffer.isBuffer((message.content as any)?.buffer)) {
      const bufferMessage: ChatMessageInputBufferContent = message.content as any
      return {
        role: message.role as 'system' | 'user' | 'assistant',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${bufferMessage.buffer.toString('base64')}` },
          },
        ],
      }
    } else {
      throw new Error(`Invalid message content type: ${typeof message.content}`)
    }
  }
}
