import OpenAI from 'openai'
import { KnowledgeAgent } from '../components/KnowledgeAgent'

export class OpenAIKnowledgeAgent extends KnowledgeAgent {
  /**
   * OpenAIInternalAgent is a class that implements the KnowledgeAgent interface.
   * It is used to interact with the OpenAI API to get answers to questions.
   * It is mainly prepared for some static agent like AWS Bedrock and OpenAI assistant,
   * where knowledge is maintained externally.
   */
  constructor(
    readonly openAI: OpenAI,
    readonly options: {
      instructions?: string
      assistantId: string
    },
  ) {
    super()
  }

  /**
   * Initialize the agent.
   */
  async initialize() {
    if (!this.creatingThread && !this.threadId) {
      this.creatingThread = true
      await this.createThread(this.options.instructions)
      this.creatingThread = false
    } else {
      await this.awaitThreadId()
    }
  }

  /**
   * Ask agent a question.
   * @param prompt
   * @returns
   */
  public async prompt(prompt: string): Promise<string> {
    await this.openAI.beta.threads.messages.create(this.threadId, {
      role: 'user',
      content: prompt,
    })
    const run = await this.runAssistant()
    const result = await this.getLastAssistantMessage(run.id)
    return result
  }

  /**
   *
   * Internal implementation
   *
   */
  protected threadId: string
  protected creatingThread: boolean = false

  /**
    * Creates a new thread with an optional initial set of messages.
    * @param messages Initial messages for the thread.
    * @returns The ID of the newly created thread.
    */
  protected async createThread(instructions?: string) {
    try {
      const response = await this.openAI.beta.threads.create()
      if (instructions?.length) {
        await this.openAI.beta.threads.messages.create(response.id, {
          role: 'user',
          content: instructions,
        })
      }
      this.threadId = response.id
    } catch (e) {
      console.error(e)
      throw e
    }
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
   * Run assistant itself
   * @param threadId
   * @returns
   */
  protected async runAssistant() {
    const run = await this.openAI.beta.threads.runs.create(this.threadId, {
      assistant_id: this.options.assistantId
    })
    return {
      id: run.id,
      usage: run?.usage?.total_tokens || 0,
    }
  }

  /**
    * Get the result of a run.
    * @param threadId
    * @param runId
    * @returns
    */
  protected async getRunResult(runId: string): Promise<OpenAI.Beta.Threads.Messages.Message[]> {
    let itteration = 0
    const delay = 500 // Začínáme s 500ms
    while (true) {
      if (++itteration > 100) {
        console.log('Max itterations when waiting result reached')
        return []
      }
      await new Promise(resolve => setTimeout(resolve, delay))
      const run = await this.openAI.beta.threads.runs.retrieve(this.threadId, runId)
      if (run.status === 'completed') {
        const messages = await this.openAI.beta.threads.messages.list(this.threadId)
        return messages.data
      }
    }
  }

  /**
   * Get last assistant message from the thread.
   * @param threadId
   * @param runId
   * @returns
   */
  protected async getLastAssistantMessage(runId: string): Promise<string> {
    const messages = await this.getRunResult(runId)
    //console.log(messages)
    const lastAssistantMessage = messages.find(msg => msg.role === 'assistant')
    if (!lastAssistantMessage) {
      throw new Error('No assistant message found in the thread.')
    }
    return this.mergeMessagesContent(lastAssistantMessage.content)
  }

  /**
   * Merge messages by role.
   * @param messages
   * @param role
   * @returns
   */
  protected mergeMessagesContent(content: OpenAI.Beta.Threads.Messages.MessageContent[]): string {
    if (typeof content === 'string') {
      return content
    }
    return content
      .filter(content => content.type === 'text') // Vybereme jen ty, co mají type "text"
      .map(content => (content as { type: 'text'; text: { value: string } }).text.value) // Extrahujeme text
      .join('\n')
  }
}
