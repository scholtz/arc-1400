import { arc4, assert, Contract, emit, Global, GlobalState, Txn } from '@algorandfoundation/algorand-typescript'

// Events
class arc88_OwnershipTransferred extends arc4.Struct<{ previous_owner: arc4.Address; new_owner: arc4.Address }> {}
class arc88_OwnershipRenounced extends arc4.Struct<{ previous_owner: arc4.Address }> {}
class arc88_OwnershipTransferRequested extends arc4.Struct<{
  previous_owner: arc4.Address
  pending_owner: arc4.Address
}> {}
class arc88_OwnershipTransferAccepted extends arc4.Struct<{ previous_owner: arc4.Address; new_owner: arc4.Address }> {}

/**
 * ARC-88 Ownable Access Control
 * Default owner = application creator unless overridden by arc88_initialize_owner in creation group.
 */
export class Arc88 extends Contract {
  public owner = GlobalState<arc4.Address>({ key: 'arc88_o' })
  public pendingOwner = GlobalState<arc4.Address>({ key: 'arc88_po' }) // optional two-step
  public initialized = GlobalState<arc4.Byte>({ key: 'arc88_oi' }) // 1 if initialized (explicit or implicit)

  constructor() {
    super()
  }

  /** Internal helper to lazily set default owner to creator if not initialized */
  protected _ensureDefaultOwner(): void {
    if (!this.initialized.hasValue || this.initialized.value.native === 0) {
      if (!this.owner.hasValue) {
        this.owner.value = new arc4.Address(Global.creatorAddress)
      }
      this.initialized.value = new arc4.Byte(1)
    }
  }

  @arc4.abimethod({ readonly: true })
  public arc88_owner(): arc4.Address {
    this._ensureDefaultOwner()
    return this.owner.value
  }

  @arc4.abimethod({ readonly: true })
  public arc88_is_owner(query: arc4.Address): arc4.Bool {
    this._ensureDefaultOwner()
    if (!this.owner.hasValue) return new arc4.Bool(false)
    if (this.owner.value === new arc4.Address()) return new arc4.Bool(false)
    return new arc4.Bool(this.owner.value === query)
  }

  /** Explicit initialization override (creation group recommended). Fails if already initialized. */
  @arc4.abimethod()
  public arc88_initialize_owner(new_owner: arc4.Address): void {
    assert(!(this.initialized.hasValue && this.initialized.value.native === 1), 'already_initialized')
    assert(new_owner !== new arc4.Address(), 'zero_address_not_allowed')
    this.owner.value = new_owner
    this.initialized.value = new arc4.Byte(1)
  }

  @arc4.abimethod()
  public arc88_transfer_ownership(new_owner: arc4.Address): void {
    this._ensureDefaultOwner()
    assert(new arc4.Address(Txn.sender) === this.owner.value, 'not_owner')
    assert(new_owner !== new arc4.Address(), 'zero_address_not_allowed')
    const previous = this.owner.value
    this.owner.value = new_owner
    emit(new arc88_OwnershipTransferred({ previous_owner: previous, new_owner }))
  }

  @arc4.abimethod()
  public arc88_renounce_ownership(): void {
    this._ensureDefaultOwner()
    assert(new arc4.Address(Txn.sender) === this.owner.value, 'not_owner')
    const previous = this.owner.value
    this.owner.value = new arc4.Address()
    emit(new arc88_OwnershipRenounced({ previous_owner: previous }))
  }

  // Optional Two-Step Ownership Pattern
  @arc4.abimethod()
  public arc88_transfer_ownership_request(pending: arc4.Address): void {
    this._ensureDefaultOwner()
    assert(new arc4.Address(Txn.sender) === this.owner.value, 'not_owner')
    assert(pending !== new arc4.Address(), 'zero_address_not_allowed')
    if (this.pendingOwner.hasValue && this.pendingOwner.value !== new arc4.Address()) {
      assert(false, 'pending_transfer_exists')
    }
    this.pendingOwner.value = pending
    emit(new arc88_OwnershipTransferRequested({ previous_owner: this.owner.value, pending_owner: pending }))
  }

  @arc4.abimethod()
  public arc88_accept_ownership(): void {
    this._ensureDefaultOwner()
    assert(this.pendingOwner.hasValue, 'not_pending_owner')
    const sender = new arc4.Address(Txn.sender)
    assert(sender === this.pendingOwner.value, 'not_pending_owner')
    const previous = this.owner.value
    this.owner.value = sender
    this.pendingOwner.value = new arc4.Address()
    emit(new arc88_OwnershipTransferAccepted({ previous_owner: previous, new_owner: sender }))
    emit(new arc88_OwnershipTransferred({ previous_owner: previous, new_owner: sender }))
  }

  @arc4.abimethod()
  public arc88_cancel_ownership_request(): void {
    this._ensureDefaultOwner()
    assert(new arc4.Address(Txn.sender) === this.owner.value, 'not_owner')
    this.pendingOwner.value = new arc4.Address()
  }
}
