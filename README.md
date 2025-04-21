# Assistant

The `Assistant` class provides a framework for managing interactions with AI chat APIs. It supports dynamic method registration, structured prompts, and execution of system-level actions based on assistant responses. This class is designed to facilitate seamless communication with AI models while allowing for extensibility through custom callable methods.

---

## Features

- **Dynamic Method Registration**: Use the `@Assistant.Callable` decorator to register methods that the assistant can invoke dynamically.
- **Structured Prompts**: Automatically generates prompts that guide the assistant's behavior and provide a list of callable methods.
- **AI Provider Abstraction**: Integrates with different AI providers through the `AIProvider` interface, allowing flexibility and extensibility.
- **Assistant Response Parsing**: Parses responses from the assistant to determine whether to respond to the user or execute a system-level action.
- **Extensibility**: Allows developers to define custom methods that the assistant can call during interactions.

---

## Usage

### Example

```typescript
import OpenAI from 'openai';
import { OpenAIAssistant } from './OpenAIAssistant';

// Create an instance of OpenAI client
const openAI = new OpenAI({ apiKey: 'your-api-key' });

// Register a callable method
class MyAssistant extends OpenAIAssistant {
  @OpenAIAssistant.Callable('Get user ID by name.')
  public async getUserId(name: string): Promise<string> {
    return `42`;
  }
}

// Create an instance of Assistant
const assistant = new MyAssistant(openAI, 'You are a helpful assistant.');

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
  systemInstructions: string
)
```

- **Parameters**:
  - `aiProvider`: An instance of a class implementing the `AIProvider` interface.
  - `systemInstructions`: A string describing the assistant's role and behavior.

- **Description**: Initializes a new instance of the `Assistant` class.

---

### `AIProvider`

The `AIProvider` is an abstract base class that defines the interface for AI providers. It provides an abstraction layer for integrating different AI providers.

#### `createThread`

```typescript
abstract createThread(instructions: string, tools?: AIProviderFunction[]): Promise<string>;
```

- **Parameters**:
  - `instructions`: A string containing the system instructions for the assistant.
  - `tools`: (Optional) A list of tools (callable methods) available to the assistant.

- **Returns**: A promise that resolves to a thread ID.

#### `addMessageToThread`

```typescript
abstract addMessageToThread(threadId: string, message: ChatInputMessage): Promise<void>;
```

- **Parameters**:
  - `threadId`: The ID of the thread to which the message should be added.
  - `message`: The message to add.

#### `executeThread`

```typescript
abstract executeThread(threadId: string): Promise<ChatExecutionResult>;
```

- **Parameters**:
  - `threadId`: The ID of the thread to execute.

- **Returns**: A promise that resolves to a `ChatExecutionResult` containing the assistant's response.

#### `removeThread`

```typescript
abstract removeThread(threadId: string): Promise<void>;
```

- **Parameters**:
  - `threadId`: The ID of the thread to remove.

---

### `OpenAIAssistant`

The `OpenAIAssistant` class is a specialized implementation of the `Assistant` class for OpenAI. It simplifies the integration by automatically configuring the `OpenAIChatProvider` with the provided options.

#### `constructor`

```typescript
constructor(
  openAI: OpenAI,
  systemInstructions: string,
  options?: Partial<OpenAIChatProviderOptions>
)
```

- **Parameters**:
  - `openAI`: An instance of the OpenAI client.
  - `systemInstructions`: A string describing the assistant's role and behavior.
  - `options`: (Optional) Configuration options for the OpenAI provider, such as the model and temperature.

---

## Public Methods

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

1. **Initialization**: Create an instance of `Assistant` or `OpenAIAssistant` with an AI provider and system instructions.
2. **Register Methods**: Use the `@Assistant.Callable` decorator to register methods that the assistant can invoke.
3. **Send Prompts**: Use the `prompt` method to send user input to the assistant and process its response.
4. **AI Provider Integration**:
   - The `AIProvider` interface allows integration with different AI providers.
   - The `OpenAIChatProvider` is a specific implementation for OpenAI.

---

## License

This project is licensed under the MIT License.