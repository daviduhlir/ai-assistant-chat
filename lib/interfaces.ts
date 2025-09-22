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
  functionCallId?: string
}

export interface ChatOutputMessage extends ChatMessageBase {
  content: ChatMessageOutputContent
}
export interface ChatOutputToolCallMessage extends ChatMessageBase {
  type: string
  functionCall: {
    id: string
    name: string
    arguments: {
      name: string
      value: any
    }[]
  }[]
}
export interface ChatInputMessage extends ChatMessageBase {
  content: ChatMessageInputContent
}

export interface CallFunctionParameter {
  name: string
  type: string
  default?: string
}

export type ChatExecutionResult = ChatOutputMessage | ChatOutputToolCallMessage
export interface AIProviderFunction {
  name: string
  description: string
  parameters: CallFunctionParameter[]
}

export type ChatCallable = {
  target: any
  reference: (...params: any[]) => Promise<any>
  description: string
  tool: AIProviderFunction
  paramsMap: string[]
}
