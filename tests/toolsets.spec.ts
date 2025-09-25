import { expect } from 'chai'
import { OpenAIMockup } from './utils/OpenAIMockup'
import { OpenAIAssistant, ToolSet } from '../dist'

describe('ToolSets', () => {
  let openAI: OpenAIMockup
  let assistantChat: OpenAIAssistant

  it('should throw if tool call is not answered before next message', async () => {
    // Simulate a tool that takes time to respond
    class SlowToolSet extends ToolSet {
      @ToolSet.Callable('slowTool')
      async slowTool() {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return 'Done'
      }
    }

    const slowToolSet = new SlowToolSet();
    openAI = new OpenAIMockup(['TOOL_CALL:slowTool', 'Tool result processed!']);
    assistantChat = new OpenAIAssistant(openAI as any, 'You are a helpful assistant.', {
      toolsets: [slowToolSet],
    });

    // 1. Trigger the tool call (will be pending)
    const toolPromise = assistantChat.prompt('usetool:slowTool', 2);
    // 2. Before the tool finishes, try to send another prompt
    let error: any = null;
    try {
      await assistantChat.prompt('should fail before tool done', 2);
    } catch (e) {
      error = e;
    }
    expect(error).to.exist;
    expect(error.message).to.match(/pending tool calls/i);
    // 3. Wait for the tool to finish to avoid unhandled promise rejection
    await toolPromise;
  })

  it('should not throw if breakActualPrompt is called before prompt', async () => {
    // Pomalu běžící tool
    class SlowToolSet extends ToolSet {
      @ToolSet.Callable('slowTool')
      async slowTool() {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return 'Hotovo';
      }
    }

    const slowToolSet = new SlowToolSet();
    openAI = new OpenAIMockup(['TOOL_CALL:slowTool', 'Mocked response 1', 'Mocked response 2']);
    assistantChat = new OpenAIAssistant(openAI as any, 'You are a helpful assistant.', {
      toolsets: [slowToolSet],
    });

    // 1. Spustíme tool call, ale nečekáme na jeho dokončení
    const toolPromise = assistantChat.prompt('usetool:slowTool', 2);
    // 2. Prompt přerušíme
    await assistantChat.breakActualPrompt();
    // 3. Po breaku pošleme nový prompt, měl by projít a vrátit mocked response
    let error: any = null;
    let response: string | undefined;
    try {
      response = await assistantChat.prompt('Hello after break?', 2);
    } catch (e) {
      console.log(e)
      error = e;
    }
    expect(error).to.be.null;
    expect(response).to.equal('Mocked response 1');
    // 4. Počkáme na původní tool, aby nedošlo k unhandled promise rejection
    await toolPromise;
  })

  it('should call tool and return result after tool response', async () => {
    class TestToolSet extends ToolSet {
      @ToolSet.Callable('myTool')
      async myTool() {
        return 'Tool executed!'
      }
    }

    const testToolSet = new TestToolSet()
    openAI = new OpenAIMockup(['TOOL_CALL:myTool', 'Tool result processed!'])
    assistantChat = new OpenAIAssistant(openAI as any, 'You are a helpful assistant.', {
      toolsets: [testToolSet],
    })

    // 1. User prompt vyvolá tool call
    let response = await assistantChat.prompt('usetool:myTool', 4)
    expect(response).to.include('TOOL_CALL:myTool')
  })
})