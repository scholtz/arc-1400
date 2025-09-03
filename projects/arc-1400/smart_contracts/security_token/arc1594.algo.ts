import { arc4, assert, BoxMap, emit, GlobalState, Txn } from '@algorandfoundation/algorand-typescript'
import { Arc1410 } from './arc1410.algo'

// Event structs
class arc1594_issue_event extends arc4.Struct<{ to: arc4.Address; amount: arc4.UintN256; data: arc4.DynamicBytes }> {}
class arc1594_redeem_event extends arc4.Struct<{
  from: arc4.Address
  amount: arc4.UintN256
  data: arc4.DynamicBytes
}> {}

export class Arc1594 extends Arc1410 {
  // Governance / control flags (owner via Arc88 acts as issuer)
  public halt = GlobalState<arc4.UintN64>({ key: 'hlt' }) // 1 = halted

  // Per-account compliance flags (simple model)
  public kyc = BoxMap<arc4.Address, arc4.UintN64>({ keyPrefix: 'kyc' }) // 1 = eligible
  public lockupUntil = BoxMap<arc4.Address, arc4.UintN64>({ keyPrefix: 'lku' }) // round number until which locked


  constructor() {
    super()
  }

  /* ------------------------- internal helpers ------------------------- */
  protected _onlyOwner(): void {
    assert(this.arc88_is_owner(new arc4.Address(Txn.sender)).native === true, 'only_owner')
  }

  /* ------------------------- admin / setup methods ------------------------- */
  @arc4.abimethod()
  public arc1594_set_halt(flag: arc4.UintN64): void {
    this._onlyOwner()
    this.halt.value = flag
  }

  @arc4.abimethod()
  public arc1594_set_kyc(account: arc4.Address, flag: arc4.UintN64): void {
    this._onlyOwner()
    this.kyc(account).value = flag
  }

  @arc4.abimethod()
  public arc1594_set_lockup(account: arc4.Address, round: arc4.UintN64): void {
    this._onlyOwner()
    this.lockupUntil(account).value = round
  }

  /* ------------------------- issuance / redemption ------------------------- */
  @arc4.abimethod()
  public arc1594_issue(to: arc4.Address, amount: arc4.UintN256, data: arc4.DynamicBytes): void {
    this._onlyOwner()
    assert(amount.native > 0n, 'invalid_amount')
    // Default/unrestricted partition (zero address) implicitly
    this.arc1410_issue_by_partition(to, new arc4.Address(), amount, data)
    emit('Issue', new arc1594_issue_event({ to, amount, data }))
  }

  @arc4.abimethod()
  public arc1594_redeemFrom(from: arc4.Address, amount: arc4.UintN256, data: arc4.DynamicBytes): void {
    const sender = new arc4.Address(Txn.sender)
    assert(sender === from || this.arc88_is_owner(sender).native === true, 'not_auth')
    assert(amount.native > 0n, 'invalid_amount')
    assert(this.balances(from).exists && this.balances(from).value.native >= amount.native, 'insufficient_balance')
    this.balances(from).value = new arc4.UintN256(this.balances(from).value.native - amount.native)
    this.totalSupply.value = new arc4.UintN256(this.totalSupply.value.native - amount.native)
    emit('Redeem', new arc1594_redeem_event({ from, amount, data }))
  }

  @arc4.abimethod()
  public arc1594_redeem(amount: arc4.UintN256, data: arc4.DynamicBytes): void {
    const from = new arc4.Address(Txn.sender)
    assert(amount.native > 0n, 'invalid_amount')
    assert(this.balances(from).exists && this.balances(from).value.native >= amount.native, 'insufficient_balance')
    this.balances(from).value = new arc4.UintN256(this.balances(from).value.native - amount.native)
    this.totalSupply.value = new arc4.UintN256(this.totalSupply.value.native - amount.native)
    emit('Redeem', new arc1594_redeem_event({ from, amount, data }))
  }

}
