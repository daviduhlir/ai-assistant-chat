# Assistant

The `Assistant` class provides a framework for managing interactions with AI chat APIs. It supports dynamic method registration, structured prompts, and execution of system-level actions based on assistant responses. This class is designed to facilitate seamless communication with AI models while allowing for extensibility through custom callable methods.

---

## Features

- **Dynamic Method Registration**: Use the `@Assistant.Callable` decorator to register methods that the assistant can invoke dynamically.
- **Structured Prompts**: Automatically generates prompts that guide the assistant's behavior and provide a list of callable methods.
- **AI Provider Abstraction**: Integrates with different AI providers through the `AIProvider` interface, allowing flexibility and extensibility.
- **Assistant Response Parsing**: Parses responses from the assistant to determine whether to respond to the user or execute a system-level action.
- **Extensibility**: Allows developers to define custom methods that the assistant can call during interactions.
- **Thread or Chat Mode**: Configure the assistant to operate in either thread-based or chat-based mode using the `options` parameter.

---

## Usage

### Example

```typescript
import OpenAI from 'openai';
import { Assistant } from './Assistant';

// Create an instance of OpenAI client
const openAI = new OpenAI({ apiKey: 'your-api-key' });

// Register a callable method
class MyAssistant extends Assistant {
  @Assistant.Callable('Get user ID by name.')
  public async getUserId(name: string): Promise<string> {
    return `42`;
  }
}

// Create an instance of Assistant
const assistant = new MyAssistant(openAI, 'You are a helpful assistant.', {
  mode: 'thread', // or 'chat'
});

// Send a prompt
const response = await assistant.prompt('What is my user ID?', 5);
console.log(response);
```

---

## Public Classes

### `Assistant`

The `Assistant` class provides the core framework for managing interactions with AI chat APIs. It is designed to be extended by specific implementations for different AI providers.

#### `constructor`

```typescript
constructor(
  aiProvider: AIProvider,
  systemInstructions: string,
  options: { mode: 'chat' | 'thread' },
  messages?: ChatMessage[]
)
```

- **Parameters**:
  - `aiProvider`: An instance of a class implementing the `AIProvider` interface.
  - `systemInstructions`: A string describing the assistant's role and behavior.
  - `options`: Configuration options for the assistant, including the mode (`chat` or `thread`).
  - `messages`: (Optional) A history of chat messages.

- **Description**: Initializes a new instance of the `Assistant` class.

---

### `AIProvider`

The `AIProvider` is an abstract base class that defines the interface for AI providers. It provides an abstraction layer for integrating different AI providers.

#### `execute`

```typescript
abstract execute(messages: ChatMessage[]): Promise<ChatExecutionResult>;
```

- **Parameters**:
  - `messages`: An array of chat messages representing the conversation history.

- **Returns**: A promise that resolves to a `ChatExecutionResult` containing the AI's response and token usage.

- **Description**: Executes a chat or thread interaction with the AI model. This method must be implemented by specific AI provider implementations.

---

### `OpenAIProvider`

The `OpenAIProvider` class is an implementation of the `AIProvider` interface for OpenAI. It handles communication with OpenAI's chat or thread APIs.

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

#### `execute`

```typescript
public async execute(messages: ChatMessage[]): Promise<ChatExecutionResult>;
```

- **Parameters**:
  - `messages`: The list of messages to send.

- **Returns**: A promise that resolves to a `ChatExecutionResult` containing the assistant's response, role, and token usage.

- **Description**: Sends a chat or thread message to OpenAI and retrieves the response.

---

## Public Methods

### `getMessages`

The `getMessages` method retrieves the entire chat or thread history between the user and the assistant. It excludes system-level communication and the base instructional prompt, focusing solely on the user-assistant interaction.

** available only for chat type of assistant **

#### Example

```typescript
const messages = assistant.getMessages();
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
const response = await assistant.prompt('What is my user ID?', 5);
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
  content: string | { type: string; text: { value: string } }[];
}
```

- **Description**: Represents a single message in the chat or thread history, including the role (`user` or `assistant`) and the message content.

---

### `ChatExecutionResult`

```typescript
export interface ChatExecutionResult extends ChatMessage {
  usage: number;
}
```

- **Description**: Represents the result of a chat or thread execution, including the assistant's response and token usage.

---

## How It Works

1. **Initialization**: Create an instance of `Assistant` with an AI provider, system instructions, and options (`chat` or `thread` mode).
2. **Register Methods**: Use the `@Assistant.Callable` decorator to register methods that the assistant can invoke.
3. **Send Prompts**: Use the `prompt` method to send user input to the assistant and process its response.
4. **AI Provider Integration**:
   - The `AIProvider` interface allows integration with different AI providers.
   - The `OpenAIProvider` is a specific implementation for OpenAI.

---

## Custom Base Prompt

You can customize the base prompt used by the assistant by calling the `setBasePrompt` method. This allows you to define how the assistant interprets its role and interacts with the user or system.

---

## License

This project is licensed under the MIT License.