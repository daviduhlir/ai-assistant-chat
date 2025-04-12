# AssistantChat

The `AssistantChat` class provides a framework for managing interactions with AI chat APIs. It supports dynamic method registration, structured prompts, and execution of system-level actions based on assistant responses. This class is designed to facilitate seamless communication with AI models while allowing for extensibility through custom callable methods.

---

## Features

- **Dynamic Method Registration**: Use the `@AssistantChat.Callable` decorator to register methods that the assistant can invoke dynamically.
- **Structured Prompts**: Automatically generates prompts that guide the assistant's behavior and provide a list of callable methods.
- **AI Provider Abstraction**: Integrates with different AI providers through the `AIProvider` interface, allowing flexibility and extensibility.
- **Assistant Response Parsing**: Parses responses from the assistant to determine whether to respond to the user or execute a system-level action.
- **Extensibility**: Allows developers to define custom methods that the assistant can call during interactions.

---

## Usage

### Example

```typescript
import OpenAI from 'openai';
import { OpenAIAssistantChat } from './OpenAIAssistantChat';

// Create an instance of OpenAI client
const openAI = new OpenAI({ apiKey: 'your-api-key' });

// Register a callable method
class MyChat extends OpenAIAssistantChat {
  @OpenAIAssistantChat.Callable('Get user ID by name.')
  public async getUserId(name: string): Promise<string> {
    return `42`;
  }
}

// Create an instance of OpenAIAssistantChat
const chat = new MyChat(openAI, 'You are a helpful assistant.');

// Send a prompt
const response = await chat.prompt('What is my user ID?', 5);
console.log(response);
```

---

## Public Classes

### `AssistantChat`

The `AssistantChat` class provides the core framework for managing interactions with AI chat APIs. It is designed to be extended by specific implementations for different AI providers.

#### `constructor`

```typescript
constructor(
  aiProvider: AIProvider,
  systemInstructions: string,
  messages?: ChatMessage[]
)
```

- **Parameters**:
  - `aiProvider`: An instance of a class implementing the `AIProvider` interface.
  - `systemInstructions`: A string describing the assistant's role and behavior.
  - `messages`: (Optional) A history of chat messages.

- **Description**: Initializes a new instance of the `AssistantChat` class.

---

### `AIProvider`

The `AIProvider` is an abstract base class that defines the interface for AI providers. It provides an abstraction layer for integrating different AI providers.

#### `executeChat`

```typescript
abstract executeChat(messages: ChatMessage[]): Promise<ChatExecutionResult>;
```

- **Parameters**:
  - `messages`: An array of chat messages representing the conversation history.

- **Returns**: A promise that resolves to a `ChatExecutionResult` containing the AI's response and token usage.

- **Description**: Executes a chat interaction with the AI model. This method must be implemented by specific AI provider implementations.

---

### `OpenAIAssistantChat`

The `OpenAIAssistantChat` class is a specialized implementation of `AssistantChat` for OpenAI. It simplifies the integration by automatically configuring the `OpenAIProvider` with the provided options.

#### `constructor`

```typescript
constructor(
  openAI: OpenAI,
  systemInstructions: string,
  messages?: ChatMessage[],
  options?: OpenAIProviderOptions
)
```

- **Parameters**:
  - `openAI`: An instance of the OpenAI client.
  - `systemInstructions`: Instructions describing the assistant's role and behavior.
  - `messages`: (Optional) A history of chat messages.
  - `options`: (Optional) Configuration options for the OpenAI provider.

- **Description**: Initializes a new instance of the `OpenAIAssistantChat` class.

---

### `OpenAIProvider`

The `OpenAIProvider` class is an implementation of the `AIProvider` interface for OpenAI. It handles communication with OpenAI's chat API.

#### `constructor`

```typescript
constructor(
  openAI: OpenAI,
  options?: { model: string; temperature: number }
)
```

- **Parameters**:
  - `openAI`: An instance of the OpenAI client.
  - `options`: (Optional) Configuration options for the OpenAI provider, such as the model and temperature.

#### `executeChat`

```typescript
public async executeChat(messages: ChatMessage[]): Promise<ChatExecutionResult>;
```

- **Parameters**:
  - `messages`: The list of messages to send.

- **Returns**: A promise that resolves to a `ChatExecutionResult` containing the assistant's response, role, and token usage.

- **Description**: Sends a chat message to OpenAI and retrieves the response.

---

## Public Methods

### `getMessages`

The `getMessages` method retrieves the entire chat history between the user and the assistant. It excludes system-level communication and the base instructional prompt, focusing solely on the user-assistant interaction.

