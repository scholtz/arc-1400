import { arc4, assert, Box, BoxMap, emit, Global, Txn } from '@algorandfoundation/algorand-typescript'
import { Arc1594 } from './arc1594.algo'

// Document record struct
class arc1643_document_record extends arc4.Struct<{
  uri: arc4.Str
  hash: arc4.DynamicBytes
  timestamp: arc4.UintN64
}> {}

// Event structs
class arc1643_document_updated_event extends arc4.Struct<{
  name: arc4.DynamicBytes
  uri: arc4.Str
  hash: arc4.DynamicBytes
}> {}
class arc1643_document_removed_event extends arc4.Struct<{
  name: arc4.DynamicBytes
  uri: arc4.Str
  hash: arc4.DynamicBytes
}> {}

// Index box aggregates names (simple comma-separated list for minimal footprint)
export class Arc1643 extends Arc1594 {
  // Store each document keyed by name; enumeration extension left for future (index omitted for minimal profile)
  public documents = BoxMap<arc4.DynamicBytes, arc1643_document_record>({ keyPrefix: 'doc' })
  public documentKeys = Box<arc4.DynamicBytes[]>({ key: 'docs' })

  protected _onlyOwner() {
    assert(this.arc88_is_owner(new arc4.Address(Txn.sender)).native === true, 'only_owner')
  }

  /* ------------------------- methods ------------------------- */
  @arc4.abimethod()
  public arc1643_set_document(name: arc4.DynamicBytes, uri: arc4.Str, hash: arc4.DynamicBytes): void {
    this._onlyOwner()
    assert(name.bytes.length > 0, 'empty_name')
    const rec = new arc1643_document_record({ uri, hash, timestamp: new arc4.UintN64(Global.round) })
    this.documents(name).value = rec.copy()
    if (!this.documentKeys.exists) {
      this.documentKeys.value = [name]
    } else {
      this.documentKeys.value = [...this.documentKeys.value, name]
    }
    emit('DocumentUpdated', new arc1643_document_updated_event({ name, uri, hash }))
  }

  @arc4.abimethod({ readonly: true })
  public arc1643_get_document(name: arc4.DynamicBytes): arc1643_document_record {
    assert(this.documents(name).exists, 'not_found')
    return this.documents(name).value.copy()
  }

  @arc4.abimethod()
  public arc1643_remove_document(name: arc4.DynamicBytes): void {
    this._onlyOwner()
    assert(this.documents(name).exists, 'not_found')
    const prior = this.documents(name).value.copy()
    this.documents(name).delete()
    // TODO delete from the this.documentKeys.value array
    // for now the duplicate or deleted items may still be returned in get all documents endpoint
    emit('DocumentRemoved', new arc1643_document_removed_event({ name, uri: prior.uri, hash: prior.hash }))
  }

  @arc4.abimethod({ readonly: true })
  public arc1643_get_all_documents(): arc4.DynamicBytes[] {
    // Indexing removed; return empty (extension could add pagination)

    return this.documentKeys.value
  }
}
