/**
 * Knowledge agent is like friend on phone to ask questions
 * and get answers. It can be used to ask questions about
 * the codebase, and get answers. It can also be used to
 * ask questions about the project, and get answers.
 *
 * Its mainly preapred for some static agent like aws badrock and openAI assistant,
 * where knowledge is maintaned externaly
 */
export abstract class KnowledgeAgent {
  abstract initialize(): Promise<void>
  abstract prompt(prompt: string): Promise<string>
}
