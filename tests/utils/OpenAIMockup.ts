import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

export class OpenAIMockup {
  private responses: string[];
  private currentIndex: number;

  constructor(responses: string[]) {
    this.responses = responses;
    this.currentIndex = 0;
  }

  public chat = {
    completions: {
      create: async ({
        messages,
      }: {
        messages: ChatCompletionMessageParam[];
      }): Promise<{
        choices: { message: { role: string; content: string } }[];
        usage: { total_tokens: number };
      }> => {
        if (this.currentIndex >= this.responses.length) {
          throw new Error('No more mock responses available');
        }

        const responseContent = this.responses[this.currentIndex];
        this.currentIndex++;

        return {
          choices: [
            {
              message: {
                role: 'assistant',
                content: responseContent,
              },
            },
          ],
          usage: { total_tokens: 10 }, // Mock token usage
        };
      },
    },
  };
}