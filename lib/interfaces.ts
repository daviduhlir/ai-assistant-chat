export type ChatMessageInputContent =
  | {
      buffer: Buffer
      message: string
    }
  | string

export type ChatMessageOutputContent = string

export interface ChatMessage {
  role: string
  content: ChatMessageInputContent | ChatMessageOutputContent
}