#### Example

```typescript
const messages = chat.getMessages();
console.log(messages);
/*
Output:
[
  { role: 'user', content: 'Hello?' },
  { role: 'assistant', content: 'Hello, user!' },
  { role: 'user', content: 'What is my user ID?' },
  { role: 'assistant', content: 'Your user ID is 42.' }
]
*/
```

- **Returns**: An array of chat messages exchanged between the user and the assistant.
- **Description**: This method is useful for debugging or analyzing the conversation history without including system-level details or the base prompt.

---

### `prompt`

The `prompt` method sends a user input to the assistant and processes its response. It handles multiple iterations to ensure a valid response is obtained, based on the assistant's behavior and the registered callable methods.

#### Example

```typescript
const response = await chat.prompt('What is my user ID?', 5);
console.log(response);
// Output: "Your user ID is 42."
```

- **Parameters**:
  - `input`: A string representing the user's input.
  - `limit`: (Optional) The maximum number of iterations to attempt before throwing an error. Default is `10`.

- **Returns**: A promise that resolves to a string containing the assistant's response.

- **Throws**: An error if the maximum number of iterations is exceeded or if the assistant fails to provide a valid response.

- **Description**: This method is the primary way to interact with the assistant. It processes the user's input, determines whether to respond directly or execute a system-level action, and returns the assistant's response.

---

## Types

### `ChatMessage`

```typescript
export interface ChatMessage {
  role: string;
  content: string;
}
```

- **Description**: Represents a single message in the chat history, including the role (`user` or `assistant`) and the message content.

---

### `ChatExecutionResult`

```typescript
export interface ChatExecutionResult extends ChatMessage {
  usage: number;
}
```

- **Description**: Represents the result of a chat execution, including the assistant's response and token usage.

---

## How It Works

1. **Initialization**: Create an instance of `AssistantChat` or a specialized implementation like `OpenAIAssistantChat` with an AI provider and system instructions.
2. **Register Methods**: Use the `@AssistantChat.Callable` decorator to register methods that the assistant can invoke.
3. **Send Prompts**: Use the `prompt` method to send user input to the assistant and process its response.
4. **AI Provider Integration**:
   - The `AIProvider` interface allows integration with different AI providers.
   - The `OpenAIProvider` is a specific implementation for OpenAI.

---

## Custom Base Prompt

You can customize the base prompt used by the assistant by calling the `setBasePrompt` method. This allows you to define how the assistant interprets its role and interacts with the user or system.

### Example

```typescript
chat.setBasePrompt((callables, roleInstructions) => `
You are an assistant. Your role is described below. You can use the following methods to complete your tasks:

- To call a system method:
  Start your response with the line \`TARGET system\`, followed by the method call on the next line in the format:
  \`methodName(param1, param2, ...)\`. Result from this function will be returned to you in the next message with first line \`RESULT\`,
  in case of error, there will be \`ERROR\` on first line and then some description about that.

- To respond to the user:
  Start your response with the line \`TARGET user\`, followed by your message on the next lines.

This is the list of methods you can call:
\`\`\`markdown
${Object.keys(callables)
  .map(key => `- ${callables[key].signature} - ${callables[key].description}`)
  .join('\n')}
\`\`\`

Example:
\`\`\`
TARGET system
obtainUserIdByName("David")
\`\`\`

Your role is described here:
${roleInstructions}
`);
```

---

## Limitations

1. **Dependency on `reflect-metadata`**:
   - The library relies on `reflect-metadata` to extract method metadata. Ensure that `reflect-metadata` is properly imported and configured in your project.

2. **Minified Code**:
   - If your code is minified (e.g., in production), method names may be altered, which can break the functionality of the `@Callable` decorator. To avoid this, you can explicitly specify the `signature` parameter in the decorator:
     ```typescript
     @AssistantChat.Callable('Greets a user by name.', 'greet(name: string)')
     public async greet(name: string): Promise<string> {
       return `Hello, ${name}!`;
     }
     ```

3. **Custom Base Prompt**:
   - While the default base prompt is sufficient for most use cases, you may need to customize it for specific scenarios using the `setBasePrompt` method.

---

## Notes

- The assistant's behavior is guided by the `BASE_PROMPT`, which includes instructions and a list of callable methods.
- The `prompt` method handles multiple iterations to ensure a valid response is obtained.
- Custom methods can be added to extend the assistant's functionality.

---

## Development Notice

Keep in mind, this is the first version, and it is still under development. You can use our GitHub repository to leave any comments or suggestions. Your feedback is valuable to us!

---

## License

This project is licensed under the MIT License.
