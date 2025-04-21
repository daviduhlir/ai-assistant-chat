import { expect } from 'chai'
import { OpenAIMockup } from './utils/OpenAIMockup'
import { OpenAIAssistant } from '../dist'

describe('Basics', () => {
  let openAI: OpenAIMockup
  let assistantChat: OpenAIAssistant

  it('should initialize with default options', () => {
    openAI = new OpenAIMockup([])
    assistantChat = new OpenAIAssistant(openAI as any, 'You are a helpful assistant.')
    expect(assistantChat).to.have.property('systemInstructions', 'You are a helpful assistant.')
  })

  it('should send a prompt and return a user-targeted response', async () => {
    openAI = new OpenAIMockup(['Hello, user!'])
    assistantChat = new OpenAIAssistant(openAI as any, 'You are a helpful assistant.')

    const response = await assistantChat.prompt('Hello?', 5)

    expect(response).to.equal('Hello, user!')
  })
})