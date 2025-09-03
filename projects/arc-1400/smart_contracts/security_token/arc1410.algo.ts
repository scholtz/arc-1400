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

export class Arc1410 extends Arc200 {
  public partitions = BoxMap<arc1410_PartitionKey, arc4.UintN256>({ keyPrefix: 'p' })
  public holderPartitionsCurrentPage = BoxMap<arc4.Address, arc4.UintN64>({ keyPrefix: 'hp_p' })
  public holderPartitionsAddresses = BoxMap<arc1410_HoldingPartitionsPaginatedKey, arc4.Address[]>({
    keyPrefix: 'hp_a',
  })

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
   * Transfer an amount of tokens from partition to receiver. If receiver has the particition with the same name registered, it will move to this partition. Otherwise basic receiver partition will be used.
   *
   * @param partition Sender partition
   * @param to Receiver address
   * @param amount Amount to transfer
   * @param data Additional data
   * @returns Receiver partition address
   */
  @arc4.abimethod()
  public arc1410_transfer_by_partition(
    partition: arc4.Address,
    to: arc4.Address,
    amount: arc4.UintN256,
    data: arc4.DynamicBytes,
  ): arc4.Address {
    let receiverPartition = this._receiverPartition(to, partition)
    this._transfer_partition(new arc4.Address(Txn.sender), partition, to, receiverPartition, amount, data)
    return receiverPartition
  }

  @arc4.abimethod()
  public arc1410_partitions_of(holder: arc4.Address, page: arc4.UintN64): arc4.Address[] {
    const key = new arc1410_HoldingPartitionsPaginatedKey({ holder: holder, page: page })
    if (!this.holderPartitionsAddresses(key).exists) return []
    return this.holderPartitionsAddresses(key).value
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
  protected _transfer_partition(
    sender: arc4.Address,
    senderPartition: arc4.Address,
    recipient: arc4.Address,
    recipientPartition: arc4.Address,
    amount: arc4.UintN256,
    data: arc4.DynamicBytes,
  ): void {
    // Implement partitioned transfer logic here
    var senderPartitionKey = new arc1410_PartitionKey({
      holder: sender,
      partition: senderPartition,
    })

    var recipientPartitionKey = new arc1410_PartitionKey({
      holder: recipient,
      partition: recipientPartition,
    })

    assert(this.partitions(senderPartitionKey).exists, 'Sender partition does not exist')
    assert(
      this.partitions(recipientPartitionKey).value.native >= amount.native,
      'Insufficient balance in sender partition',
    )

    this._add_participation_to_holder(recipient, recipientPartition)

    this.partitions(senderPartitionKey).value = new arc4.UintN256(
      this.partitions(recipientPartitionKey).value.native - amount.native,
    )

    if (!this.partitions(recipientPartitionKey).exists) {
      this.partitions(recipientPartitionKey).value = amount
    } else {
      this.partitions(recipientPartitionKey).value = new arc4.UintN256(
        amount.native + this.partitions(recipientPartitionKey).value.native,
      )
    }

    emit(
      new arc1410_partition_transfer({
        from: sender,
        to: recipient,
        partition: recipientPartition,
        amount: amount,
        data: data,
      }),
    )
  }
}
