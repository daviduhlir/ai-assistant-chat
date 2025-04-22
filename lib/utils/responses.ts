export class ResponsesUtils {
  /**
   * @brief Parses a response from the assistant.
   * @param text The input text to parse.
   * @param resultIfNotWrapped Whether to return the raw text if not wrapped in code blocks.
   * @returns The parsed response or null if invalid.
   */
  public static parseResponse(text: string, resultIfNotWrapped: boolean = true): string {
    const trimmedText = text.trim()
    const textMatch = trimmedText.match(/```(?:markdown|json)?\n?([\s\S]+?)\n?```/)
    return textMatch ? textMatch[1].trim() : resultIfNotWrapped ? trimmedText : null
  }
}
