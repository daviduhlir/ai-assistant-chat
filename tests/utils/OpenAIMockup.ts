import { ChatCompletionMessageParam } from 'openai/resources/chat/completions'

export class OpenAIMockup {
  private responses: string[]
  private currentIndex: number

  public lastMessages: ChatCompletionMessageParam[] = []
  private threads: Map<string, { messages: ChatCompletionMessageParam[]; runs: any[]; pendingToolCalls: string[] }> = new Map()

  constructor(responses: string[]) {
    this.responses = responses
    this.currentIndex = 0
    this.threads = new Map()
  }

  public chat = {
    completions: {
      create: async ({
        messages,
      }: {
        messages: ChatCompletionMessageParam[]
      }): Promise<{
        choices: { message: { role: string; content: string; functionCall?: any } }[]
        usage: { total_tokens: number }
      }> => {
        if (this.currentIndex >= this.responses.length) {
          throw new Error('No more mock responses available')
        }
        this.lastMessages = messages

        // --- TOOL CALL BLOCKING LOGIC ---
        // We use a static property to track pending tool calls for chat completions (per mock instance)
        if (!(this as any)._pendingToolCalls) {
          (this as any)._pendingToolCalls = [];
        }
        const pendingToolCalls: string[] = (this as any)._pendingToolCalls;

        // If the last message is a user message and there are pending tool calls, block it
        const lastMsg = messages[messages.length - 1];
        if (lastMsg && lastMsg.role === 'user' && pendingToolCalls.length > 0) {
          throw new Error('Cannot add user message: There are pending tool calls that must be answered first!');
        }
        // Pokud je poslední zpráva od toolu, smaž pending tool call podle functionCallId NEBO tool_call_id
        if (lastMsg && lastMsg.role === 'tool') {
          const fnId = (lastMsg as any).functionCallId;
          const toolCallId = (lastMsg as any).tool_call_id;
          if (fnId) {
            const idx = pendingToolCalls.indexOf(fnId);
            if (idx !== -1) pendingToolCalls.splice(idx, 1);
          }
          if (toolCallId) {
            const idx = pendingToolCalls.indexOf(toolCallId);
            if (idx !== -1) pendingToolCalls.splice(idx, 1);
          }
        }

        // --- TOOL SUPPORT PRO COMPLETION CHAT ---
        const lastMsgForTool = messages[messages.length - 1];
        let toolCallMatch = lastMsgForTool && lastMsgForTool.role === 'user' && typeof lastMsgForTool.content === 'string'
          ? (lastMsgForTool.content as string).match(/^usetool:([a-zA-Z0-9_\-]+)/)
          : null;

        if (lastMsgForTool && lastMsgForTool.role === 'user' && toolCallMatch) {
          // Pokud poslední zpráva je user a obsahuje usetool, udělej tool call
          const toolName = toolCallMatch[1];
          const toolCallId = `mock-tool-id-${toolName}`;
          pendingToolCalls.push(toolCallId);
          return {
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: '',
                  functionCall: [{
                    id: toolCallId,
                    name: toolName,
                    arguments: []
                  }]
                },
              },
            ],
            usage: { total_tokens: 10 },
          };
        }
        // Pokud poslední zpráva je od toolu nebo usera bez tool callu, vrať mocked response
        // --- /TOOL SUPPORT ---

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
          usage: { total_tokens: 10 },
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
        const threadId = `thread-${this.threads.size + 1}`
        this.threads.set(threadId, { messages: [], runs: [], pendingToolCalls: [] })
        return { id: threadId }
      },

      addMessage: async (thread_id: string, message: ChatCompletionMessageParam): Promise<void> => {
        const thread = this.threads.get(thread_id)
        if (!thread) {
          throw new Error(`Thread with ID ${thread_id} not found`)
        }
        // Pokud je v threadu nevyřízený tool call, další user message není povolena
        if (message.role === 'user' && thread.pendingToolCalls.length > 0) {
          throw new Error('Cannot add user message: There are pending tool calls that must be answered first!')
        }
        // Pokud je to odpověď na tool call, odeber z pendingToolCalls
        if (message.role === 'tool' && (message as any).functionCallId) {
          thread.pendingToolCalls = thread.pendingToolCalls.filter(id => id !== (message as any).functionCallId)
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
          // Pokud je v threadu nevyřízený tool call, další user message není povolena
          if (message.role === 'user' && thread.pendingToolCalls.length > 0) {
            throw new Error('Cannot add user message: There are pending tool calls that must be answered first!')
          }
          // Pokud je to odpověď na tool call, odeber z pendingToolCalls
          if (message.role === 'tool' && (message as any).functionCallId) {
            thread.pendingToolCalls = thread.pendingToolCalls.filter(id => id !== (message as any).functionCallId)
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
        if (thread.pendingToolCalls.length > 0) {
          throw new Error('Cannot execute thread: There are pending tool calls that must be answered first!')
        }

        // --- TOOL SUPPORT ---
        // Pokud poslední user message obsahuje usetool:NAZEV, simuluj tool call
        const lastUserMsg = thread.messages.find(m => m.role === 'user')
        let toolCallMatch = lastUserMsg && typeof lastUserMsg.content === 'string'
          ? (lastUserMsg.content as string).match(/^usetool:([a-zA-Z0-9_\-]+)/)
          : null

        if (toolCallMatch) {
          const toolName = toolCallMatch[1]
          const toolCallId = `mock-tool-id-${toolName}`
          thread.pendingToolCalls.push(toolCallId)
          const assistantMessage: any = {
            role: 'assistant',
            content: '',
            functionCall: [{
              id: toolCallId,
              name: toolName,
              arguments: []
            }]
          }
          thread.messages.unshift(assistantMessage)
          return {
            choices: [{ message: assistantMessage }],
            usage: { total_tokens: 10 },
          }
        }
        // --- /TOOL SUPPORT ---

        // Pokud poslední message je tool response, vrať další assistant odpověď z responses
        const lastToolMsg = thread.messages.find(m => m.role === 'tool')
        if (lastToolMsg) {
          const responseContent = this.responses[this.currentIndex]
          this.currentIndex++
          const assistantMessage: ChatCompletionMessageParam = {
            role: 'assistant',
            content: responseContent,
          }
          thread.messages.unshift(assistantMessage)
          return {
            choices: [{ message: assistantMessage }],
            usage: { total_tokens: 10 },
          }
        }

        // Jinak klasicky
        const responseContent = this.responses[this.currentIndex]
        this.currentIndex++
        const assistantMessage: ChatCompletionMessageParam = {
          role: 'assistant',
          content: responseContent,
        }
        thread.messages.unshift(assistantMessage)
        return {
          choices: [{ message: assistantMessage }],
          usage: { total_tokens: 10 },
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
          // Pokud je v threadu nevyřízený tool call, další assistant message není povolena
          if (thread.pendingToolCalls.length > 0) {
            throw new Error('Cannot run: There are pending tool calls that must be answered first!')
          }

          const runId = `run-${thread.runs.length + 1}`;
          thread.runs.push({ id: runId, status: 'pending' });

          if (this.currentIndex >= this.responses.length) {
            throw new Error('No more mock responses available');
          }

          const responseContent = this.responses[this.currentIndex];
          this.currentIndex++;

          // Pokud odpověď obsahuje marker TOOL_CALL, simulujeme tool call
          if (typeof responseContent === 'string' && responseContent.includes('TOOL_CALL:')) {
            const match = responseContent.match(/TOOL_CALL:([^\s]+)/)
            if (match) {
              thread.pendingToolCalls.push(match[1])
            } else {
              thread.pendingToolCalls.push('mock-tool-id')
            }
          }

          const assistantMessage: ChatCompletionMessageParam = {
            role: 'assistant',
            content: responseContent,
          };

          thread.messages.unshift(assistantMessage);

          setTimeout(() => {
            const run = thread.runs.find((r) => r.id === runId);
            if (run) {
              run.status = 'completed';
            }
          }, 200);

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