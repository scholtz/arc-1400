import { arc4, assert, BoxMap, emit, Txn } from '@algorandfoundation/algorand-typescript'
import { Arc200 } from './arc200.algo'

// Define a struct for the event with named parameters
class arc1410_PartitionKey extends arc4.Struct<{
  holder: arc4.Address
  partition: arc4.Address
}> {}
// Define a struct for the event with named parameters
class arc1410_HoldingPartitionsPaginatedKey extends arc4.Struct<{
  holder: arc4.Address
  page: arc4.UintN64
}> {}

class arc1410_partition_transfer extends arc4.Struct<{
  from: arc4.Address
  to: arc4.Address
  partition: arc4.Address
  amount: arc4.UintN256
  data: arc4.DynamicBytes
}> {}

class arc1410_can_transfer_by_partition_return extends arc4.Struct<{
  code: arc4.Byte
  status: arc4.Str
  receiverPartition: arc4.Address
}> {}

// Operator struct (holder + operator + partition scope (0 address = all partitions))
class arc1410_OperatorKey extends arc4.Struct<{
  holder: arc4.Address
  operator: arc4.Address
  partition: arc4.Address
}> {}

// Portion operator struct (holder + operator + specific partition) -> remaining allowance amount
class arc1410_OperatorPortionKey extends arc4.Struct<{
  holder: arc4.Address
  operator: arc4.Address
  partition: arc4.Address
}> {}

export class Arc1410 extends Arc200 {
  public partitions = BoxMap<arc1410_PartitionKey, arc4.UintN256>({ keyPrefix: 'p' })
  public holderPartitionsCurrentPage = BoxMap<arc4.Address, arc4.UintN64>({ keyPrefix: 'hp_p' })
  public holderPartitionsAddresses = BoxMap<arc1410_HoldingPartitionsPaginatedKey, arc4.Address[]>({
    keyPrefix: 'hp_a',
  })
  public operators = BoxMap<arc1410_OperatorKey, arc4.Byte>({ keyPrefix: 'op' }) // value = 1 authorized
  public operatorPortionAllowances = BoxMap<arc1410_OperatorPortionKey, arc4.UintN256>({ keyPrefix: 'opa' })

  constructor() {
    super()
  }

  @arc4.abimethod({ readonly: true })
  public arc1410_balance_of_partition(holder: arc4.Address, partition: arc4.Address): arc4.UintN256 {
    const key = new arc1410_PartitionKey({
      holder: holder,
      partition: partition,
    })
    return this.partitions(key).value
  }

  @arc4.abimethod()
  public override arc200_transfer(to: arc4.Address, value: arc4.UintN256): arc4.Bool {
    this._transfer_partition(
      new arc4.Address(Txn.sender),
      new arc4.Address(),
      to,
      new arc4.Address(),
      value,
      new arc4.DynamicBytes(),
    )
    return this._transfer(new arc4.Address(Txn.sender), to, value)
  }
  /**
   * Transfer an amount of tokens from partition to receiver. Sender must be msg.sender or authorized operator.
   */
  @arc4.abimethod()
  public arc1410_transfer_by_partition(
    partition: arc4.Address,
    to: arc4.Address,
    amount: arc4.UintN256,
    data: arc4.DynamicBytes,
  ): arc4.Address {
    const sender = new arc4.Address(Txn.sender)
    // operator not needed if sender initiates, but if acting for another we would expose a different method
    let receiverPartition = this._receiverPartition(to, partition)
    this._transfer_partition(sender, partition, to, receiverPartition, amount, data)
    return receiverPartition
  }

  @arc4.abimethod()
  public arc1410_partitions_of(holder: arc4.Address, page: arc4.UintN64): arc4.Address[] {
    const key = new arc1410_HoldingPartitionsPaginatedKey({ holder: holder, page: page })
    if (!this.holderPartitionsAddresses(key).exists) return []
    return this.holderPartitionsAddresses(key).value
  }

  @arc4.abimethod({ readonly: true })
  public arc1410_is_operator(holder: arc4.Address, operator: arc4.Address, partition: arc4.Address): arc4.Bool {
    if (operator === holder) return new arc4.Bool(true)
    const specific = new arc1410_OperatorKey({ holder: holder, operator: operator, partition: partition })
    if (this.operators(specific).exists && this.operators(specific).value.native === 1) {
      return new arc4.Bool(true)
    }
    const globalKey = new arc1410_OperatorKey({ holder: holder, operator: operator, partition: new arc4.Address() })
    if (this.operators(globalKey).exists && this.operators(globalKey).value.native === 1) {
      return new arc4.Bool(true)
    }
    return new arc4.Bool(false)
  }

