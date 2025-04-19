export class ResponsesUtils {
  /**
   * @brief Extracts the target and body from a message.
   * @param text The input text to parse.
   * @returns An object containing `target` (string or null), `body` (message body), and `preamble` (string or null).
   */
  public static extractTargetAndBody(text: string): { target: string | null; body: string; preamble: string | null } {
    const trimmedText = text.trim() // Odstranění nadbytečných mezer a nových řádků na začátku a na konci
    const match = trimmedText.match(/([\s\S]*?)TARGET\s+([^\n]+)\n([\s\S]*)$/)

    if (!match) {
      return { target: null, body: trimmedText, preamble: null }
    }

    const preamble = match[1].trim() // Text před řádkem TARGET
    const target = match[2].trim() // Cíl (např. SYSTEM)
    const body = match[3].trim() // Zbytek textu po TARGET

    return { target, body, preamble: preamble?.trim?.() || null }
  }

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
