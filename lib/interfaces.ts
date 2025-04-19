export type ChatMessageInputBufferContent = {
  buffer: Buffer
  message: string
}
export type ChatMessageInputContent =
  | ChatMessageInputBufferContent
  | {
      type: 'image_url'
      image_url: { url: string }
    }
  | string

export type ChatMessageOutputContent = string

export interface ChatMessageBase {
  role: string
  timestamp?: number
}

export interface ChatOutputMessage extends ChatMessageBase {
  content: ChatMessageOutputContent
}
export interface ChatInputMessage extends ChatMessageBase {
  content: ChatMessageInputContent
}
export type ChatMessage = ChatInputMessage | ChatOutputMessage