  @arc4.abimethod()
  public arc1410_authorize_operator(holder: arc4.Address, operator: arc4.Address, partition: arc4.Address): void {
    assert(new arc4.Address(Txn.sender) === holder, 'Only holder can authorize')
    const key = new arc1410_OperatorKey({ holder: holder, operator: operator, partition: partition })
    this.operators(key).value = new arc4.Byte(1)
  }

  @arc4.abimethod()
  public arc1410_revoke_operator(holder: arc4.Address, operator: arc4.Address, partition: arc4.Address): void {
    assert(new arc4.Address(Txn.sender) === holder, 'Only holder can revoke')
    const key = new arc1410_OperatorKey({ holder: holder, operator: operator, partition: partition })
    if (this.operators(key).exists) {
      this.operators(key).delete()
    }
  }

  @arc4.abimethod()
  public arc1410_operator_transfer_by_partition(
    from: arc4.Address,
    partition: arc4.Address,
    to: arc4.Address,
    amount: arc4.UintN256,
    data: arc4.DynamicBytes,
  ): arc4.Address {
    const sender = new arc4.Address(Txn.sender)
    // Check full operator right first
    let authorized = this.arc1410_is_operator(from, sender, partition).native === true
    let usedPortion = false
    if (!authorized) {
      // fallback to portion allowance
      const pKey = new arc1410_OperatorPortionKey({ holder: from, operator: sender, partition })
      if (this.operatorPortionAllowances(pKey).exists) {
        const remaining = this.operatorPortionAllowances(pKey).value
        assert(remaining.native >= amount.native, 'Portion allowance exceeded')
        authorized = true
        usedPortion = true
        // decrement
        this.operatorPortionAllowances(pKey).value = new arc4.UintN256(remaining.native - amount.native)
      }
    }
    assert(authorized, 'Not authorized operator')
    let receiverPartition = this._receiverPartition(to, partition)
    this._transfer_partition(from, partition, to, receiverPartition, amount, data)
    return receiverPartition
  }

  @arc4.abimethod()
  public arc1410_can_transfer_by_partition(
    from: arc4.Address,
    partition: arc4.Address,
    to: arc4.Address,
    amount: arc4.UintN256,
    data: arc4.DynamicBytes,
  ): arc1410_can_transfer_by_partition_return {
    if (!this._validPartition(from, partition)) {
      return new arc1410_can_transfer_by_partition_return({
        code: new arc4.Byte(0x50),
        status: new arc4.Str('Partition not exists'),
        receiverPartition: new arc4.Address(),
      })
    }
    if (
      this.partitions(new arc1410_PartitionKey({ holder: from, partition: partition })).value.native < amount.native
    ) {
      return new arc1410_can_transfer_by_partition_return({
        code: new arc4.Byte(0x52),
        status: new arc4.Str('Insufficient balance'),
        receiverPartition: new arc4.Address(),
      })
    }

    if (to === new arc4.Address()) {
      return new arc1410_can_transfer_by_partition_return({
        code: new arc4.Byte(0x57),
        status: new arc4.Str('Invalid receiver'),
        receiverPartition: new arc4.Address(),
      })
    }

    // Check operator authorization for readonly simulation if sender != from
    const senderAddr = new arc4.Address(Txn.sender)
    if (senderAddr !== from) {
      let authorized = this.arc1410_is_operator(from, senderAddr, partition).native === true
      if (!authorized) {
        const pKey = new arc1410_OperatorPortionKey({ holder: from, operator: senderAddr, partition })
        if (this.operatorPortionAllowances(pKey).exists) {
          const remaining = this.operatorPortionAllowances(pKey).value
          if (remaining.native >= amount.native) {
            authorized = true
          }
        }
      }
      if (!authorized) {
        return new arc1410_can_transfer_by_partition_return({
          code: new arc4.Byte(0x58),
          status: new arc4.Str('Operator not authorized'),
          receiverPartition: new arc4.Address(),
        })
      }
    }

    let receiverPartition = this._receiverPartition(to, partition)

    return new arc1410_can_transfer_by_partition_return({
      code: new arc4.Byte(0x51),
      status: new arc4.Str('Success'),
      receiverPartition: receiverPartition,
    })
  }
  /**
   * If receiver partition exists, return it. Otherwise, return the default partition.
   * @param receiver
   * @param partition
   * @returns
   */
  protected _receiverPartition(receiver: arc4.Address, partition: arc4.Address): arc4.Address {
    let receiverPartition = new arc4.Address()
    if (this.partitions(new arc1410_PartitionKey({ holder: receiver, partition: partition })).exists) {
      receiverPartition = partition
    }
    return receiverPartition
  }
  protected _validPartition(holder: arc4.Address, partition: arc4.Address): boolean {
    return this.partitions(new arc1410_PartitionKey({ holder: holder, partition: partition })).exists
  }
  protected containsAddress(a: arc4.Address[], x: arc4.Address): boolean {
    for (const v of a) {
      if (v === x) return true
    }
    return false
  }
  /**
   * Add a participation to a holder, creating a new page if needed
   * @param holder Holder
   * @param participation Participation address
   */
  protected _add_participation_to_holder(holder: arc4.Address, participation: arc4.Address): void {
    let page = new arc4.UintN64(0)
    if (!this.holderPartitionsCurrentPage(holder).exists) {
      this.holderPartitionsCurrentPage(holder).value = page
    }
    const lastPage = this.holderPartitionsCurrentPage(holder).value
    let found = false
    for (let curPage = page; curPage.native < lastPage.native; curPage = new arc4.UintN64(curPage.native + 1)) {
      const paginatedKey = new arc1410_HoldingPartitionsPaginatedKey({
        holder: holder,
        page: curPage,
      })
      if (!this.holderPartitionsAddresses(paginatedKey).exists) {
        this.holderPartitionsAddresses(paginatedKey).value = [participation]
      }

      if (this.containsAddress(this.holderPartitionsAddresses(paginatedKey).value, participation)) {
        found = true
        break
      }
    }
    if (!found) {
      const paginatedKey = new arc1410_HoldingPartitionsPaginatedKey({
        holder: holder,
        page: lastPage,
      })
      const itemsCount = new arc4.UintN64(this.holderPartitionsAddresses(paginatedKey).value.length)
      if (itemsCount.native < 10) {
        // reuse the same box, otherwise iterate to new page box
        this.holderPartitionsAddresses(paginatedKey).value = [
          ...this.holderPartitionsAddresses(paginatedKey).value,
          participation,
        ]
      } else {
        const newLastPage = new arc4.UintN64(lastPage.native + 1)
        this.holderPartitionsCurrentPage(holder).value = newLastPage
        const newPaginatedKey = new arc1410_HoldingPartitionsPaginatedKey({
          holder: holder,
          page: newLastPage,
        })
        this.holderPartitionsAddresses(newPaginatedKey).value = [participation]
      }
    }
  }

