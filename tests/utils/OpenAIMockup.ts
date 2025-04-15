import { ChatCompletionMessageParam } from 'openai/resources/chat/completions'

export class OpenAIMockup {
  private responses: string[]
  private currentIndex: number

  public lastMessages: ChatCompletionMessageParam[] = []
  private threads: Map<string, { messages: ChatCompletionMessageParam[]; runs: any[] }> = new Map()

  constructor(responses: string[]) {
    this.responses = responses
    this.currentIndex = 0
    this.threads = new Map() // Ujistíme se, že threads je inicializováno
  }

  public chat = {
    completions: {
      create: async ({
        messages,
      }: {
        messages: ChatCompletionMessageParam[]
      }): Promise<{
        choices: { message: { role: string; content: string } }[]
        usage: { total_tokens: number }
      }> => {
        if (this.currentIndex >= this.responses.length) {
          throw new Error('No more mock responses available')
        }

        this.lastMessages = messages

        const responseContent = this.responses[this.currentIndex]
        this.currentIndex++

        return {
          choices: [
            {
              message: {
                role: 'assistant',
                content: responseContent,
              },
            },
          ],
          usage: { total_tokens: 10 }, // Mock token usage
        }
      },
    },
  }

  public beta = {
    assistants: {
      create: async ({
        name,
        instructions,
        tools,
        model,
      }: {
        name: string
        instructions: string
        tools: any[]
        model: string
      }): Promise<{ id: string }> => {
        const assistantId = `assistant-${Math.random().toString(36).substr(2, 9)}`
        return { id: assistantId }
      },
    },
    threads: {
      create: async (): Promise<{ id: string }> => {
        if (!this.threads) {
          throw new Error('Threads map is not initialized')
        }

        const threadId = `thread-${this.threads.size + 1}`
        this.threads.set(threadId, { messages: [], runs: [] })
        return { id: threadId }
      },

      addMessage: async (thread_id: string, message: ChatCompletionMessageParam): Promise<void> => {
        const thread = this.threads.get(thread_id)
        if (!thread) {
          throw new Error(`Thread with ID ${thread_id} not found`)
        }
        thread.messages.unshift(message)
      },

      messages: {
        create: async (
          thread_id: string,
          message: ChatCompletionMessageParam,
        ): Promise<{ id: string }> => {
          const thread = this.threads.get(thread_id)
          if (!thread) {
            throw new Error(`Thread with ID ${thread_id} not found`)
          }

          const messageId = `message-${thread.messages.length + 1}`
          thread.messages.unshift({ ...message, id: messageId } as any)

          return { id: messageId }
        },
        list: async (thread_id: string): Promise<{ data: ChatCompletionMessageParam[] }> => {
          const thread = this.threads.get(thread_id);
          if (!thread) {
            throw new Error(`Thread with ID ${thread_id} not found`);
          }

          return { data: thread.messages };
        },
      },

      execute: async (thread_id: string): Promise<{
        choices: { message: ChatCompletionMessageParam }[]
        usage: { total_tokens: number }
      }> => {
        if (this.currentIndex >= this.responses.length) {
          throw new Error('No more mock responses available')
        }

        const thread = this.threads.get(thread_id)
        if (!thread) {
          throw new Error(`Thread with ID ${thread_id} not found`)
        }

        const responseContent = this.responses[this.currentIndex]
        this.currentIndex++

        const assistantMessage: ChatCompletionMessageParam = {
          role: 'assistant',
          content: responseContent,
        }

        thread.messages.unshift(assistantMessage)

        return {
          choices: [{ message: assistantMessage }],
          usage: { total_tokens: 10 }, // Mock token usage
        }
      },

      retrieve: async (thread_id): Promise<{ messages: ChatCompletionMessageParam[] }> => {
        const thread = this.threads.get(thread_id)
        if (!thread) {
          throw new Error(`Thread with ID ${thread_id} not found`)
        }
        return { messages: thread.messages }
      },

      runs: {
        create: async (thread_id: string): Promise<{ id: string }> => {
          const thread = this.threads.get(thread_id);
          if (!thread) {
            throw new Error(`Thread with ID ${thread_id} not found`);
          }

          const runId = `run-${thread.runs.length + 1}`;
          thread.runs.push({ id: runId, status: 'pending' });

          // Přidání odpovědi asistenta z mockovaných responses
          if (this.currentIndex >= this.responses.length) {
            throw new Error('No more mock responses available');
          }

          const responseContent = this.responses[this.currentIndex];
          this.currentIndex++;

          const assistantMessage: ChatCompletionMessageParam = {
            role: 'assistant',
            content: responseContent,
          };

          thread.messages.unshift(assistantMessage);

          // Simulace asynchronního dokončení běhu
          setTimeout(() => {
            const run = thread.runs.find((r) => r.id === runId);
            if (run) {
              run.status = 'completed';
            }
          }, 200); // Dokončení po 1 sekundě

          return { id: runId };
        },

        retrieve: async (thread_id: string, run_id: string): Promise<{ status: string }> => {
          const thread = this.threads.get(thread_id);
          if (!thread) {
            throw new Error(`Thread with ID ${thread_id} not found`);
          }

          const run = thread.runs.find((r) => r.id === run_id);
          if (!run) {
            throw new Error(`Run with ID ${run_id} not found in thread ${thread_id}`);
          }

          return { status: run.status };
        },
      },
    },
  }
}