import { arc4, assert, GlobalState, emit, Txn, Global } from '@algorandfoundation/algorand-typescript'
import { Arc1594 } from './arc1594.algo'

// Events (follow ARC-1644 doc tags conceptually; actual tag auto-derived by framework label)
class arc1644_controller_transfer_event extends arc4.Struct<{
  controller: arc4.Address
  from: arc4.Address
  to: arc4.Address
  amount: arc4.UintN256
  code: arc4.Byte
  data: arc4.DynamicBytes
  operator_data: arc4.DynamicBytes
}> {}
class arc1644_controller_redeem_event extends arc4.Struct<{
  controller: arc4.Address
  from: arc4.Address
  amount: arc4.UintN256
  code: arc4.Byte
  operator_data: arc4.DynamicBytes
}> {}
class arc1644_controller_changed_event extends arc4.Struct<{ old: arc4.Address; neu: arc4.Address }> {}

// Reason code bytes
const CODE_UNAUTHORIZED = new arc4.Byte(0x50)
const CODE_SUCCESS = new arc4.Byte(0x51)
const CODE_CONTROLLER_DISABLED = new arc4.Byte(0x51)
const CODE_JUSTIFICATION_REQUIRED = new arc4.Byte(0x52)

export class Arc1644 extends Arc1594 {
  // Controller address (single-controller base). If unset, controllable = false.
  public controller = GlobalState<arc4.Address>({ key: 'ctrl' })
  public controllable = GlobalState<arc4.Bool>({ key: 'ctrlen' })
  public requireJustification = GlobalState<arc4.Bool>({ key: 'rjust' })
  public lastControllerActionRound = GlobalState<arc4.UintN64>({ key: 'lcar' }) // optional rate limit tracking
  public minControllerActionInterval = GlobalState<arc4.UintN64>({ key: 'mcai' })

  constructor() {
    super()
  }

  /* ----------------------- internal helpers ----------------------- */
  protected _onlyOwner(): void {
    assert(this.arc88_is_owner(new arc4.Address(Txn.sender)).native === true, 'only_owner')
  }

  protected _onlyController(): void {
    assert(this.controller.hasValue, 'no_controller')
    assert(new arc4.Address(Txn.sender) === this.controller.value, 'not_controller')
    assert(this.controllable.hasValue && this.controllable.value.native === true, 'controller_disabled')
  }

  protected _checkJustification(operator_data: arc4.DynamicBytes): void {
    if (this.requireJustification.hasValue && this.requireJustification.value.native === true) {
      assert(operator_data.native.length > 0, 'justification_required')
    }
  }

  protected _rateLimit(): void {
    if (this.minControllerActionInterval.hasValue && this.minControllerActionInterval.value.native > 0n) {
      if (this.lastControllerActionRound.hasValue) {
        const last = this.lastControllerActionRound.value.native
        const minGap = this.minControllerActionInterval.value.native
        const current = new arc4.UintN64(Global.round).native
        assert(current >= last + minGap, 'rate_limited')
      }
      this.lastControllerActionRound.value = new arc4.UintN64(Global.round)
    }
  }

  /* -------------------- governance extension methods -------------------- */
  @arc4.abimethod()
  public arc1644_set_controller(new_controller: arc4.Address): void {
    this._onlyOwner()
    const old = this.controller.hasValue ? this.controller.value : new arc4.Address()
    this.controller.value = new_controller
    if (!this.controllable.hasValue) {
      this.controllable.value = new arc4.Bool(true)
    }
    emit('ControllerChanged', new arc1644_controller_changed_event({ old, neu: new_controller }))
  }

  @arc4.abimethod()
  public arc1644_set_controllable(flag: arc4.Bool): void {
    this._onlyOwner()
    // Irreversible disable if set false
    if (flag.native === false) {
      this.controllable.value = flag
    } else {
      // allow enabling only if previously unset or true (idempotent)
      if (!this.controllable.hasValue || this.controllable.value.native === true) {
        this.controllable.value = flag
      }
    }
  }

  @arc4.abimethod()
  public arc1644_set_require_justification(flag: arc4.Bool): void {
    this._onlyOwner()
    this.requireJustification.value = flag
  }

  @arc4.abimethod()
  public arc1644_set_min_action_interval(interval: arc4.UintN64): void {
    this._onlyOwner()
    this.minControllerActionInterval.value = interval
  }

  /* ------------------------ base required methods ------------------------ */
  @arc4.abimethod({ readonly: true })
  public arc1644_is_controllable(): arc4.UintN64 {
    if (this.controllable.hasValue && this.controllable.value.native === true && this.controller.hasValue) {
      return new arc4.UintN64(1n)
    }
    return new arc4.UintN64(0n)
  }

  @arc4.abimethod()
  public arc1644_controller_transfer(
    from: arc4.Address,
    to: arc4.Address,
    amount: arc4.UintN256,
    data: arc4.DynamicBytes,
    operator_data: arc4.DynamicBytes,
  ): arc4.UintN64 {
    this._onlyController()
    this._checkJustification(operator_data)
    this._rateLimit()
    // Perform forced transfer using internal ARC-200 transfer logic by moving balances directly
    assert(from !== to, 'same_addr')
    const fromBal = this._balanceOf(from)
    assert(fromBal.native >= amount.native, 'insufficient')
    // mutate balances directly (bypass allowance / sender requirement)
    this.balances(from).value = new arc4.UintN256(fromBal.native - amount.native)
    const toBal = this._balanceOf(to)
    this.balances(to).value = new arc4.UintN256(toBal.native + amount.native)
    const code = CODE_SUCCESS
    emit(
      'ControllerTransfer',
      new arc1644_controller_transfer_event({
        controller: new arc4.Address(Txn.sender),
        from,
        to,
        amount,
        code,
        data,
        operator_data,
      }),
    )
    return new arc4.UintN64(code.native)
  }

  @arc4.abimethod()
  public arc1644_controller_redeem(
    from: arc4.Address,
    amount: arc4.UintN256,
    operator_data: arc4.DynamicBytes,
  ): arc4.UintN64 {
    this._onlyController()
    this._checkJustification(operator_data)
    this._rateLimit()
    const fromBal = this._balanceOf(from)
    assert(fromBal.native >= amount.native, 'insufficient')
    this.balances(from).value = new arc4.UintN256(fromBal.native - amount.native)
    this.totalSupply.value = new arc4.UintN256(this.totalSupply.value.native - amount.native)
    const code = CODE_SUCCESS
    emit(
      'ControllerRedeem',
      new arc1644_controller_redeem_event({
        controller: new arc4.Address(Txn.sender),
        from,
        amount,
        code,
        operator_data,
      }),
    )
    return new arc4.UintN64(code.native)
  }
}
