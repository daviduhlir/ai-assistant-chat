export class AnthropicMockup {
  private responses: string[]
  private currentIndex: number

  public lastMessages: any[] = []
  public lastSystemPrompt: string = ''

  constructor(responses: string[]) {
    this.responses = responses
    this.currentIndex = 0
  }

  public messages = {
    create: async ({
      system,
      messages,
      tools,
    }: {
      system?: string
      messages: any[]
      tools?: any[]
    }): Promise<any> => {
      if (this.currentIndex >= this.responses.length) {
        throw new Error('No more mock responses available')
      }

      this.lastMessages = messages
      this.lastSystemPrompt = system || ''

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
}