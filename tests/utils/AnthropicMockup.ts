import { MessageParam, Message, TextBlock, ToolUseBlock } from '@anthropic-ai/sdk/resources/messages'

export class AnthropicMockup {
  private responses: string[]
  private toolResponses: Array<{ name: string; input: any }[]>
  private currentIndex: number

  public lastMessages: MessageParam[] = []
  public lastSystemPrompt: string = ''
  private threads: Map<string, { messages: MessageParam[]; systemPrompt: string }> = new Map()

  constructor(responses: string[], toolResponses: Array<{ name: string; input: any }[]> = []) {
    this.responses = responses
    this.toolResponses = toolResponses
    this.currentIndex = 0
    this.threads = new Map()
  }

  public messages = {
    create: async ({
      system,
      messages,
      tools,
    }: {
      system?: string
      messages: MessageParam[]
      tools?: any[]
    }): Promise<Message> => {
      if (this.currentIndex >= this.responses.length && this.currentIndex >= this.toolResponses.length) {
        throw new Error('No more mock responses available')
      }

      this.lastMessages = messages
      this.lastSystemPrompt = system || ''

      // Check if we should return a tool response
      const toolResponse = this.toolResponses[this.currentIndex]
      if (toolResponse && toolResponse.length > 0) {
        this.currentIndex++

        const content: (TextBlock | ToolUseBlock)[] = []

        // Add text content if available
        if (this.currentIndex - 1 < this.responses.length) {
          content.push({
            type: 'text',
            text: this.responses[this.currentIndex - 1] || 'I need to use some tools to help you.',
          })
        }

        // Add tool use blocks
        toolResponse.forEach((tool, index) => {
          content.push({
            type: 'tool_use',
            id: `tool_${this.currentIndex}_${index}`,
            name: tool.name,
            input: tool.input,
          })
        })

        return {
          id: `msg_${this.currentIndex}`,
          type: 'message',
          role: 'assistant',
          content,
          model: 'claude-3-5-sonnet-20241022',
          stop_reason: 'tool_use',
          stop_sequence: null,
          usage: {
            input_tokens: 50,
            output_tokens: 30,
          },
        }
      }

      // Regular text response
      if (this.currentIndex >= this.responses.length) {
        throw new Error('No more mock text responses available')
      }

      const responseContent = this.responses[this.currentIndex]
      this.currentIndex++

      return {
        id: `msg_${this.currentIndex}`,
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: responseContent,
          },
        ],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: {
          input_tokens: 20,
          output_tokens: 15,
        },
      }
    },
  }

  // Helper methods for testing
  public reset(): void {
    this.currentIndex = 0
    this.lastMessages = []
    this.lastSystemPrompt = ''
    this.threads.clear()
  }

  public getCallCount(): number {
    return this.currentIndex
  }

  public hasMoreResponses(): boolean {
    return this.currentIndex < this.responses.length || this.currentIndex < this.toolResponses.length
  }

  // Simulate thread-like behavior for consistency with our provider
  public createThread(systemPrompt: string): string {
    const threadId = `thread_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    this.threads.set(threadId, { messages: [], systemPrompt })
    return threadId
  }

  public addMessageToThread(threadId: string, message: MessageParam): void {
    const thread = this.threads.get(threadId)
    if (!thread) {
      throw new Error(`Thread ${threadId} not found`)
    }
    thread.messages.push(message)
  }

  public getThreadMessages(threadId: string): MessageParam[] {
    const thread = this.threads.get(threadId)
    if (!thread) {
      throw new Error(`Thread ${threadId} not found`)
    }
    return [...thread.messages]
  }

  public getThreadSystemPrompt(threadId: string): string {
    const thread = this.threads.get(threadId)
    if (!thread) {
      throw new Error(`Thread ${threadId} not found`)
    }
    return thread.systemPrompt
  }
}