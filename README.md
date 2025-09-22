# Assistant

The `Assistant` class provides a framework for managing interactions with AI chat APIs. It supports dynamic method registration, structured prompts, and execution of system-level actions based on assistant responses. This class is designed to facilitate seamless communication with AI models while allowing for extensibility through custom callable methods and integration with a `KnowledgeAgent`.

---

## Features

- **Dynamic Method Registration**: Use the `@Assistant.Callable` decorator to register methods that the assistant can invoke dynamically.
- **Structured Prompts**: Automatically generates prompts that guide the assistant's behavior and provide a list of callable methods.
- **AI Provider Abstraction**: Integrates with different AI providers through the `AIProvider` interface, allowing flexibility and extensibility.
- **KnowledgeAgent Integration**: Allows the assistant to query a knowledge base for additional information or context.
- **Assistant Response Parsing**: Parses responses from the assistant to determine whether to respond to the user or execute a system-level action.
- **Extensibility**: Allows developers to define custom methods that the assistant can call during interactions.

---

## Usage

### Example

```typescript
import OpenAI from 'openai';
import { OpenAIAssistant } from './OpenAIAssistant';
import { KnowledgeAgent } from './KnowledgeAgent';

// Create an instance of OpenAI client
const openAI = new OpenAI({ apiKey: 'your-api-key' });

// Create an instance of KnowledgeAgent
const knowledgeAgent = new OpenAIKnowledgeAgent({
  assistantId: 'your assistant id'
});

// Register a callable method
class MyAssistant extends OpenAIAssistant {
  @OpenAIAssistant.Callable('Get user ID by name.')
  public async getUserId(name: string): Promise<string> {
    return `42`;
  }
}

// Create an instance of Assistant with KnowledgeAgent
const assistant = new MyAssistant(openAI, 'You are a helpful assistant.', {}, [], knowledgeAgent);

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
  knowledgeAgent?: KnowledgeAgent
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
  options?: Partial<OpenAIChatProviderOptions>,
  initialMessages?: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
)
```

- **Parameters**:
  - `openAI`: An instance of the OpenAI client.
  - `systemInstructions`: A string describing the assistant's role and behavior.
  - `options`: (Optional) Configuration options for the OpenAI provider, such as the model and temperature.
  - `initialMessages`: (Optional) A history of initial chat messages.

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

## How It Works

1. **Initialization**: Create an instance of `Assistant` or `OpenAIAssistant` with an AI provider, system
2. **Register Methods**: Use the `@Assistant.Callable` decorator to register methods that the assistant can invoke.
3. **Send Prompts**: Use the `prompt` method to send user input to the assistant and process its response.

---

## ToolSets

ToolSets provide a modular way to extend your assistant with additional capabilities through pre-built or custom tool collections. They allow you to group related functionality and easily compose different sets of tools for your assistant.

### Using ToolSets

ToolSets are passed to the assistant through the `toolsets` option. For file system operations, always use a safe wrapper like `memfs` or `linkfs`:

```typescript
import { AnthropicAssistant, FsToolSet } from '@david.uhlir/ai-assistant-chat';
import Anthropic from '@anthropic-ai/sdk';
import { createFsFromVolume, Volume } from 'memfs';

// Create a safe, controlled file system
const volume = new Volume();
const safeFs = createFsFromVolume(volume);
const fsToolSet = new FsToolSet(safeFs.promises as any);

const anthropic = new Anthropic({ apiKey: 'your-api-key' });

class MyAssistant extends AnthropicAssistant {}

const assistant = new MyAssistant(anthropic, 'You are a helpful assistant.', {
  toolsets: [fsToolSet],
  debugTools: true  // Optional: enables debug output for tool calls
});

// The assistant can now use file system operations safely
const response = await assistant.prompt('Create a simple TypeScript project with a hello world file');
```

#### Complete Example with In-Memory File System

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { AnthropicAssistant, FsToolSet } from '@david.uhlir/ai-assistant-chat';
import { createFsFromVolume, Volume } from 'memfs';

async function main() {
  // Create in-memory file system
  const volume = new Volume();
  const volumeFs = createFsFromVolume(volume);
  const fsToolSet = new FsToolSet(volumeFs.promises as any);

  // Create assistant with file system capabilities
  const anthropic = new Anthropic({ apiKey: process.env.apiKey });

  class FileAssistant extends AnthropicAssistant {}

  const assistant = new FileAssistant(anthropic, 'You are a helpful assistant.', {
    toolsets: [fsToolSet],
    debugTools: true
  });

  // Ask the assistant to work with files
  const response = await assistant.prompt(
    'Create a TypeScript project with package.json, index.ts with hello world, and README.md'
  );

  console.log('Assistant response:', response);
  console.log('Created files:', volume.toJSON());
}
```

### Creating Custom ToolSets

You can create custom ToolSets by extending the `ToolSet` class and using the `@ToolSet.Callable` decorator:

```typescript
import { ToolSet } from '@david.uhlir/ai-assistant-chat';

export class DatabaseToolSet extends ToolSet {
  constructor(private db: Database) {
    super();
  }

  @ToolSet.Callable('Fetch user by ID from database')
  public async getUser(userId: string): Promise<string> {
    const user = await this.db.findUser(userId);
    return JSON.stringify(user);
  }

  @ToolSet.Callable('Create a new user in database')
  public async createUser(name: string, email: string): Promise<string> {
    const user = await this.db.createUser({ name, email });
    return `User created with ID: ${user.id}`;
  }
}
```

### Nested ToolSets

ToolSets support nesting, allowing you to compose functionality from multiple sources:

```typescript
const mainToolSet = new MainToolSet([childToolSet1, childToolSet2]);
```

### Built-in ToolSets

#### FsToolSet

The `FsToolSet` provides file system operations for the assistant:

- `readFile(path)` - Read file contents
- `writeFile(path, content)` - Write content to file
- `deleteFile(path)` - Delete a file
- `listFiles(dir)` - List files in directory
- `fileExists(path)` - Check if file exists
- `searchInFile(path, query)` - Search for text in file
- `tree(dir, depth)` - Show directory tree structure

**⚠️ Security Warning**: Never give the AI direct access to your real file system. Always use controlled environments like `memfs` for in-memory operations, `linkfs` for sandboxed access to specific directories, or other safe wrappers. The AI can create, modify, and delete files - carefully consider what directories you expose.

```typescript
import { FsToolSet } from '@david.uhlir/ai-assistant-chat';
import { createFsFromVolume, Volume } from 'memfs';

// Always use a safe wrapper, never direct fs access
const volume = new Volume();
const safeFs = createFsFromVolume(volume);
const fsToolSet = new FsToolSet(safeFs.promises as any);
```

---

## License

This project is licensed under the MIT License.