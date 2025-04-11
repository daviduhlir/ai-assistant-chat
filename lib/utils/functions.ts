import 'reflect-metadata'

export class FunctionUtils {
  /**
   * @brief Parses a method call from text.
   * @param text The input text to parse.
   * @returns An object containing `call` (method name) and `parameters` (array of parameters), or null if invalid.
   * @throws An error if the method call format is invalid or parameters cannot be parsed.
   */
  public static parseMethodCall(text: string): { call: string; parameters: any[] } | null {
    const match = text.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\((.*)\)$/)
    if (!match) {
      throw new Error('Invalid method call format')
    }
    const call = match[1]
    const rawParams = match[2]
    try {
      const parameters = rawParams ? JSON.parse(`[${rawParams}]`) : []
      return { call, parameters }
    } catch (error) {
      throw new Error('Failed to parse parameters:')
    }
  }

  /**
   * @brief Extracts the method signature using its `toString()` representation and metadata.
   * @param target The target object containing the method.
   * @param memberName The name of the method.
   * @returns The method signature in TypeScript format.
   */
  public static extractMethodSignature(target: any, memberName: string): string {
    const method = target[memberName]
    if (typeof method !== 'function') {
      throw new Error(`Method ${memberName} is not a function`)
    }

    // Extract parameter names from the method's string representation
    const methodString = method.toString()
    const match = methodString.match(/\(([^)]*)\)/)
    if (!match) {
      return ''
    }
    const paramList = match[1]
    const parameters = paramList
      .split(',')
      .map(param => param.trim())
      .filter(param => param)

    // Extract parameter types using Reflect metadata
    const paramTypes = Reflect.getMetadata('design:paramtypes', target, memberName) || []
    const signature = parameters.map((name, index) => `${name}: ${paramTypes[index]?.name || 'any'}`).join(', ')

    return `${memberName}(${signature})`
  }
}
