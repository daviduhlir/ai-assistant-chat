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

export interface ChatOutputMessage {
  role: string
  content: ChatMessageOutputContent
}
export interface ChatInputMessage {
  role: string
  content: ChatMessageInputContent
}
export type ChatMessage = ChatInputMessage | ChatOutputMessage
