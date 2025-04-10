# AssistantChat

The `AssistantChat` class provides a framework for managing interactions with OpenAI's chat API. It supports dynamic method registration, structured prompts, and execution of system-level actions based on assistant responses. This class is designed to facilitate seamless communication with OpenAI's models while allowing for extensibility through custom callable methods.

---

## Features

- **Dynamic Method Registration**: Use the `@AssistantChat.Callable` decorator to register methods that the assistant can invoke dynamically.
- **Structured Prompts**: Automatically generates prompts that guide the assistant's behavior and provide a list of callable methods.
- **Assistant Response Parsing**: Parses responses from the assistant to determine whether to respond to the user or execute a system-level action.
- **Integration with OpenAI API**: Handles communication with OpenAI's chat API, including sending messages and processing responses.
- **Extensibility**: Allows developers to define custom methods that the assistant can call during interactions.

---

## Usage

### Example

```typescript
import OpenAI from 'openai'
import { AssistantChat } from './AssistantChat'

// Create an instance of OpenAI client
const openAI = new OpenAI({ apiKey: 'your-api-key' })

// Register a callable method
class MyChat extends AssistantChat {
  @AssistantChat.Callable('Greets a user by name.')
  public async greet(name: string): Promise<string> {
    return `Hello, ${name}!`
  }
}

// Create an instance of AssistantChat
const chat = new MyChat(openAI, 'You are a helpful assistant.')

// Send a prompt to the assistant
const response = await chat.prompt('What is my user ID?', 5)
console.log(response)
```

---

## Public Methods

### `constructor`

```typescript
constructor(
  openAI: OpenAI,
  systemInstructions: string,
  messages?: ChatMessage[],
  options?: { model: string temperature: number }
)
```

- **Parameters**:
  - `openAI`: An instance of the OpenAI client.
  - `systemInstructions`: A string describing the assistant's role and behavior.
  - `messages`: (Optional) A history of chat messages.
  - `options`: (Optional) Configuration options for the OpenAI model and temperature.
    - `model`: The OpenAI model to use (default: `'gpt-3.5-turbo'`).
    - `temperature`: The temperature setting for the model (default: `0.2`).

- **Description**: Initializes a new instance of the `AssistantChat` class.

---

### `prompt`

```typescript
public async prompt(prompt: string, limit: number = 10): Promise<string>
```

- **Parameters**:
  - `prompt`: The user prompt to send to the assistant.
  - `limit`: (Optional) The maximum number of iterations to attempt (default: `10`).

- **Returns**: A `Promise` that resolves to the assistant's response as a string.

- **Description**: Sends a prompt to the assistant and processes the response. The method iterates through assistant responses, determining whether to respond to the user or execute a system-level action. Throws an error if the maximum number of iterations is exceeded.

---

### `@AssistantChat.Callable`

```typescript
public static Callable(description: string)
```

- **Parameters**:
  - `description`: A string describing the method being registered.

- **Description**: A decorator used to register a method in the `callables` object. Registered methods can be invoked dynamically by the assistant.

- **Example**:
  ```typescript
  @AssistantChat.Callable('Greets a user by name.')
  public async greet(name: string): Promise<string> {
    return `Hello, ${name}!`
  }
  ```

---

## Protected Members

### `BASE_PROMPT`

```typescript
protected BASE_PROMPT(callables: { [name: string]: ChatCallable }, roleInstructions: string): string
```

- **Parameters**:
  - `callables`: A dictionary of callable methods with their signatures and descriptions.
  - `roleInstructions`: A string describing the assistant's role.

- **Returns**: A formatted string containing the base prompt.

- **Description**: Generates the base prompt for OpenAI, including the assistant's role and a list of callable methods. The prompt guides the assistant's behavior and provides instructions for responding to the user or invoking system methods.

---

## Types

### `ChatMessage`

```typescript
export interface ChatMessage {
  role: string
  content: string
}
```

- **Description**: Represents a single message in the chat history, including the role (`user` or `assistant`) and the message content.

---

### `ChatCallable`

```typescript
export type ChatCallable = {
  reference: (...params: any[]) => Promise<any>
  signature: string
  description: string
}
```

- **Description**: Represents a callable method that the assistant can invoke. Includes:
  - `reference`: A reference to the method implementation.
  - `signature`: The method's signature in TypeScript format.
  - `description`: A description of the method's purpose.

---

## How It Works

1. **Initialization**: Create an instance of `AssistantChat` with an OpenAI client and system instructions.
2. **Register Methods**: Use the `@AssistantChat.Callable` decorator to register methods that the assistant can invoke.
3. **Send Prompts**: Use the `prompt` method to send user input to the assistant and process its response.
4. **Assistant Behavior**:
   - If the assistant responds with `TARGET user`, the response is returned to the user.
   - If the assistant responds with `TARGET system`, the specified method is invoked dynamically.

---

## Notes

- The assistant's behavior is guided by the `BASE_PROMPT`, which includes instructions and a list of callable methods.
- The `prompt` method handles multiple iterations to ensure a valid response is obtained.
- Custom methods can be added to extend the assistant's functionality.

---

## License

This project is licensed under the MIT License.
