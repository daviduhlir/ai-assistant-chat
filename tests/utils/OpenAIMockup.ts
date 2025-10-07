
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions'

// Vrátí pole neuzavřených tool call ID pro dané pole messages (stateless, for completions)
// Must be defined before chat property to be available on 'this'
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

        // --- TOOL CALL BLOCKING LOGIC (STATELESS, LIKE OPENAI) ---
        // Block if there are any unresponded tool calls in the current message array
        const notResponded = this.getNotRespondedToolsFromMessages(messages);
        const lastMsg = messages[messages.length - 1];
        if (lastMsg && lastMsg.role === 'user' && notResponded.length > 0) {
          throw new Error('Cannot add user message: There are pending tool calls that must be answered first!');
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
        const notResponded = this.getNotRespondedTools(thread_id)
        if (notResponded.length > 0) {
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

  // Vrátí pole neuzavřených tool call ID pro daný thread
  private getNotRespondedTools(threadId: string): string[] {
    const thread = this.threads.get(threadId)
    if (!thread) return []
    // Najdi všechny assistant messages s functionCall
    const pending: string[] = []
    const toolResponses = new Set(
      thread.messages.filter(m => m.role === 'tool' && (m as any).tool_call_id)
        .map(m => (m as any).tool_call_id)
    )
    thread.messages.forEach(m => {
      if (m.role === 'assistant' && Array.isArray((m as any).functionCall)) {
        for (const fc of (m as any).functionCall) {
          if (fc.id && !toolResponses.has(fc.id)) {
            pending.push(fc.id)
          }
        }
      } else if (m.role === 'assistant' && (m as any).functionCall && (m as any).functionCall.id) {
        const fc = (m as any).functionCall
        if (!toolResponses.has(fc.id)) {
          pending.push(fc.id)
        }
      }
    })
    return pending
  }

  // Vrátí pole neuzavřených tool call ID pro dané pole messages (stateless, for completions)
  private getNotRespondedToolsFromMessages(messages: ChatCompletionMessageParam[]): string[] {
    // Najdi všechny assistant messages s functionCall
    const pending: string[] = [];
    const toolResponses = new Set(
      messages.filter(m => m.role === 'tool' && (m as any).tool_call_id)
        .map(m => (m as any).tool_call_id)
    );
    messages.forEach(m => {
      if (m.role === 'assistant' && Array.isArray((m as any).functionCall)) {
        for (const fc of (m as any).functionCall) {
          if (fc.id && !toolResponses.has(fc.id)) {
            pending.push(fc.id);
          }
        }
      } else if (m.role === 'assistant' && (m as any).functionCall && (m as any).functionCall.id) {
        const fc = (m as any).functionCall;
        if (!toolResponses.has(fc.id)) {
          pending.push(fc.id);
        }
      }
    });
    return pending;
  }
}