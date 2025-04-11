export class ResponsesUtils {
  /**
   * @brief Extracts the target and body from a message.
   * @param text The input text to parse.
   * @returns An object containing `target` (string or null) and `body` (message body).
   */
  public static extractTargetAndBody(text: string): { target: string | null; body: string } {
    const match = text.match(/^TARGET\s+([^\n]+)\n([\s\S]*)$/)
    if (!match) {
      return { target: null, body: text.trim() }
    }
    const target = match[1].trim()
    const body = match[2].trim()
    return { target, body }
  }

  /**
   * @brief Parses a response from the assistant.
   * @param text The input text to parse.
   * @param resultIfNotWrapped Whether to return the raw text if not wrapped in code blocks.
   * @returns The parsed response or null if invalid.
   */
  public static parseResponse(text: string, resultIfNotWrapped: boolean = true): string {
    const textMatch = text.match(/```(?:markdown|json)?\n([\s\S]+?)\n```/)
    return textMatch ? textMatch[1].trim() : resultIfNotWrapped ? text : null
  }
}
