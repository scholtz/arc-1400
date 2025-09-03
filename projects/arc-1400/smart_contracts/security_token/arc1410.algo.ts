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

export class Arc1410 extends Arc200 {
  public partitions = BoxMap<arc1410_PartitionKey, arc4.UintN256>({ keyPrefix: 'p' })
  public holderPartitionsCurrentPage = BoxMap<arc4.Address, arc4.UintN64>({ keyPrefix: 'hp_p' })
  public holderPartitionsAddresses = BoxMap<arc1410_HoldingPartitionsPaginatedKey, arc4.Address[]>({
    keyPrefix: 'hp_a',
  })

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

  @arc4.abimethod()
  public arc1410_transfer_by_partition(
    partition: arc4.Address,
    to: arc4.Address,
    amount: arc4.UintN256,
    data: arc4.DynamicBytes,
  ): void {
    this._transfer_partition(new arc4.Address(Txn.sender), partition, to, new arc4.Address(), amount, data)
  }

  @arc4.abimethod()
  public arc1410_partitions_of(holder: arc4.Address, page: arc4.UintN64): arc4.Address[] {
    const key = new arc1410_HoldingPartitionsPaginatedKey({ holder: holder, page: page })
    if (!this.holderPartitionsAddresses(key).exists) return []
    return this.holderPartitionsAddresses(key).value
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