  /**
   * Internal transfer function with partition support
   * @param from Sender address
   * @param fromPartition Sender partition
   * @param to Receiver address
   * @param toPartition Receiver partition
   * @param amount Transfer amount
   * @param data Transfer data
   */
  protected _transfer_partition(
    from: arc4.Address,
    fromPartition: arc4.Address,
    to: arc4.Address,
    toPartition: arc4.Address,
    amount: arc4.UintN256,
    data: arc4.DynamicBytes,
  ): void {
    assert(amount.native > 0, 'Invalid amount')
    // 1. Deduct from sender partition
    const fromKey = new arc1410_PartitionKey({ holder: from, partition: fromPartition })
    if (!this.partitions(fromKey).exists) {
      this.partitions(fromKey).value = new arc4.UintN256(0)
    }
    this.partitions(fromKey).value = new arc4.UintN256(this.partitions(fromKey).value.native - amount.native)

    // 2. Emit transfer event
    emit(
      'Transfer',
      new arc1410_partition_transfer({
        from: from,
        to: to,
        partition: fromPartition,
        amount: amount,
        data: data,
      }),
    )

    // 3. Add participation if new receiver partition
    if (toPartition !== fromPartition) {
      this._add_participation_to_holder(to, toPartition)
    }

    // 4. Credit to receiver partition
    const toKey = new arc1410_PartitionKey({ holder: to, partition: toPartition })
    if (!this.partitions(toKey).exists) {
      this.partitions(toKey).value = new arc4.UintN256(0)
    }
    this.partitions(toKey).value = new arc4.UintN256(this.partitions(toKey).value.native + amount.native)
  }

  @arc4.abimethod()
  public arc1410_authorize_operator_by_portion(
    holder: arc4.Address,
    operator: arc4.Address,
    partition: arc4.Address,
    amount: arc4.UintN256,
  ): void {
    assert(new arc4.Address(Txn.sender) === holder, 'Only holder can authorize portion')
    const key = new arc1410_OperatorPortionKey({ holder, operator, partition })
    this.operatorPortionAllowances(key).value = amount
  }

  @arc4.abimethod({ readonly: true })
  public arc1410_is_operator_by_portion(
    holder: arc4.Address,
    operator: arc4.Address,
    partition: arc4.Address,
  ): arc4.Bool {
    if (operator === holder) return new arc4.Bool(true)
    const key = new arc1410_OperatorPortionKey({ holder, operator, partition })
    if (!this.operatorPortionAllowances(key).exists) return new arc4.Bool(false)
    return new arc4.Bool(this.operatorPortionAllowances(key).value.native > 0)
  }
}
