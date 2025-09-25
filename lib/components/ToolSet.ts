import 'reflect-metadata'
import { AIProviderFunction, CallFunctionParameter, ChatCallable } from '../interfaces'
import { FunctionUtils } from '../utils/functions'

const isCallableKey = Symbol('isCallable')
const additionalCallablesSymbol = Symbol('additionalCallables')

export class ToolSet {
  constructor(readonly nestedCallables: ToolSet[] = []) {
    this.nestedCallables = nestedCallables
    this[additionalCallablesSymbol] = {}
  }

  /**
   * @brief Decorator to register a method in the `callables` object.
   * @param description A description of the method being registered.
   */
  public static Callable(description: string, name?: string | symbol, parameters?: CallFunctionParameter[]) {
    return function <T extends { [key: string]: any }>(
      target: T,
      memberName: keyof T,
      descriptor: TypedPropertyDescriptor<(...args: (string | number | boolean)[]) => Promise<string>>,
    ) {
      if (typeof descriptor.value !== 'function') {
        throw new Error(`@Callable can only be applied to methods.`)
      }

      const functionMetadata = FunctionUtils.extractMethodMetadata(target, memberName as string)
      let callables = Reflect.getMetadata(isCallableKey, target) || {}
      callables[memberName] = {
        target,
        reference: descriptor.value,
        description,
        paramsMap: (parameters ? parameters : functionMetadata.parameters).map(param => param.name),
        tool: {
          name: typeof name === 'string' ? name : functionMetadata.name,
          description,
          parameters: parameters ? parameters : functionMetadata.parameters,
        } as AIProviderFunction,
      }
      Reflect.defineMetadata(isCallableKey, callables, target)
    }
  }

  /**
   * Add additional callable
   * @param name
   * @param callable
   */
  public async additionalCallable(name: string, callable: ChatCallable) {
    this[additionalCallablesSymbol][name] = callable
  }

  /**
   * Get all handlers
   */
  public get callables(): {
    [name: string]: ChatCallable
  } {
    const selfCallables = Reflect.getMetadata(isCallableKey, this) || {}
    const nestedCallables = this.nestedCallables.reduce((acc, toolSet) => {
      const toolSetCallables = toolSet.callables
      Object.keys(toolSetCallables).forEach(key => {
        // Update target to point to the correct instance instead of prototype
        acc[key] = {
          ...toolSetCallables[key],
          reference: toolSetCallables[key].reference.bind(toolSet),
          target: toolSet,
        }
      })
      return acc
    }, {})

    return {
      ...selfCallables,
      ...this[additionalCallablesSymbol],
      ...nestedCallables,
    }
  }
}
