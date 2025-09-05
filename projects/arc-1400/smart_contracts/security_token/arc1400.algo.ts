import { assert, emit, Global, Txn } from '@algorandfoundation/algorand-typescript'
import { Address, Bool, DynamicBytes, UintN256, UintN64, UintN8 } from '@algorandfoundation/algorand-typescript/arc4'
import { Arc1644 } from './arc1644.algo'
import { arc200_Transfer } from './arc200.algo'

export class Arc1400 extends Arc1644 {
  constructor() {
    super()
  }
  override bootstrap(name: DynamicBytes, symbol: DynamicBytes, decimals: UintN8, totalSupply: UintN256): Bool {
    const sender = new Address(Txn.sender)

    return this.bootstrap1400(
      name,
      symbol,
      decimals,
      totalSupply,
      sender,
      sender,
      new Bool(true),
      new Bool(true),
      new UintN64(0),
    )
  }

  public bootstrap1400(
    name: DynamicBytes,
    symbol: DynamicBytes,
    decimals: UintN8,
    totalSupply: UintN256,
    owner: Address,
    controller: Address,
    controllable: Bool,
    requireJustification: Bool,
    minControllerActionInterval: UintN64,
  ): Bool {
    assert(Txn.sender === Global.creatorAddress, 'Only deployer of this smart contract can call bootstrap method')
    assert(name.native.length > 0, 'Name of the asset must be longer or equal to 1 character')
    assert(name.native.length <= 32, 'Name of the asset must be shorter or equal to 32 characters')
    assert(symbol.native.length > 0, 'Symbol of the asset must be longer or equal to 1 character')
    assert(symbol.native.length <= 8, 'Symbol of the asset must be shorter or equal to 8 characters')
    assert(!this.totalSupply.hasValue, 'This method can be called only once')

    this.arc88_initialize_owner(new Address(Txn.sender)) // set the owner at start to initializer, at the end change it to the requested owner from parameter

    this.name.value = name
    this.symbol.value = symbol
    this.totalSupply.value = totalSupply
    this.decimals.value = decimals

    this.arc1594_issuable.value = new Bool(true)

    const sender = new Address(Txn.sender)
    this.balances(sender).value = totalSupply
    emit(new arc200_Transfer({ from: new Address(Global.zeroAddress), to: sender, value: totalSupply }))

    // clawback
    this.arc1644_controller.value = controller
    this.arc1644_controllable.value = controllable
    this.arc1644_requireJustification.value = requireJustification
    this.arc1644_lastControllerActionRound.value = new UintN64(0)
    this.arc1644_minControllerActionInterval.value = minControllerActionInterval

    if (Txn.sender !== owner.native) {
      this.arc88_transfer_ownership(owner)
    }

    return new Bool(true)
  }
}
