import { Contract } from '@algorandfoundation/algorand-typescript'

export class SecurityToken extends Contract {
  public hello(name: string): string {
    return `Hello, ${name}`
  }
}
