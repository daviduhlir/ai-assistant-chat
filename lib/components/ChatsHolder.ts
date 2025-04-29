import { Assistant } from './Assistant'

import { randomHash } from '../utils'
import { AIProvider } from './AIProvider'

const DEFAULT_CHATS_HOLDER_TTL = 60 * 60 * 1000 // 1 hour

type Tail<T extends any[]> = T extends [any, ...infer Rest] ? Rest : never

export interface ChatsHolderOptions {
  ttl?: number
}

export class ChatsHolder {
  /**
   * Gets chat instance with given id.
   * @param id id of the chat
   * @param owner owner of the chat
   * @returns chat with given id
   */
  static getChat(id: string, owner: string) {
    if (!ChatsHolder.instance) {
      throw new Error('ChatsHolder is not initialized')
    }
    const chat = ChatsHolder.instance.chats.get(id)
    if (!chat) {
      throw new Error('Chat does not exists')
    }
    if (!chat?.owner || chat.owner !== owner) {
      throw new Error('Chat not found or not owned by you')
    }
    if (chat.expiration < Date.now()) {
      chat.chat.clear()
      ChatsHolder.instance.chats.delete(id)
      throw new Error('Chat does not exists')
    }

    chat.expiration = Date.now() + ChatsHolder.instance.options.ttl // 1 hour
    return chat.chat
  }

  /**
   * Creates chat with given id and expiration time.
   * Assistant have to be initialized before.
   * @param owner owner of the chat
   * @param type type of the chat
   * @returns function to create chat instance
   */
  static getCreateChatFactory<T extends Record<string, new (...args: any[]) => Assistant>, K extends keyof T>(
    chatTypes: T,
    owner: string,
    type: K,
  ): (...args: Tail<ConstructorParameters<T[K]>>) => Promise<string> {
    if (!ChatsHolder.instance) {
      throw new Error('ChatsHolder is not initialized')
    }
    return async (...args: Tail<ConstructorParameters<T[K]>>): Promise<string> => {
      const id = randomHash()
      const ChatClass = chatTypes[type]
      const chatInstance = new (ChatClass as any)(ChatsHolder.instance.aiProvider, ...args)
      ChatsHolder.instance.chats.set(id, {
        owner,
        chat: chatInstance,
        expiration: Date.now() + ChatsHolder.instance.options.ttl,
      })
      return id
    }
  }

  /**
   * Initialize chats holdet instance
   * @returns
   */
  static initialize(aiProvider: AIProvider, options: Partial<ChatsHolderOptions>) {
    if (!ChatsHolder.instance) {
      ChatsHolder.instance = new ChatsHolder(aiProvider, options)
    }
    return ChatsHolder.instance
  }

  /**
   *
   * Internal implementation
   *
   */
  protected chats: Map<string, { owner: string; chat: Assistant; expiration: number }> = new Map()
  protected aiProvider: AIProvider
  protected options: ChatsHolderOptions = {
    ttl: DEFAULT_CHATS_HOLDER_TTL,
  }
  protected static instance: ChatsHolder

  /**
   *
   * @param ttl time to live for the chat in milliseconds
   */
  protected constructor(aiProvider: AIProvider, options: Partial<ChatsHolderOptions>) {
    this.options = {
      ...this.options,
      ...options,
    }
  }
}
